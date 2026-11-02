// Summary fallback, outcome rules, tool validation, enquiry/task composition
// and the finalize pipeline against a fake Supabase.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyToolCall, parsePreferredIso } from '../src/tools.js'
import { deriveOutcome, fallbackSummary, summariseCall } from '../src/summary.js'
import { composeEnquiryMessage, intentForInterest, nextBusinessDay, taskForCall } from '../src/crm.js'
import { finalizeCall, shouldFileEnquiry } from '../src/finalize.js'
import { emptyCapture, NO_MATCH, type TranscriptEntry } from '../src/types.js'
import type { SessionSnapshot } from '../src/session.js'
import { FakeLlm } from './helpers.js'
import { fakeDb, type Op } from './fakedb.js'

const NOW = new Date('2026-10-28T10:00:00Z') // a Wednesday
const ctx = { now: NOW, callerId: '+447700900123' }
const t = (role: TranscriptEntry['role'], text: string): TranscriptEntry => ({ role, text, at: NOW.toISOString() })

function snap(over: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    callSid: 'CA9',
    callerId: '+447700900123',
    startedAt: '2026-10-28T09:58:00.000Z',
    capture: emptyCapture(),
    transcript: [t('caller', 'Hello'), t('agent', 'Hello, how can I help?')],
    usage: { promptTokens: 500, completionTokens: 60, requests: 3 },
    model: 'test-model',
    turns: 3,
    llmFailures: 0,
    error: null,
    endReason: 'caller finished',
    ...over,
  }
}

test('tools validate input: bad email/phone warned, enums enforced, bad JSON tolerated', () => {
  const c = emptyCapture()
  const r = JSON.parse(applyToolCall(c, 'save_caller_details', '{"email":"jane at acme","phone":"12","interest":"golf"}', ctx).result)
  assert.equal(c.email, null)
  assert.equal(c.phone, null)
  assert.equal(c.interest, null)
  assert.equal(r.warnings.length, 2)
  applyToolCall(c, 'save_caller_details', '{"email":"Jane.Smith @Acme.co.uk","phone":"07911 123456","phone_confirmed":null}', ctx)
  assert.equal(c.email, 'jane.smith@acme.co.uk')
  assert.equal(c.phone, '+447911123456')
  applyToolCall(c, 'save_caller_details', '{"phone_confirmed":true}', ctx)
  assert.equal(c.phoneConfirmed, true)
  assert.match(applyToolCall(c, 'save_caller_details', '{oops', ctx).result, /not valid JSON/)
  assert.match(applyToolCall(c, 'nope', '{}', ctx).result, /Unknown tool/)
  applyToolCall(c, 'mark_escalation', '{"category":"weird","reason":"Wants a refund"}', ctx)
  assert.deepEqual(c.escalation, { category: 'other', reason: 'Wants a refund' })
})

test('parsePreferredIso only accepts future times within 90 days', () => {
  assert.equal(parsePreferredIso('2026-10-29T14:00:00+00:00', NOW), '2026-10-29T14:00:00.000Z')
  assert.equal(parsePreferredIso('2026-10-27T14:00:00Z', NOW), null)
  assert.equal(parsePreferredIso('2027-06-01T14:00:00Z', NOW), null)
  assert.equal(parsePreferredIso('Thursday', NOW), null)
  assert.equal(parsePreferredIso(null, NOW), null)
})

test('deriveOutcome precedence', () => {
  const c = emptyCapture()
  assert.equal(deriveOutcome({ capture: c, enquiryCreated: false, failed: false }), 'no_action')
  assert.equal(deriveOutcome({ capture: c, enquiryCreated: false, failed: true }), 'failed')
  c.firstName = 'Jane'
  assert.equal(deriveOutcome({ capture: c, enquiryCreated: false, failed: false }), 'message_taken')
  assert.equal(deriveOutcome({ capture: c, enquiryCreated: true, failed: false }), 'enquiry_created')
  c.callback = { requestedAt: NOW.toISOString(), preferredText: 'Thu', preferredAt: null, team: 'sales', reason: null }
  assert.equal(deriveOutcome({ capture: c, enquiryCreated: true, failed: false }), 'callback_requested')
  c.escalation = { category: 'complaint', reason: 'x' }
  assert.equal(deriveOutcome({ capture: c, enquiryCreated: true, failed: false }), 'escalated')
})

