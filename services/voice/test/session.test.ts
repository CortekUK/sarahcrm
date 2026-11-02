// CallSession with a scripted (mocked) OpenAI stream: token streaming, tool
// call accumulation across chunks, multi-round tool use, end_call, interrupt
// truncation, OpenAI failures, limits and transcript accumulation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CallSession, type OutgoingMessage } from '../src/session.js'
import { FakeLlm, text, tick, toolDelta, usage } from './helpers.js'
import type { StreamChunk, StreamRequest } from '../src/llm.js'

const NOW = new Date('2026-10-28T10:00:00Z')

function makeSession(llm: FakeLlm | null, extra: Partial<ConstructorParameters<typeof CallSession>[0]> = {}) {
  const sent: OutgoingMessage[] = []
  const session = new CallSession({
    callSid: 'CA1',
    callerId: '+447700900123',
    llm,
    model: 'test-model',
    maxReplyTokens: 200,
    maxTurns: 40,
    maxCallMs: 0,
    context: 'CTX',
    send: (m) => sent.push(m),
    now: () => NOW,
    endDelayMs: () => 1,
    ...extra,
  })
  return { session, sent }
}

const prompt = (voicePrompt: string) => JSON.stringify({ type: 'prompt', voicePrompt, last: true })
const waitFor = async (cond: () => boolean, ms = 500) => {
  const until = Date.now() + ms
  while (!cond()) {
    if (Date.now() > until) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 2))
  }
}

test('streams tokens then closes the talk cycle; system + context + history sent', async () => {
  const llm = new FakeLlm([[text('Good'), text(' morning.'), usage(100, 7)]])
  const { session, sent } = makeSession(llm)
  await session.handleRaw(prompt('Hello'))
  await session.idle()
  assert.deepEqual(sent, [
    { type: 'text', token: 'Good', last: false },
    { type: 'text', token: ' morning.', last: false },
    { type: 'text', token: '', last: true },
  ])
  const req = llm.requests[0]
  assert.equal(req.messages[0].role, 'system')
  assert.equal(req.messages[1].content, 'CTX')
  assert.deepEqual(req.messages[2], { role: 'user', content: 'Hello' })
  assert.equal(req.maxTokens, 200)
  assert.ok(req.tools?.some((t) => t.type === 'function' && t.function.name === 'end_call'))
  assert.deepEqual(session.usage, { promptTokens: 100, completionTokens: 7, requests: 1 })
  assert.deepEqual(session.transcript.map((t) => [t.role, t.text]), [['caller', 'Hello'], ['agent', 'Good morning.']])
})

test('tool call arguments split across chunks are reassembled, applied, then the model speaks', async () => {
  const llm = new FakeLlm([
    [
      toolDelta(0, 'call_a', 'save_caller_details', '{"first_name":"Ja'),
      toolDelta(0, undefined, undefined, 'ne","last_name":"Smith","company":"Acme","interest":"membership"}'),
      toolDelta(1, 'call_b', 'request_callback', '{"team":"sales","preferred_time_text":"Thursday at 2pm",'),
      toolDelta(1, undefined, undefined, '"preferred_time_iso":"2026-10-29T14:00:00+00:00"}'),
    ],
    [text("Thank you, Jane. I'll ask the membership team to call you on Thursday at two.")],
  ])
  const { session, sent } = makeSession(llm)
  await session.handleRaw(prompt("It's Jane Smith from Acme, about membership. Thursday at 2 please."))
  await session.idle()

  assert.equal(session.capture.firstName, 'Jane')
  assert.equal(session.capture.lastName, 'Smith')
  assert.equal(session.capture.company, 'Acme')
  assert.equal(session.capture.interest, 'membership')
  assert.equal(session.capture.callback?.team, 'sales')
  assert.equal(session.capture.callback?.preferredText, 'Thursday at 2pm')
  assert.equal(session.capture.callback?.preferredAt, '2026-10-29T14:00:00.000Z')

  // Second request carries the assistant tool_calls + both tool results.
  const second = llm.requests[1].messages
  const assistant = second.find((m) => m.role === 'assistant') as { tool_calls?: { id: string }[] }
  assert.deepEqual(assistant.tool_calls?.map((t) => t.id), ['call_a', 'call_b'])
  const tools = second.filter((m) => m.role === 'tool') as { tool_call_id: string; content: string }[]
  assert.deepEqual(tools.map((t) => t.tool_call_id), ['call_a', 'call_b'])
  assert.equal(JSON.parse(tools[0].content).ok, true)

  assert.equal(sent.at(-1)?.type, 'text')
  assert.deepEqual(sent.at(-1), { type: 'text', token: '', last: true })
  const events = session.transcript.filter((t) => t.role === 'event').map((t) => t.text)
  assert.equal(events.length, 2)
  assert.match(events[0], /Details saved: first name, surname, company, interest/)
  assert.match(events[1], /Call back requested \(sales\): Thursday at 2pm/)
})

