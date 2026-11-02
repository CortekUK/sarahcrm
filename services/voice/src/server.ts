// HTTP + WebSocket server. createVoiceServer() takes its dependencies so tests
// can run it on an ephemeral port with a fake LLM / no database.
//
//   GET  /health               — liveness + which settings are missing
//   POST /voice/incoming       — Twilio Voice webhook → ConversationRelay TwiML
//   POST /voice/connect-action — <Connect action>: relay session ended
//   POST /voice/status         — call status callback (completed/failed/…)
//   WS   /relay                — ConversationRelay session (one per call)
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import express, { type Request, type Response } from 'express'
import { WebSocketServer, type WebSocket } from 'ws'
import type { VoiceEnv } from './env.js'
import { insertCallStart, mapCallStatus, matchCaller, updateCallStatus, type Db } from './crm.js'
import { cachedEventHints, loadClubFacts } from './facts.js'
import { finalizeCall, isFinalizing } from './finalize.js'
import type { LlmClient } from './llm.js'
import { log, maskPhone } from './log.js'
import { normaliseE164 } from './phone.js'
import { buildCallContext } from './prompt.js'
import { CallSession } from './session.js'
import { checkSignature, relayUrls, webhookUrl, type RequestValidator } from './signature.js'
import { buildHangupTwiml, buildRecognitionHints, buildRelayTwiml, buildSayHangupTwiml, welcomeGreeting } from './twiml.js'
import { NO_MATCH, type CallerMatch } from './types.js'

export interface VoiceDeps {
  env: VoiceEnv
  db: Db | null
  llm: LlmClient | null
  validator?: RequestValidator
  now?: () => Date
  /** Delay before a status callback finalizes a call that never reached the relay. */
  orphanFinalizeDelayMs?: number
  endDelayMs?: (chars: number) => number
}

interface LiveCall {
  session: CallSession
  match: Promise<CallerMatch>
  from: string | null
  to: string | null
}

const UNAVAILABLE_LINE =
  "Thank you for calling The Club by Sarah Restrick. I'm afraid our phone assistant is unavailable at the moment. Please do call back a little later. Goodbye."
const RELAY_FAILED_LINE =
  "I'm so sorry, we're having a technical problem with this line. Please call back a little later, and a member of the team will be happy to help. Goodbye."

