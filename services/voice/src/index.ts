// Voice service entrypoint. Boots even when Twilio / OpenAI / Supabase are not
// configured yet (see env.ts) so it can be deployed and health-checked first.
// On SIGTERM it stops accepting new calls but lets live calls finish (up to
// the Railway draining window) before exiting.
import { loadClubFacts } from './facts.js'
import { loadEnv } from './env.js'
import { createDb } from './crm.js'
import { createOpenAiClient } from './llm.js'
import { log } from './log.js'
import { createVoiceServer } from './server.js'

let env
try {
  env = loadEnv(process.env)
} catch (e) {
  console.error(`[voice] ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}

const db = createDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const llm = env.OPENAI_API_KEY ? createOpenAiClient(env.OPENAI_API_KEY) : null
const { server, wss, live } = createVoiceServer({ env, db, llm })

// Warm the club facts cache so the first call's speech hints include event names;
// refreshed every 10 minutes (each call also refreshes it when stale).
const warmFacts = () => void loadClubFacts(db).catch(() => {})
warmFacts()
setInterval(warmFacts, 10 * 60 * 1000).unref()

server.listen(env.PORT, '0.0.0.0', () => {
  log.info('listening', { port: env.PORT, ready: env.missing.length === 0, model: env.VOICE_OPENAI_MODEL })
  if (env.missing.length) log.warn('not_configured', { missing: env.missing.join(',') })
})

let shuttingDown = false
function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  log.info('shutdown', { signal, activeCalls: live.size })
  // Stop new HTTP/WS connections; existing calls keep their sockets.
  server.close()
  const deadline = Date.now() + 25_000
  const tick = setInterval(() => {
    if (live.size === 0 || Date.now() > deadline) {
      clearInterval(tick)
      for (const ws of wss.clients) ws.close(1001, 'shutting down')
      setTimeout(() => process.exit(0), 1_500).unref()
    }
  }, 500)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', (err) => log.error('unhandled_rejection', err))
