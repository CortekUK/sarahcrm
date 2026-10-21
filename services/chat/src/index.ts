// Chat service entrypoint: one HTTP server shared by Express (REST) and
// Socket.IO (realtime). Railway sends SIGTERM on redeploy — we close sockets
// first so clients reconnect to the new instance, then stop HTTP.
import { createServer } from 'node:http'
import express from 'express'
import cors, { type CorsOptions } from 'cors'
import { Server } from 'socket.io'
import { env } from './env.js'
import { log } from './log.js'
import { buildRouter, notFoundHandler, onError } from './routes/index.js'
import { setupSocket } from './socket.js'
import { setIo, type ChatIo } from './realtime.js'

const allowAll = env.allowedOrigins.includes('*')
const originCheck: CorsOptions['origin'] = (origin, cb) => {
  // No Origin header = server-to-server / curl / healthcheck.
  if (!origin || allowAll || env.allowedOrigins.includes(origin.replace(/\/$/, ''))) return cb(null, true)
  cb(null, false)
}

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(cors({ origin: originCheck, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], maxAge: 600 }))
app.use(express.json({ limit: '100kb' }))
app.use(buildRouter())
app.use(notFoundHandler)
app.use(onError)

const server = createServer(app)
const io: ChatIo = new Server(server, {
  cors: { origin: originCheck, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 256 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
})
setIo(io)
setupSocket(io)

server.listen(env.PORT, '0.0.0.0', () => {
  log.info('listening', { port: env.PORT, origins: env.allowedOrigins.length })
})

let shuttingDown = false
function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  log.info('shutdown', { signal })
  const force = setTimeout(() => process.exit(0), 10_000)
  force.unref()
  // io.close() disconnects every socket and also closes the attached http server.
  io.close(() => {
    server.close(() => process.exit(0))
    if (!server.listening) process.exit(0)
  })
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', (err) => log.error('unhandled_rejection', err))
