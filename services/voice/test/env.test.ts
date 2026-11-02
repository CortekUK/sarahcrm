import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadEnv } from '../src/env.js'
import { buildCallContext, SYSTEM_PROMPT } from '../src/prompt.js'
import { NO_MATCH } from '../src/types.js'

test('boots with nothing configured and reports what is missing', () => {
  const env = loadEnv({} as NodeJS.ProcessEnv)
  assert.equal(env.PORT, 4200)
  assert.equal(env.VOICE_OPENAI_MODEL, 'gpt-4.1-mini')
  assert.equal(env.VOICE_LANGUAGE, 'en-GB')
  assert.equal(env.VOICE_TTS_PROVIDER, 'ElevenLabs')
  assert.equal(env.VOICE_TRANSCRIPTION_PROVIDER, 'Deepgram')
  assert.equal(env.VOICE_VALIDATE_SIGNATURE, true)
  assert.equal(env.VOICE_MAX_CALL_SECONDS, 600)
  assert.equal(env.VOICE_MAX_TURNS, 40)
  assert.equal(env.VOICE_MAX_REPLY_TOKENS, 200)
  assert.deepEqual(env.missing, ['VOICE_PUBLIC_URL', 'TWILIO_AUTH_TOKEN', 'OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
})

test('derives the relay URL; malformed values throw without echoing them', () => {
  const env = loadEnv({ VOICE_PUBLIC_URL: 'https://abc.ngrok-free.app/' } as NodeJS.ProcessEnv)
  assert.equal(env.publicUrl, 'https://abc.ngrok-free.app')
  assert.equal(env.relayUrl, 'wss://abc.ngrok-free.app/relay')
  assert.throws(() => loadEnv({ VOICE_MAX_TURNS: 'lots', OPENAI_API_KEY: 'sk-secret' } as NodeJS.ProcessEnv), (e: Error) => {
    assert.match(e.message, /VOICE_MAX_TURNS/)
    assert.doesNotMatch(e.message, /sk-secret/)
    return true
  })
})

test('prompt rules + call context (no prices, caller ID, events)', () => {
  assert.match(SYSTEM_PROMPT, /Never quote, promise or negotiate prices/)
  assert.match(SYSTEM_PROMPT, /Never take card or bank details/)
  assert.match(SYSTEM_PROMPT, /Never claim or imply that you are a human/)
  const ctx = buildCallContext({
    now: new Date('2026-10-28T10:00:00Z'),
    callerId: '+447700900123',
    match: { ...NO_MATCH, memberId: 'm1', memberName: 'Jane Smith' },
    facts: {
      events: [{ title: 'Autumn Supper', dateLabel: 'Thursday 6 November 2026', venue: 'The Lodge', city: 'Knutsford' }],
      plans: [{ name: 'Individual', lede: 'For founders', features: ['Events', 'Introductions'] }],
    },
  })
  assert.match(ctx, /Caller ID: 07700 900123/)
  assert.match(ctx, /matches an existing member on file \(first name: Jane\)/)
  assert.match(ctx, /- Autumn Supper — Thursday 6 November 2026 — The Lodge, Knutsford/)
  assert.match(ctx, /- Individual: For founders — includes Events; Introductions/)
  assert.match(ctx, /Wednesday,? 28 October 2026/)
})
