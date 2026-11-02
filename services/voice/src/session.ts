// One phone call = one CallSession, driven by ConversationRelay WebSocket
// messages (https://www.twilio.com/docs/voice/conversationrelay/websocket-messages):
//
//   in : setup (handled by relay.ts) · prompt {voicePrompt, last} ·
//        interrupt {utteranceUntilInterrupt, durationUntilInterruptMs} ·
//        dtmf {digit} · error {description}
//   out: text {token, last} — streamed as OpenAI tokens arrive, '' + last:true
//        closes the talk cycle · end {handoffData} — hands the call back to
//        Twilio (<Connect action> then hangs up).
//
// Messages are processed one at a time (a promise chain), but a model turn
// runs outside the chain so an `interrupt` or a new `prompt` can abort it.
// Every model turn may call tools (tools.ts) for up to MAX_TOOL_ROUNDS rounds;
// tools only touch in-memory state — the CRM is written once, at call end.
import type { ChatCompletionMessageToolCall } from 'openai/resources/chat/completions'
import type { ChatMessage, LlmClient } from './llm.js'
import { log } from './log.js'
import { LINES, SYSTEM_PROMPT } from './prompt.js'
import { applyToolCall, TOOL_DEFINITIONS } from './tools.js'
import { emptyCapture, type CallCapture, type TranscriptEntry, type Usage } from './types.js'

export type OutgoingMessage =
  | { type: 'text'; token: string; last: boolean; interruptible?: boolean }
  | { type: 'end'; handoffData?: string }

export interface SessionOptions {
  callSid: string
  callerId: string | null // E.164
  llm: LlmClient | null
  model: string
  maxReplyTokens: number
  maxTurns: number
  maxCallMs: number
  /** Per-call context system message (or a promise of it while facts load). */
  context: string | Promise<string>
  send: (msg: OutgoingMessage) => void
  now?: () => Date
  /** How long to let TTS finish before sending `end`. */
  endDelayMs?: (spokenChars: number) => number
  /** The TwiML welcomeGreeting Twilio already spoke — recorded so the model doesn't greet twice. */
  greeting?: string
}

export interface SessionSnapshot {
  callSid: string
  callerId: string | null
  startedAt: string
  capture: CallCapture
  transcript: TranscriptEntry[]
  usage: Usage
  model: string
  turns: number
  llmFailures: number
  error: string | null
  endReason: string | null
}

const MAX_TOOL_ROUNDS = 4

export function defaultEndDelayMs(chars: number): number {
  // ElevenLabs speaks ~18 characters a second; add a short beat. Capped so a
  // hung session can't linger in silence after the goodbye.
  return Math.min(10_000, 700 + chars * 55)
}

export class CallSession {
  readonly capture: CallCapture = emptyCapture()
  readonly transcript: TranscriptEntry[] = []
  readonly usage: Usage = { promptTokens: 0, completionTokens: 0, requests: 0 }
  readonly startedAt: Date
  private readonly history: ChatMessage[] = []
  private readonly o: SessionOptions
  private readonly now: () => Date
  private contextText: string | null = null
  private readonly contextReady: Promise<void>
  private chain: Promise<void> = Promise.resolve()
  private currentTurn: Promise<void> | null = null
  private currentAbort: AbortController | null = null
  private turns = 0
  private llmFailures = 0
  private lastError: string | null = null
  private ending = false
  private endReason: string | null = null
  private endTimer: NodeJS.Timeout | null = null
  private limitTimer: NodeJS.Timeout | null = null
  private disposed = false

  constructor(o: SessionOptions) {
    this.o = o
    this.now = o.now ?? (() => new Date())
    this.startedAt = this.now()
    if (o.greeting) {
      this.history.push({ role: 'assistant', content: o.greeting })
      this.pushTranscript('agent', o.greeting)
    }
    this.contextReady = Promise.resolve(o.context)
      .then((c) => {
        this.contextText = c
      })
      .catch((e) => {
        log.error('context_failed', e, { callSid: o.callSid })
        this.contextText = ''
      })
    if (o.maxCallMs > 0) {
      this.limitTimer = setTimeout(() => this.enqueue(() => this.wrapUp('time_limit')), o.maxCallMs)
      this.limitTimer.unref?.()
    }
  }

