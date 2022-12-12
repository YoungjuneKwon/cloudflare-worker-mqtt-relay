const RelayServer = require('./src/relay-server')

const port = process.argv[2] || 3000
console.log(`server listen on port ${port}`)
new RelayServer({ port }).start()
