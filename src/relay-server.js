const { WebSocketServer } = require("ws")
const mqtt = require('mqtt')
const { asyncWaitFor } = require('./utils')

class RelayServer {
  constructor({ port }) {
    this.config = { port }
    this.mqttPool = {}
  }

  async start () {
    this.wss = new WebSocketServer({ port: this.config.port, path: '/relay' })
    this.wss.on("connection", ws => { new RelayHandler(ws, this) })
  }

  close () {
    Object.values(this.mqttPool).forEach(ctx => ctx.client.end())
    return new Promise(r => this.wss.close(r))
  }

  async getMqttContext ({host, port, username, password}) {
    const key = `${username}:${password}@${host}:${port}`
    if (!this.mqttPool[key]) {
      this.mqttPool[key] = await this.initMqttClient({host, port, username, password})
    }
    return this.mqttPool[key]
  }

  async initMqttClient ({ host, port, username, password} ) {
    const ctx = { connected: false, handlers: {} }
    const client = mqtt.connect({servers: [{host, port}], username, password})
    client.on('connect', () => { ctx.connected = true })
    client.on('message', (topic, message) => {
      (ctx.handlers[topic] || []).forEach(h => h.onMqttMessage(message.toString()))
    })
    ctx.client = client
    await asyncWaitFor(() => ctx.connected)
    return ctx
  }
}

class RelayHandler {
  constructor (ws, relayServer) {
    this.ws = ws
    this.relayServer = relayServer
    this.ws.on("message", (message) => { this.onWsMessage(message) })
    this.ws.on('close', () => { this.onWsClose() })
    this.usingMqtts = new Set()
  }

  onWsMessage (message) {
    const body = JSON.parse(message)
    const cmdMap = {
      subscribe: p => this.subscribe(p),
      publish: p => this.publish(p)
    }
    cmdMap[body.command](body)
  }

  onWsClose () {
    this.clearHandlers()
    this.ws.close()
  }

  send (data) {
    this.ws.send(JSON.stringify(data))
  }

  onMqttMessage (message) {
    this.send({type: 'message', message: JSON.parse(message)})
  }

  async getMqttContext(body) {
    const ctx = await this.relayServer.getMqttContext(body)
    this.usingMqtts.add(ctx)
    return ctx
  }

  async subscribe (body) {
    const ctx = await this.getMqttContext(body)
    if ((ctx.handlers[body.topic] || []).indexOf(this) < 0) {
      ctx.client.subscribe(body.topic)
      ctx.handlers[body.topic] = ctx.handlers[body.topic] || []
      ctx.handlers[body.topic].push(this)
    }
    this.send({type: 'response', result: 'ok'})
  }

  async publish (body) {
    const ctx = await this.getMqttContext(body)
    ctx.client.publish(body.topic, JSON.stringify(body.message))
    this.send({type: 'response', result: 'ok'})
  }

  clearHandlers () {
    this.usingMqtts.forEach(ctx => {
      Object.keys(ctx.handlers).forEach(topic => {
        const index = ctx.handlers[topic].indexOf(this)
        if (index >= 0) {
          ctx.handlers[topic].splice(index, 1)
          if (ctx.handlers[topic].length === 0) {
            delete ctx.handlers[topic]
            ctx.client.unsubscribe(topic)
          }
        }
      })
    })
  }
}

module.exports = RelayServer