  get isEnding() {
    return this.ending
  }

  /** Feed one raw WebSocket message. Returns when it has been processed (not when the reply finishes). */
  handleRaw(raw: string): Promise<void> {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw) as Record<string, unknown>
    } catch {
      log.warn('relay_bad_json', { callSid: this.o.callSid })
      return Promise.resolve()
    }
    return this.handle(msg)
  }

  handle(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type) {
      case 'prompt':
        // With partialPrompts off Twilio only sends final utterances, but be safe.
        if (msg.last === false) return Promise.resolve()
        return this.enqueue(() => this.onPrompt(String(msg.voicePrompt ?? '')))
      case 'interrupt':
        return this.enqueue(() => this.onInterrupt(String(msg.utteranceUntilInterrupt ?? '')))
      case 'dtmf':
        this.pushTranscript('event', `Keypad pressed: ${String(msg.digit ?? '?')}`)
        return Promise.resolve()
      case 'error':
        log.warn('relay_error', { callSid: this.o.callSid, description: String(msg.description ?? '').slice(0, 200) })
        this.pushTranscript('event', `Twilio error: ${String(msg.description ?? '').slice(0, 200)}`)
        return Promise.resolve()
      case 'setup':
        return Promise.resolve()
      default:
        log.warn('relay_unknown_message', { callSid: this.o.callSid, type: String(msg.type) })
        return Promise.resolve()
    }
  }

  /** Resolves once any in-flight model turn has finished (tests / shutdown). */
  async idle(): Promise<void> {
    await this.chain
    if (this.currentTurn) await this.currentTurn
  }

  snapshot(): SessionSnapshot {
    return {
      callSid: this.o.callSid,
      callerId: this.o.callerId,
      startedAt: this.startedAt.toISOString(),
      capture: structuredClone(this.capture),
      transcript: this.transcript.map((t) => ({ ...t })),
      usage: { ...this.usage },
      model: this.o.model,
      turns: this.turns,
      llmFailures: this.llmFailures,
      error: this.lastError,
      endReason: this.endReason,
    }
  }

  /** Socket closed: stop everything. */
  dispose() {
    this.disposed = true
    if (this.limitTimer) clearTimeout(this.limitTimer)
    if (this.endTimer) clearTimeout(this.endTimer)
    this.currentAbort?.abort()
  }

  // ── internals ─────────────────────────────────────────────────

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const next = this.chain.then(fn).catch((e) => log.error('session_step_failed', e, { callSid: this.o.callSid }))
    this.chain = next
    return next
  }

  private send(msg: OutgoingMessage) {
    if (this.disposed) return
    try {
      this.o.send(msg)
    } catch (e) {
      log.error('relay_send_failed', e, { callSid: this.o.callSid })
    }
  }

  private pushTranscript(role: TranscriptEntry['role'], text: string, interrupted = false) {
    this.transcript.push({ role, text, at: this.now().toISOString(), ...(interrupted ? { interrupted: true } : {}) })
  }

  private async onPrompt(text: string) {
    const said = text.trim()
    if (!said || this.ending || this.disposed) return
    await this.cancelCurrent()
    this.pushTranscript('caller', said)
    this.history.push({ role: 'user', content: said })
    this.turns += 1
    // A bare sign-off ("Goodbye", "Thanks, bye") gets an instant reply — waiting
    // for the model risks the caller hanging up first and never hearing it.
    if (isSignOff(said)) {
      this.capture.endRequested ??= { reason: 'caller said goodbye' }
      this.speak(LINES.goodbye)
      this.scheduleEnd('caller_goodbye', LINES.goodbye.length)
      return
    }
    if (this.turns > this.o.maxTurns) {
      await this.wrapUp('turn_limit')
      return
    }
    await this.contextReady
    this.startTurn()
  }

  private async onInterrupt(utterance: string) {
    if (this.ending) return
    await this.cancelCurrent()
    const heard = utterance.trim()
    // The caller only heard up to `utterance`: make history + transcript match.
    for (let i = this.transcript.length - 1; i >= 0; i--) {
      const t = this.transcript[i]
      if (t.role === 'caller') break
      if (t.role === 'agent') {
        t.text = heard ? `${heard}…` : t.text
        t.interrupted = true
        break
      }
    }
    for (let i = this.history.length - 1; i >= 0; i--) {
      const m = this.history[i]
      if (m.role === 'user') break
      if (m.role === 'assistant' && typeof m.content === 'string' && m.content) {
        m.content = heard ? `${heard}… [interrupted by the caller]` : `${m.content} [interrupted by the caller]`
        break
      }
    }
  }

  private async cancelCurrent() {
    if (!this.currentTurn) return
    this.currentAbort?.abort()
    try {
      await this.currentTurn
    } catch {
      /* already logged */
    }
    this.currentTurn = null
    this.currentAbort = null
  }

  private startTurn() {
    const controller = new AbortController()
    this.currentAbort = controller
    const turn = this.runTurn(controller.signal)
      .catch((e) => log.error('turn_failed', e, { callSid: this.o.callSid }))
      .finally(() => {
        if (this.currentTurn === turn) {
          this.currentTurn = null
          this.currentAbort = null
        }
      })
    this.currentTurn = turn
  }

  private baseMessages(): ChatMessage[] {
    const msgs: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
    if (this.contextText) msgs.push({ role: 'system', content: this.contextText })
    return msgs
  }

  private async runTurn(signal: AbortSignal) {
    if (!this.o.llm) {
      this.speak(LINES.llmErrorFinal)
      this.scheduleEnd('no_llm', LINES.llmErrorFinal.length)
      return
    }
    let spoken = ''
    let endRequested = false

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let text = ''
      const calls = new Map<number, { id: string; name: string; args: string }>()
      try {
        const stream = this.o.llm.stream({
          model: this.o.model,
          messages: [...this.baseMessages(), ...this.history],
          tools: TOOL_DEFINITIONS,
          maxTokens: this.o.maxReplyTokens,
          signal,
        })
        for await (const chunk of stream) {
          if (signal.aborted) break
          if (chunk.usage) {
            this.usage.promptTokens += chunk.usage.prompt_tokens ?? 0
            this.usage.completionTokens += chunk.usage.completion_tokens ?? 0
          }
          for (const choice of chunk.choices ?? []) {
            const delta = choice.delta
            if (!delta) continue
            if (delta.content) {
              let token = delta.content
              // Separate this round's speech from the previous round's.
              if (!text && spoken && !/\s$/.test(spoken) && !/^\s/.test(token)) token = ` ${token}`
              text += delta.content
              spoken += token
              this.send({ type: 'text', token, last: false })
            }
            for (const tc of delta.tool_calls ?? []) {
              const cur = calls.get(tc.index) ?? { id: '', name: '', args: '' }
              if (tc.id) cur.id = tc.id
              if (tc.function?.name) cur.name += tc.function.name
              if (tc.function?.arguments) cur.args += tc.function.arguments
              calls.set(tc.index, cur)
            }
          }
        }
        this.usage.requests += 1
      } catch (e) {
        if (signal.aborted) {
          this.recordPartial(text)
          return
        }
        this.usage.requests += 1
        this.recordPartial(text)
        this.onLlmError(e, spoken)
        return
      }

      if (signal.aborted) {
        this.recordPartial(text)
        return
      }

      const toolCalls: ChatCompletionMessageToolCall[] = [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .filter(([, c]) => c.name)
        .map(([i, c]) => ({
          id: c.id || `call_${this.turns}_${round}_${i}`,
          type: 'function' as const,
          function: { name: c.name, arguments: c.args || '{}' },
        }))

      this.history.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      })
      if (text.trim()) this.pushTranscript('agent', text.trim())

      if (!toolCalls.length) break

      for (const call of toolCalls) {
        const fn = (call as { function: { name: string; arguments: string } }).function
        const outcome = applyToolCall(this.capture, fn.name, fn.arguments, {
          now: this.now(),
          callerId: this.o.callerId,
        })
        this.history.push({ role: 'tool', tool_call_id: call.id, content: outcome.result })
        this.pushTranscript('event', outcome.event)
        if (outcome.end) endRequested = true
      }
      if (endRequested) break
    }

    this.llmFailures = 0

    if (endRequested) {
      if (!spoken.trim()) {
        this.speak(LINES.goodbye)
        spoken = LINES.goodbye
      } else {
        this.send({ type: 'text', token: '', last: true })
      }
      this.scheduleEnd(this.capture.endRequested?.reason ?? 'assistant_ended', spoken.length)
      return
    }

    if (spoken) {
      this.send({ type: 'text', token: '', last: true })
    } else {
      // Tool rounds exhausted without a word — never leave the caller in silence.
      this.speak("Thank you, I've noted that. Is there anything else I can help with?")
    }
  }

  /** Aborted / failed mid-stream: keep what was already said, in order. */
  private recordPartial(text: string) {
    if (!text.trim()) return
    this.history.push({ role: 'assistant', content: text })
    this.pushTranscript('agent', text.trim(), true)
  }

  private onLlmError(e: unknown, spokenSoFar: string) {
    this.llmFailures += 1
    this.lastError = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300)
    log.error('llm_failed', e, { callSid: this.o.callSid, failures: this.llmFailures })
    if (spokenSoFar) this.send({ type: 'text', token: ' ', last: false })
    if (this.llmFailures >= 2) {
      this.speak(LINES.llmErrorFinal)
      this.scheduleEnd('llm_failed', LINES.llmErrorFinal.length)
    } else {
      this.speak(LINES.llmError)
    }
  }

  /** A fixed line spoken by the service (no model). */
  private speak(text: string) {
    this.send({ type: 'text', token: text, last: true })
    this.history.push({ role: 'assistant', content: text })
    this.pushTranscript('agent', text)
  }

  private async wrapUp(reason: string) {
    if (this.ending) return
    await this.cancelCurrent()
    this.pushTranscript('event', reason === 'time_limit' ? 'Maximum call length reached' : 'Maximum number of turns reached')
    this.speak(LINES.timeLimit)
    this.scheduleEnd(reason, LINES.timeLimit.length)
  }

  private scheduleEnd(reason: string, spokenChars: number) {
    if (this.ending) return
    this.ending = true
    this.endReason = reason
    if (this.limitTimer) clearTimeout(this.limitTimer)
    const delay = (this.o.endDelayMs ?? defaultEndDelayMs)(spokenChars)
    this.endTimer = setTimeout(() => {
      this.send({ type: 'end', handoffData: JSON.stringify({ reason, callSid: this.o.callSid }) })
    }, delay)
    this.endTimer.unref?.()
  }
}

const SIGN_OFF =
  /^(?:(?:ok(?:ay)?|right|yeah|yes|no|great|lovely|perfect|thanks?(?: you)?(?: so much| very much)?|cheers)[\s,.!]*)*(?:good ?bye|bye(?: bye| now)?|that'?s (?:all|it)(?: for now)?|speak (?:to you )?soon|talk (?:to you )?(?:later|soon))[\s,.!]*(?:thanks?(?: you)?|cheers)?[\s,.!]*$/i

/** True for an utterance that is only a sign-off (not "bye the way, …"). */
export function isSignOff(text: string): boolean {
  return SIGN_OFF.test(text.trim())
}