test('end_call: goodbye is spoken, then `end` is sent', async () => {
  const llm = new FakeLlm([
    [text('Thank you for calling The Club. Goodbye.'), toolDelta(0, 'c1', 'end_call', '{"reason":"caller said goodbye"}')],
  ])
  const { session, sent } = makeSession(llm)
  await session.handleRaw(prompt("That's all, bye"))
  await session.idle()
  await waitFor(() => sent.some((m) => m.type === 'end'))
  const end = sent.find((m) => m.type === 'end') as { handoffData: string }
  assert.equal(JSON.parse(end.handoffData).reason, 'caller said goodbye')
  assert.ok(session.isEnding)
  // Prompts after the goodbye are ignored.
  await session.handleRaw(prompt('wait'))
  await session.idle()
  assert.equal(llm.requests.length, 1)
})

test('end_call without text speaks a default goodbye', async () => {
  const llm = new FakeLlm([[toolDelta(0, 'c1', 'end_call', '{"reason":"done"}')]])
  const { session, sent } = makeSession(llm)
  await session.handleRaw(prompt('bye'))
  await session.idle()
  assert.ok(sent.some((m) => m.type === 'text' && m.last && /Goodbye/.test(m.token)))
  await waitFor(() => sent.some((m) => m.type === 'end'))
})

test('interrupt aborts the stream and truncates the agent line to what the caller heard', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const slow = async function* (req: StreamRequest): AsyncIterable<StreamChunk> {
    yield text('Membership at The Club is by curation, ')
    await Promise.race([gate, new Promise((r) => req.signal.addEventListener('abort', r))])
    if (req.signal.aborted) return
    yield text('and members enjoy curated events.')
  }
  const llm = new FakeLlm([slow, [text('Of course — what is your name?')]])
  const { session, sent } = makeSession(llm)
  await session.handleRaw(prompt('Tell me about membership'))
  await waitFor(() => sent.length === 1)
  await session.handleRaw(JSON.stringify({ type: 'interrupt', utteranceUntilInterrupt: 'Membership at The Club', durationUntilInterruptMs: 900 }))
  release()
  await session.idle()
  const agent = session.transcript.filter((t) => t.role === 'agent')
  assert.equal(agent.length, 1)
  assert.equal(agent[0].text, 'Membership at The Club…')
  assert.equal(agent[0].interrupted, true)
  assert.ok(!sent.some((m) => m.type === 'text' && m.last), 'aborted turn must not send last:true')

  await session.handleRaw(prompt('Sorry, can I book a call?'))
  await session.idle()
  const hist = llm.requests[1].messages.filter((m) => m.role !== 'system')
  assert.deepEqual(hist.map((m) => m.role), ['user', 'assistant', 'user'])
  assert.match(String(hist[1].content), /^Membership at The Club… \[interrupted by the caller\]$/)
  assert.deepEqual(session.transcript.map((t) => t.role), ['caller', 'agent', 'caller', 'agent'])
})

