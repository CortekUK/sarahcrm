// The narrow LLM seam the call session uses, so tests can replay a scripted
// stream without OpenAI. `stream` yields OpenAI ChatCompletionChunk-shaped
// objects (only the fields we read); `complete` returns one JSON string.
import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'

export type ChatMessage = ChatCompletionMessageParam

export interface StreamChunk {
  choices: {
    delta?: {
      content?: string | null
      tool_calls?: {
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }[]
    }
    finish_reason?: string | null
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
}

export interface StreamRequest {
  model: string
  messages: ChatMessage[]
  tools?: ChatCompletionTool[]
  maxTokens: number
  signal: AbortSignal
}

export interface CompleteRequest {
  model: string
  messages: ChatMessage[]
  maxTokens: number
  json?: boolean
  signal?: AbortSignal
}

export interface CompleteResult {
  text: string
  promptTokens: number
  completionTokens: number
}

export interface LlmClient {
  stream(req: StreamRequest): AsyncIterable<StreamChunk>
  complete(req: CompleteRequest): Promise<CompleteResult>
}

export function createOpenAiClient(apiKey: string): LlmClient {
  const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 20_000 })
  return {
    async *stream(req) {
      const stream = await client.chat.completions.create(
        {
          model: req.model,
          messages: req.messages,
          tools: req.tools,
          tool_choice: req.tools?.length ? 'auto' : undefined,
          parallel_tool_calls: req.tools?.length ? true : undefined,
          max_completion_tokens: req.maxTokens,
          temperature: 0.4,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: req.signal },
      )
      for await (const chunk of stream) yield chunk as StreamChunk
    },
    async complete(req) {
      const res = await client.chat.completions.create(
        {
          model: req.model,
          messages: req.messages,
          max_completion_tokens: req.maxTokens,
          temperature: 0.2,
          ...(req.json ? { response_format: { type: 'json_object' as const } } : {}),
        },
        { signal: req.signal },
      )
      return {
        text: res.choices[0]?.message?.content ?? '',
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
      }
    },
  }
}
