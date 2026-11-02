// Signature validation wiring + TwiML over HTTP + a full relay round-trip
// over a real WebSocket (no DB, fake LLM).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import twilio from 'twilio'
import WebSocket from 'ws'
import { createVoiceServer } from '../src/server.js'
import { checkSignature, relayUrls, webhookUrl } from '../src/signature.js'
import { FakeLlm, testEnv, text } from './helpers.js'

const TOKEN = 'test_auth_token_123'
const PUBLIC = 'https://voice.example.test'

function sign(url: string, params: Record<string, string>) {
  return twilio.getExpectedTwilioSignature(TOKEN, url, params)
}

async function start(env = testEnv(), llm: FakeLlm | null = new FakeLlm([])) {
  const { server } = createVoiceServer({ env, db: null, llm, endDelayMs: () => 5 })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as AddressInfo).port
  return {
    base: `http://127.0.0.1:${port}`,
    port,
    close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()) }),
  }
}

function post(base: string, path: string, params: Record<string, string>, signature?: string) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(signature ? { 'x-twilio-signature': signature } : {}),
    },
    body: new URLSearchParams(params).toString(),
  })
}

const callParams = { CallSid: 'CA0001', From: '+447700900123', To: '+447915919880', Direction: 'inbound' }

test('checkSignature: real Twilio HMAC accepted, tampering rejected', () => {
  const url = webhookUrl(PUBLIC, '/voice/incoming')
  const sig = sign(url, callParams)
  assert.deepEqual(checkSignature({ authToken: TOKEN, signature: sig, urls: [url], params: callParams }), { ok: true })
  assert.deepEqual(
    checkSignature({ authToken: TOKEN, signature: sig, urls: [url], params: { ...callParams, From: '+440000000000' } }),
    { ok: false, reason: 'mismatch' },
  )
  assert.deepEqual(checkSignature({ authToken: undefined, signature: sig, urls: [url] }), { ok: false, reason: 'no_auth_token' })
  assert.deepEqual(checkSignature({ authToken: TOKEN, signature: undefined, urls: [url] }), { ok: false, reason: 'no_signature' })
  assert.deepEqual(relayUrls(PUBLIC, '/relay'), ['wss://voice.example.test/relay', 'https://voice.example.test/relay'])
})

test('/voice/incoming: 403 without a valid signature, TwiML with one', async () => {
  const s = await start()
  try {
    const bad = await post(s.base, '/voice/incoming', callParams, 'nope')
    assert.equal(bad.status, 403)
    const none = await post(s.base, '/voice/incoming', callParams)
    assert.equal(none.status, 403)

    const ok = await post(s.base, '/voice/incoming', callParams, sign(`${PUBLIC}/voice/incoming`, callParams))
    assert.equal(ok.status, 200)
    assert.match(ok.headers.get('content-type') ?? '', /xml/)
    const xml = await ok.text()
    assert.match(xml, /<ConversationRelay url="wss:\/\/voice.example.test\/relay"/)
    assert.match(xml, /<Parameter name="callSid" value="CA0001"\/>/)
    assert.match(xml, /action="https:\/\/voice.example.test\/voice\/connect-action"/)
  } finally {
    await s.close()
  }
})

test('/voice/incoming: 503 when the Twilio auth token is missing; health lists it', async () => {
  const s = await start(testEnv({ TWILIO_AUTH_TOKEN: '' }))
  try {
    const res = await post(s.base, '/voice/incoming', callParams, 'x')
    assert.equal(res.status, 503)
    assert.match(await res.text(), /TWILIO_AUTH_TOKEN/)
    const health = (await (await fetch(`${s.base}/health`)).json()) as { ok: boolean; missing: string[] }
    assert.equal(health.ok, true)
    assert.ok(health.missing.includes('TWILIO_AUTH_TOKEN'))
  } finally {
    await s.close()
  }
})

test('/voice/incoming: polite say+hangup when OpenAI is not configured', async () => {
  const s = await start(testEnv({ OPENAI_API_KEY: '' }), null)
  try {
    const res = await post(s.base, '/voice/incoming', callParams, sign(`${PUBLIC}/voice/incoming`, callParams))
    assert.equal(res.status, 200)
    const xml = await res.text()
    assert.match(xml, /<Say[^>]*>Thank you for calling The Club/)
    assert.match(xml, /<Hangup\/>/)
  } finally {
    await s.close()
  }
})

test('/voice/status and /voice/connect-action are signature-checked', async () => {
  const s = await start()
  try {
    const p = { CallSid: 'CA0001', CallStatus: 'completed', CallDuration: '42' }
    assert.equal((await post(s.base, '/voice/status', p, 'bad')).status, 403)
    assert.equal((await post(s.base, '/voice/status', p, sign(`${PUBLIC}/voice/status`, p))).status, 204)
    const a = { CallSid: 'CA0001', SessionStatus: 'failed', ErrorCode: '39001' }
    const res = await post(s.base, '/voice/connect-action', a, sign(`${PUBLIC}/voice/connect-action`, a))
    assert.match(await res.text(), /<Say[^>]*>I&apos;m so sorry|<Say[^>]*>I'm so sorry/)
  } finally {
    await s.close()
  }
})

test('WS /relay: rejects unsigned handshakes, streams a reply for a signed one', async () => {
  const llm = new FakeLlm([[text('Of course'), text(' — may I take your name?')]])
  const s = await start(testEnv(), llm)
  try {
    // Unsigned → 403
    await assert.rejects(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${s.port}/relay`)
        ws.on('open', () => resolve(ws))
        ws.on('error', reject)
      }),
      /403/,
    )

    // Twilio answers the call first (registers the CallSid).
    await post(s.base, '/voice/incoming', callParams, sign(`${PUBLIC}/voice/incoming`, callParams))

    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/relay`, {
      headers: { 'x-twilio-signature': sign('wss://voice.example.test/relay', {}) },
    })
    await new Promise((r, j) => { ws.on('open', r); ws.on('error', j) })
    const received: Record<string, unknown>[] = []
    const lastToken = new Promise<void>((resolve) => {
      ws.on('message', (d) => {
        const m = JSON.parse(d.toString()) as Record<string, unknown>
        received.push(m)
        if (m.type === 'text' && m.last === true) resolve()
      })
    })
    ws.send(JSON.stringify({ type: 'setup', callSid: 'CA0001', from: '+447700900123', to: '+447915919880', customParameters: {} }))
    ws.send(JSON.stringify({ type: 'prompt', voicePrompt: "Hi, I'd like to hear about membership", last: true }))
    await lastToken
    assert.deepEqual(received.map((m) => m.token), ['Of course', ' — may I take your name?', ''])
    assert.ok(received.every((m) => m.type === 'text'))
    ws.close()
  } finally {
    await s.close()
  }
})