test('OpenAI failure: apology + offer to take a message; second failure ends the call', async () => {
  const llm = new FakeLlm([new Error('rate limited'), new Error('still down')])
  const { session, sent } = makeSession(llm)
  await session.handleRaw(prompt('Hello'))
  await session.idle()
  assert.match((sent[0] as { token: string }).token, /trouble at my end.*message you'd like me to pass on/)
  assert.equal(session.isEnding, false)
  await session.handleRaw(prompt('Yes please'))
  await session.idle()
  assert.ok(session.isEnding)
  await waitFor(() => sent.some((m) => m.type === 'end'))
  assert.equal(session.snapshot().llmFailures, 2)
  assert.match(session.snapshot().error ?? '', /still down/)
})

test('turn limit wraps the call up politely', async () => {
  const llm = new FakeLlm([[text('One.')], [text('Two.')]])
  const { session, sent } = makeSession(llm, { maxTurns: 2 })
  await session.handleRaw(prompt('a'))
  await session.idle()
  await session.handleRaw(prompt('b'))
  await session.idle()
  await session.handleRaw(prompt('c'))
  await session.idle()
  assert.equal(llm.requests.length, 2)
  assert.ok(sent.some((m) => m.type === 'text' && /bring our call to a close/.test(m.token)))
  await waitFor(() => sent.some((m) => m.type === 'end'))
})

test('max call length timer wraps up', async () => {
  const { session, sent } = makeSession(new FakeLlm([]), { maxCallMs: 5 })
  await waitFor(() => sent.some((m) => m.type === 'end'))
  assert.ok(session.transcript.some((t) => t.role === 'event' && /Maximum call length/.test(t.text)))
  session.dispose()
})

test('transcript accumulates caller/agent/event entries with timestamps; dtmf + partial prompts', async () => {
  const llm = new FakeLlm([[text('Hello there.')]])
  const { session } = makeSession(llm)
  await session.handleRaw(JSON.stringify({ type: 'prompt', voicePrompt: 'partial', last: false }))
  await session.handleRaw(JSON.stringify({ type: 'dtmf', digit: '5' }))
  await session.handleRaw(prompt('Hi'))
  await session.handleRaw('not json')
  await session.idle()
  const snap = session.snapshot()
  assert.deepEqual(snap.transcript.map((t) => `${t.role}:${t.text}`), ['event:Keypad pressed: 5', 'caller:Hi', 'agent:Hello there.'])
  assert.ok(snap.transcript.every((t) => t.at === NOW.toISOString()))
  assert.equal(snap.turns, 1)
  // snapshot is a copy
  snap.transcript.push({ role: 'caller', text: 'x', at: '' })
  assert.equal(session.transcript.length, 3)
})

test('the TwiML greeting is recorded as the first agent line', async () => {
  const llm = new FakeLlm([[text('Lovely.')]])
  const { session } = makeSession(llm, { greeting: 'Good morning, The Club.' })
  await session.handleRaw(prompt('Hi'))
  await session.idle()
  assert.deepEqual(session.transcript.map((t) => t.role), ['agent', 'caller', 'agent'])
  assert.deepEqual(llm.requests[0].messages.slice(2), [
    { role: 'assistant', content: 'Good morning, The Club.' },
    { role: 'user', content: 'Hi' },
  ])
})

test('prompts wait for the call context to load', async () => {
  let resolveCtx!: (s: string) => void
  const ctx = new Promise<string>((r) => (resolveCtx = r))
  const llm = new FakeLlm([[text('Hi.')]])
  const { session } = makeSession(llm, { context: ctx })
  const p = session.handleRaw(prompt('Hello'))
  await tick()
  assert.equal(llm.requests.length, 0)
  resolveCtx('LIVE FACTS')
  await p
  await session.idle()
  assert.equal(llm.requests[0].messages[1].content, 'LIVE FACTS')
})
