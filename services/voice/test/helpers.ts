// Test helpers: a scripted fake LLM and env builder.
import type { CompleteRequest, CompleteResult, LlmClient, StreamChunk, StreamRequest } from '../src/llm.js'
import { loadEnv } from '../src/env.js'

export const text = (content: string): StreamChunk => ({ choices: [{ delta: { content } }] })
export const toolDelta = (index: number, id: string | undefined, name: string | undefined, args: string): StreamChunk => ({
  choices: [{ delta: { tool_calls: [{ index, ...(id ? { id } : {}), function: { ...(name ? { name } : {}), arguments: args } }] } }],
})
export const usage = (p: number, c: number): StreamChunk => ({ choices: [], usage: { prompt_tokens: p, completion_tokens: c } })

export type Script = StreamChunk[] | Error | ((req: StreamRequest) => AsyncIterable<StreamChunk>)

/** Each stream() call consumes the next script entry. */
export class FakeLlm implements LlmClient {
  requests: StreamRequest[] = []
  completes: CompleteRequest[] = []
  constructor(
    private scripts: Script[],
    private completeImpl: (req: CompleteRequest) => Promise<CompleteResult> = async () => ({
      text: '{"summary":"Jane called about membership."}',
      promptTokens: 10,
      completionTokens: 5,
    }),
  ) {}
  async *stream(req: StreamRequest): AsyncIterable<StreamChunk> {
    this.requests.push({ ...req, messages: structuredClone(req.messages) })
    const s = this.scripts.shift()
    if (!s) throw new Error('no script left')
    if (s instanceof Error) throw s
    if (typeof s === 'function') {
      yield* s(req)
      return
    }
    for (const c of s) {
      if (req.signal.aborted) return
      yield c
    }
  }
  complete(req: CompleteRequest): Promise<CompleteResult> {
    this.completes.push(req)
    return this.completeImpl(req)
  }
}

export function testEnv(overrides: Record<string, string> = {}) {
  return loadEnv({
    PORT: '4200',
    VOICE_PUBLIC_URL: 'https://voice.example.test',
    TWILIO_AUTH_TOKEN: 'test_auth_token_123',
    OPENAI_API_KEY: 'sk-test',
    ...overrides,
  } as NodeJS.ProcessEnv)
}

export const tick = () => new Promise((r) => setImmediate(r))
