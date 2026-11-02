import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSignOff } from '../src/session.js'
import { buildRecognitionHints } from '../src/twiml.js'

test('isSignOff matches bare sign-offs only', () => {
  for (const s of ['Goodbye.', 'bye', 'Thanks, bye!', 'Okay, thank you so much, goodbye', "That's all, thanks", 'Bye bye', 'Cheers, bye'])
    assert.equal(isSignOff(s), true, s)
  for (const s of ['Bye the way, can you tell me about events?', 'Goodbye to the old site, what is new?', 'Can I book a call', 'Thank you'])
    assert.equal(isSignOff(s), false, s)
})

test('recognition hints include event names, deduped and comma-safe', () => {
  const h = buildRecognitionHints(['INSPIRE', 'Swinton Estate', 'the club', 'A, "B"'])
  assert.ok(h.includes('INSPIRE') && h.includes('Swinton Estate'))
  assert.equal(h.split(',').filter((x) => x.toLowerCase() === 'the club').length, 1)
  assert.ok(!h.includes('"'))
})

import { cleanDetails, fillCaptureGaps } from '../src/summary.js'
import { emptyCapture } from '../src/types.js'

test('end-of-call details only fill empty fields', () => {
  const c = emptyCapture()
  c.firstName = 'Abdul'
  fillCaptureGaps(c, cleanDetails({ firstName: 'Wrong', lastName: 'Waheed', company: 'Cool Tech', email: 'AW 736024@Gmail.com', role: null }))
  assert.equal(c.firstName, 'Abdul')
  assert.equal(c.lastName, 'Waheed')
  assert.equal(c.company, 'Cool Tech')
  assert.equal(c.email, 'aw736024@gmail.com')
  assert.equal(c.role, null)
  assert.equal(cleanDetails({ email: 'not-an-email' }).email, undefined)
})