test('fallback summary is templated from the capture', () => {
  const c = emptyCapture()
  Object.assign(c, { firstName: 'Jane', lastName: 'Smith', company: 'Acme', interest: 'membership', notes: 'Wants to join.' })
  c.callback = { requestedAt: NOW.toISOString(), preferredText: 'Thursday afternoon', preferredAt: null, team: 'sales', reason: null }
  const s = fallbackSummary(snap({ capture: c }))
  assert.equal(s, 'Jane Smith from Acme called about membership. Message: Wants to join. They asked for a call back (Thursday afternoon) from the membership team.')
  assert.equal(fallbackSummary(snap({ transcript: [t('agent', 'Hello?')] })), 'The caller did not say anything before the call ended.')
  assert.match(fallbackSummary(snap()), /An unnamed caller called The Club\. No specific request was captured\./)
})

test('summariseCall uses OpenAI JSON, falls back on error / bad JSON / no key', async () => {
  const ok = await summariseCall(snap(), new FakeLlm([]), 'm')
  assert.equal(ok.summary, 'Jane called about membership.')
  assert.equal(ok.usedFallback, false)
  const bad = await summariseCall(snap(), new FakeLlm([], async () => ({ text: 'not json', promptTokens: 1, completionTokens: 1 })), 'm')
  assert.equal(bad.usedFallback, true)
  const err = await summariseCall(snap(), new FakeLlm([], async () => { throw new Error('500') }), 'm')
  assert.equal(err.usedFallback, true)
  assert.equal((await summariseCall(snap(), null, 'm')).usedFallback, true)
})

test('enquiry message + tasks', () => {
  const c = emptyCapture()
  Object.assign(c, { firstName: 'Jane', interest: 'private_event', notes: 'Birthday dinner for 40', turnoverBand: '£1–5m' })
  c.callback = { requestedAt: NOW.toISOString(), preferredText: 'Friday morning', preferredAt: '2026-10-30T10:00:00.000Z', team: 'events', reason: null }
  const msg = composeEnquiryMessage({ capture: c, callerId: '+447700900123', match: { ...NO_MATCH, memberId: 'm1', memberName: 'Jane Smith' }, callId: 'v1', summary: 'S.' })
  assert.match(msg, /^Call requested \(Events team\): preferred Friday morning ≈ Fri 30 Oct, 10:00/)
  assert.match(msg, /Approx\. turnover: £1–5m \(stated by the caller\)/)
  assert.match(msg, /Caller ID matches member: Jane Smith/)
  // The CRM links the call by enquiry_id (a button), not a raw path in the text.
  assert.doesNotMatch(msg, /Full transcript:/)

  const task = taskForCall({ capture: c, callerId: '+447700900123', match: NO_MATCH, summary: 'S.', callId: 'v1', enquiryId: 'e1', ownerId: 'o1', score: 40, now: NOW })!
  assert.match(String(task.title), /^Call back: Jane \(07700 900123\) — preferred Friday morning/)
  assert.equal(task.category, 'events')
  assert.equal(task.priority, 'high')
  assert.equal(task.due_date, '2026-10-30')
  assert.equal(task.related_enquiry_id, 'e1')

  c.escalation = { category: 'payment', reason: 'Disputed invoice' }
  assert.match(String(taskForCall({ capture: c, callerId: null, match: NO_MATCH, summary: 'S.', callId: null, enquiryId: null, ownerId: null, score: null, now: NOW })!.title), /^Escalated call: Jane — payment/)
  assert.equal(taskForCall({ capture: emptyCapture(), callerId: null, match: NO_MATCH, summary: '', callId: null, enquiryId: null, ownerId: null, score: null, now: NOW }), null)

  assert.equal(intentForInterest('other', null), 'general')
  assert.equal(intentForInterest(null, 'events'), 'private_event')
  assert.equal(nextBusinessDay(new Date('2026-10-30T10:00:00Z')), '2026-11-02') // Fri → Mon
})

test('shouldFileEnquiry needs a name + contact + a reason, never for escalations', () => {
  const c = emptyCapture()
  assert.equal(shouldFileEnquiry({ capture: c, callerId: '+447700900123' }), false)
  c.firstName = 'Jane'
  assert.equal(shouldFileEnquiry({ capture: c, callerId: '+447700900123' }), false)
  c.interest = 'membership'
  assert.equal(shouldFileEnquiry({ capture: c, callerId: '+447700900123' }), true)
  assert.equal(shouldFileEnquiry({ capture: c, callerId: null }), false)
  c.escalation = { category: 'complaint', reason: 'x' }
  assert.equal(shouldFileEnquiry({ capture: c, callerId: '+447700900123' }), false)
})

