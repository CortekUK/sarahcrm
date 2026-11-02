import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRelayTwiml, buildSayHangupTwiml, partOfDay, welcomeGreeting } from '../src/twiml.js'

test('relay TwiML carries the ConversationRelay attributes + parameters', () => {
  const xml = buildRelayTwiml({
    relayUrl: 'wss://voice.example.test/relay',
    actionUrl: 'https://voice.example.test/voice/connect-action',
    welcomeGreeting: 'Hello & welcome to "The Club"',
    language: 'en-GB',
    ttsProvider: 'ElevenLabs',
    voice: 'Fahco4VZzobUeiPqni1S',
    transcriptionProvider: 'Deepgram',
    speechModel: null,
    hints: 'Sarah Restrick',
    parameters: { callSid: 'CA123', from: '+447700900123', empty: '' },
  })
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?><Response><Connect action="https:\/\/voice.example.test\/voice\/connect-action" method="POST"><ConversationRelay /)
  assert.match(xml, /url="wss:\/\/voice.example.test\/relay"/)
  assert.match(xml, /language="en-GB"/)
  assert.match(xml, /ttsProvider="ElevenLabs"/)
  assert.match(xml, /voice="Fahco4VZzobUeiPqni1S"/)
  assert.match(xml, /transcriptionProvider="Deepgram"/)
  assert.match(xml, /interruptible="any"/)
  assert.match(xml, /welcomeGreeting="Hello &amp; welcome to &quot;The Club&quot;"/)
  assert.match(xml, /<Parameter name="callSid" value="CA123"\/>/)
  assert.match(xml, /<Parameter name="from" value="\+447700900123"\/>/)
  assert.doesNotMatch(xml, /name="empty"/)
  assert.doesNotMatch(xml, /speechModel/)
})

test('say + hangup fallback', () => {
  const xml = buildSayHangupTwiml('Sorry.')
  assert.match(xml, /<Say voice="Polly.Amy-Neural" language="en-GB">Sorry.<\/Say><Hangup\/>/)
})

test('greeting says it is an AI and that the call is transcribed', () => {
  const g = welcomeGreeting(new Date('2026-10-28T09:00:00Z'))
  assert.match(g, /^Good morning/)
  assert.match(g, /AI assistant/)
  assert.match(g, /transcribed/)
  // 13:30 UTC in summer (BST) = 14:30 London → afternoon; 18:30 UTC Jan → evening.
  assert.equal(partOfDay(new Date('2026-07-01T13:30:00Z')), 'afternoon')
  assert.equal(partOfDay(new Date('2026-01-15T18:30:00Z')), 'evening')
})
