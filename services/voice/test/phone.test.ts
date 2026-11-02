import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliseE164, phoneDigits, speakablePhone } from '../src/phone.js'

test('normaliseE164 handles UK formats', () => {
  assert.equal(normaliseE164('+44 7915 919880'), '+447915919880')
  assert.equal(normaliseE164('07915 919880'), '+447915919880')
  assert.equal(normaliseE164('0044 (0)7915-919880'.replace('(0)', '')), '+447915919880')
  assert.equal(normaliseE164('447915919880'), '+447915919880')
  assert.equal(normaliseE164('7915 919880'), '+447915919880')
  assert.equal(normaliseE164('01565 123456'), '+441565123456')
})

test('normaliseE164 keeps foreign numbers and rejects junk', () => {
  assert.equal(normaliseE164('+1 (415) 555-0100'), '+14155550100')
  assert.equal(normaliseE164('923001234567'), '+923001234567')
  assert.equal(normaliseE164('anonymous'), null)
  assert.equal(normaliseE164(''), null)
  assert.equal(normaliseE164(null), null)
  assert.equal(normaliseE164('12'), null)
})

test('phoneDigits / speakablePhone', () => {
  assert.equal(phoneDigits('07915 919880'), '447915919880')
  assert.equal(speakablePhone('+447915919880'), '07915 919880')
  assert.equal(speakablePhone('+14155550100'), '+14155550100')
  assert.equal(speakablePhone(null), null)
})