test('finalizeCall: claims the row, files enquiry + task + notification, writes the call; second run is a no-op', async () => {
  let claimed = false
  const { db, ops } = fakeDb((op: Op) => {
    if (op.table === 'voice_calls' && op.op === 'update' && op.filters.some(([f]) => f === 'is')) {
      if (claimed) return { data: [], error: null }
      claimed = true
      return { data: [{ id: 'v1', status: 'completed', started_at: '2026-10-28T09:58:00.000Z', ended_at: '2026-10-28T10:00:00.000Z', duration_s: 120, enquiry_id: null }], error: null }
    }
    if (op.table === 'enquiries' && op.op === 'insert') return { data: { id: 'e1' }, error: null }
    if (op.table === 'app_settings') return { data: { value: { membership: 'owner-1' } }, error: null }
    if (op.table === 'tasks' && op.op === 'insert') return { data: { id: 't1' }, error: null }
    if (op.table === 'voice_match_caller') return { data: [{ kind: 'contact', id: 'c1', first_name: 'Jane', last_name: 'Smith' }], error: null }
    return { data: null, error: null }
  })
  const c = emptyCapture()
  Object.assign(c, { firstName: 'Jane', lastName: 'Smith', interest: 'membership', enquiryRequested: true })
  const res = await finalizeCall(
    { callSid: 'CA-fin-1', snapshot: snap({ callSid: 'CA-fin-1', capture: c }), match: null },
    { db, llm: new FakeLlm([]), summaryModel: 'm', now: () => NOW },
  )
  assert.equal(res.outcome, 'enquiry_created')
  assert.equal(res.enquiryId, 'e1')

  const enq = ops.find((o) => o.table === 'enquiries' && o.op === 'insert')!.payload as Record<string, unknown>
  assert.equal(enq.source, 'phone_agent')
  assert.equal(enq.email, '')
  assert.equal(enq.phone, '+447700900123')
  assert.deepEqual(enq.intent, ['membership'])
  assert.ok(ops.some((o) => o.table === 'enquiries' && o.op === 'update' && (o.payload as Record<string, unknown>).assigned_to === 'owner-1'))
  assert.ok(ops.some((o) => o.table === 'enquiries' && o.op === 'update' && (o.payload as Record<string, unknown>).related_task_id === 't1'))
  const note = ops.find((o) => o.table === 'admin_notifications')!.payload as Record<string, unknown>
  assert.equal(note.link, '/dashboard/calls?call=v1')
  assert.equal(note.related_enquiry_id, 'e1')

  const final = ops.filter((o) => o.table === 'voice_calls' && o.op === 'update').at(-1)!.payload as Record<string, unknown>
  assert.equal(final.outcome, 'enquiry_created')
  assert.equal(final.summary, 'Jane called about membership.')
  assert.equal(final.contact_id, 'c1')
  assert.equal(final.duration_s, 120)
  assert.equal(final.prompt_tokens, 510)
  assert.equal(final.llm_requests, 4)
  assert.equal((final.transcript as unknown[]).length, 2)
  // No email anywhere: nothing but DB tables were touched.
  assert.deepEqual([...new Set(ops.map((o) => o.table))].sort(), ['admin_notifications', 'app_settings', 'enquiries', 'tasks', 'voice_calls', 'voice_match_caller'])

  // A second finalize for the same CallSid (e.g. status callback) shares the in-flight result.
  const again = await finalizeCall({ callSid: 'CA-fin-1', snapshot: null, match: null }, { db, llm: null, summaryModel: 'm' })
  assert.equal(again.enquiryId, 'e1')
})

test('finalizeCall: busy/no-answer call with no session → failed, no enquiry, no notification', async () => {
  const { db, ops } = fakeDb((op: Op) => {
    if (op.table === 'voice_calls' && op.op === 'update' && op.filters.some(([f]) => f === 'is')) {
      return { data: [{ id: 'v2', status: 'no_answer', started_at: NOW.toISOString(), ended_at: NOW.toISOString(), duration_s: 0, enquiry_id: null }], error: null }
    }
    if (op.table === 'voice_match_caller') return { data: [], error: null }
    return { data: null, error: null }
  })
  const res = await finalizeCall(
    { callSid: 'CA-fin-2', snapshot: null, match: null, twilioStatus: 'no_answer', from: '+447700900123' },
    { db, llm: new FakeLlm([]), summaryModel: 'm', now: () => NOW },
  )
  assert.equal(res.outcome, 'failed')
  assert.match(res.summary, /ended before the receptionist answered \(no answer\)/)
  assert.ok(!ops.some((o) => o.table === 'enquiries' || o.table === 'admin_notifications' || o.table === 'tasks'))
})

test('finalizeCall: already finalized elsewhere → skipped', async () => {
  const { db, ops } = fakeDb((op: Op) => (op.op === 'update' ? { data: [], error: null } : { data: null, error: null }))
  const res = await finalizeCall({ callSid: 'CA-fin-3', snapshot: snap({ callSid: 'CA-fin-3' }), match: NO_MATCH }, { db, llm: null, summaryModel: 'm' })
  assert.equal(res.skipped, 'already_finalized')
  assert.ok(!ops.some((o) => o.table === 'enquiries'))
})