export function createVoiceServer(deps: VoiceDeps): { app: express.Express; server: Server; wss: WebSocketServer; live: Map<string, LiveCall> } {
  const { env } = deps
  const now = deps.now ?? (() => new Date())
  const live = new Map<string, LiveCall>()
  /** CallSids we answered with relay TwiML in the last 10 min (WS defence-in-depth). */
  const expected = new Map<string, number>()

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(express.urlencoded({ extended: false, limit: '64kb' }))

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'voice',
      ready: env.missing.length === 0,
      missing: env.missing,
      activeCalls: live.size,
      model: env.VOICE_OPENAI_MODEL,
    })
  })

  /** Shared guard for Twilio webhooks. Returns false (and responds) when rejected. */
  function guardTwilio(req: Request, res: Response): boolean {
    if (!env.publicUrl || !env.TWILIO_AUTH_TOKEN) {
      const missing = ['VOICE_PUBLIC_URL', 'TWILIO_AUTH_TOKEN'].filter((k) => env.missing.includes(k))
      log.error('webhook_not_configured', undefined, { missing: missing.join(',') })
      res.status(503).type('text/plain').send(`Voice service not configured: missing ${missing.join(', ')}`)
      return false
    }
    if (!env.VOICE_VALIDATE_SIGNATURE) return true
    const result = checkSignature({
      authToken: env.TWILIO_AUTH_TOKEN,
      signature: req.header('x-twilio-signature') ?? undefined,
      urls: [webhookUrl(env.publicUrl, req.originalUrl)],
      params: (req.body ?? {}) as Record<string, unknown>,
      validator: deps.validator,
    })
    if (!result.ok) {
      log.warn('webhook_signature_rejected', { path: req.path, reason: result.reason })
      res.status(403).type('text/plain').send('Invalid Twilio signature')
      return false
    }
    return true
  }

  app.post('/voice/incoming', async (req, res) => {
    if (!guardTwilio(req, res)) return
    const body = (req.body ?? {}) as Record<string, string | undefined>
    const callSid = body.CallSid
    if (!callSid) {
      res.status(400).type('text/plain').send('Missing CallSid')
      return
    }
    // When Twilio places the call (e.g. a test call to a team phone), the person
    // on the line is `To`; our number is `From`.
    const outbound = (body.Direction ?? '').startsWith('outbound')
    const personRaw = outbound ? body.To : body.From
    const ourRaw = outbound ? body.From : body.To
    const from = normaliseE164(personRaw) ?? null
    const to = normaliseE164(ourRaw) ?? ourRaw ?? null
    log.info('call_incoming', { callSid, from: maskPhone(from), direction: outbound ? 'outbound' : 'inbound' })

    if (deps.db) {
      void insertCallStart(deps.db, { callSid, from: from ?? personRaw ?? null, to, direction: outbound ? 'outbound' : 'inbound' })
    }

    if (!deps.llm || !env.relayUrl) {
      log.error('call_unavailable', undefined, { callSid, missing: env.missing.join(',') })
      res.type('text/xml').send(buildSayHangupTwiml(UNAVAILABLE_LINE))
      return
    }

    expected.set(callSid, Date.now())
    for (const [sid, at] of expected) if (Date.now() - at > 10 * 60 * 1000) expected.delete(sid)

    res.type('text/xml').send(
      buildRelayTwiml({
        relayUrl: env.relayUrl,
        actionUrl: `${env.publicUrl}/voice/connect-action`,
        welcomeGreeting: welcomeGreeting(now()),
        language: env.VOICE_LANGUAGE,
        ttsProvider: env.VOICE_TTS_PROVIDER,
        voice: env.VOICE_TTS_VOICE,
        transcriptionProvider: env.VOICE_TRANSCRIPTION_PROVIDER,
        speechModel: env.VOICE_SPEECH_MODEL ?? null,
        hints: buildRecognitionHints(cachedEventHints()),
        parameters: { callSid, from: from ?? personRaw ?? '' },
      }),
    )
  })

  app.post('/voice/connect-action', (req, res) => {
    if (!guardTwilio(req, res)) return
    const body = (req.body ?? {}) as Record<string, string | undefined>
    log.info('relay_session_ended', {
      callSid: body.CallSid,
      sessionStatus: body.SessionStatus,
      errorCode: body.ErrorCode,
    })
    if (body.SessionStatus === 'failed') {
      res.type('text/xml').send(buildSayHangupTwiml(RELAY_FAILED_LINE))
      return
    }
    res.type('text/xml').send(buildHangupTwiml())
  })

  app.post('/voice/status', async (req, res) => {
    if (!guardTwilio(req, res)) return
    const body = (req.body ?? {}) as Record<string, string | undefined>
    const callSid = body.CallSid
    if (!callSid) {
      res.status(400).type('text/plain').send('Missing CallSid')
      return
    }
    const status = mapCallStatus(body.CallStatus)
    const duration = body.CallDuration && /^\d+$/.test(body.CallDuration) ? Number(body.CallDuration) : null
    log.info('call_status', { callSid, status, duration: duration ?? undefined })
    res.status(204).end()

    if (!deps.db) return
    await updateCallStatus(deps.db, callSid, status, duration)
    if (status === 'ringing' || status === 'in_progress') return
    // A call that never reached (or already left) the relay: finalize from the DB alone.
    const delay = deps.orphanFinalizeDelayMs ?? 5_000
    setTimeout(() => {
      if (live.has(callSid) || isFinalizing(callSid)) return
      void finalizeCall(
        { callSid, snapshot: null, match: null, twilioStatus: status, from: normaliseE164(body.From) ?? body.From ?? null, to: body.To ?? null },
        { db: deps.db, llm: deps.llm, summaryModel: env.summaryModel, now },
      ).catch((e) => log.error('orphan_finalize_failed', e, { callSid }))
    }, delay).unref?.()
  })

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' })
  })

  const server = createServer(app)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? '').split('?')[0]
    if (path !== '/relay') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }
    if (!env.publicUrl || !env.TWILIO_AUTH_TOKEN || !deps.llm) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
      socket.destroy()
      return
    }
    if (env.VOICE_VALIDATE_SIGNATURE) {
      const sig = req.headers['x-twilio-signature']
      const result = checkSignature({
        authToken: env.TWILIO_AUTH_TOKEN,
        signature: Array.isArray(sig) ? sig[0] : sig,
        urls: relayUrls(env.publicUrl, req.url ?? '/relay'),
        validator: deps.validator,
      })
      if (!result.ok) {
        log.warn('relay_signature_rejected', { reason: result.reason })
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
        socket.destroy()
        return
      }
    }
    wss.handleUpgrade(req, socket, head, (ws) => onRelayConnection(ws))
  })

  function onRelayConnection(ws: WebSocket) {
    let call: LiveCall | null = null
    let callSid: string | null = null
    const setupTimer = setTimeout(() => {
      if (!call) {
        log.warn('relay_no_setup')
        ws.close(1008, 'setup expected')
      }
    }, 10_000)
    setupTimer.unref?.()

    ws.on('message', (data) => {
      const raw = data.toString()
      if (!call) {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(raw) as Record<string, unknown>
        } catch {
          return
        }
        if (msg.type !== 'setup' || typeof msg.callSid !== 'string') return
        const sid = msg.callSid
        if (env.VOICE_VALIDATE_SIGNATURE && !expected.has(sid)) {
          // Signed handshake but a CallSid we never answered — refuse.
          log.warn('relay_unexpected_call', { callSid: sid })
          ws.close(1008, 'unknown call')
          return
        }
        if (live.has(sid)) {
          ws.close(1008, 'duplicate session')
          return
        }
        expected.delete(sid)
        clearTimeout(setupTimer)
        callSid = sid
        // Prefer the caller we resolved in /voice/incoming (custom parameter):
        // on Twilio-placed calls the setup message's `from` is OUR number.
        const custom = (msg.customParameters ?? {}) as Record<string, unknown>
        const passedFrom = typeof custom.from === 'string' && custom.from ? custom.from : null
        const from = normaliseE164(passedFrom ?? (typeof msg.from === 'string' ? msg.from : null))
        const to = typeof msg.to === 'string' ? msg.to : null
        const match = matchCaller(deps.db, from)
        const context = Promise.all([loadClubFacts(deps.db, now()), match]).then(([facts, m]) =>
          buildCallContext({ now: now(), callerId: from, match: m, facts }),
        )
        const session = new CallSession({
          callSid: sid,
          callerId: from,
          llm: deps.llm,
          model: env.VOICE_OPENAI_MODEL,
          maxReplyTokens: env.VOICE_MAX_REPLY_TOKENS,
          maxTurns: env.VOICE_MAX_TURNS,
          maxCallMs: env.VOICE_MAX_CALL_SECONDS * 1000,
          context,
          now,
          endDelayMs: deps.endDelayMs,
          greeting: welcomeGreeting(now()),
          send: (m) => {
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
          },
        })
        call = { session, match: match.catch(() => NO_MATCH), from, to }
        live.set(sid, call)
        log.info('relay_setup', { callSid: sid, from: maskPhone(from) })
        return
      }
      void call.session.handleRaw(raw)
    })

    ws.on('close', (code) => {
      clearTimeout(setupTimer)
      if (!call || !callSid) return
      const { session, match, from, to } = call
      session.dispose()
      log.info('relay_closed', { callSid, code })
      const sid = callSid
      void (async () => {
        try {
          await finalizeCall(
            { callSid: sid, snapshot: session.snapshot(), match: await match, from, to },
            { db: deps.db, llm: deps.llm, summaryModel: env.summaryModel, now },
          )
        } catch (e) {
          log.error('finalize_failed', e, { callSid: sid })
        } finally {
          live.delete(sid)
        }
      })()
    })

    ws.on('error', (e) => log.error('relay_socket_error', e, { callSid: callSid ?? undefined }))
  }

  return { app, server, wss, live }
}
