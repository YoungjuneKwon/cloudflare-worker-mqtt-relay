const { RelayServer, asyncWaitFor } = require('../index')
const { WebSocket } = require("ws")

const mqttConfig = {
  host: 'test.mosquitto.org',
  port: 1884,
  username: 'rw',
  password: 'readwrite'
}

test("sample websocket", async () => {
  const relayServer = new RelayServer({ port: 3000 })
  await relayServer.start()
  const ctx = {opened: false}
  const ws = new WebSocket('ws://localhost:3000/relay')
  ws.onopen = () => { ctx.opened = true }
  ws.onmessage = e => {
    const data = JSON.parse(e.data)
    if (data.type === 'response') {
      ctx.lastResponse = data
    } else if (data.type === 'message') {
      ctx.lastMessage = data
    }
  }
  await asyncWaitFor(() => ctx.opened)

  const topic = `test-${Math.random()}`
  ws.send(JSON.stringify({command: 'subscribe', ...mqttConfig, topic}))
  await asyncWaitFor(() => ctx.lastResponse)
  expect(ctx.lastResponse.result).toBe('ok')

  const message = {hello: 'world'}
  ws.send(JSON.stringify({command: 'publish', ...mqttConfig, topic, message}))
  await asyncWaitFor(() => ctx.lastMessage)
  expect(JSON.stringify(ctx.lastMessage)).toBe(JSON.stringify({type: 'message', message}))
  
  ws.close()
  await relayServer.close()
})