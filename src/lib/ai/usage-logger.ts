// Lightweight OpenAI usage logger. Logs to console only — no DB table for
// usage history exists yet on sarahcrm. Mirrors the IFG-side API surface so
// the AI route can call it unconditionally.

interface UsageInput {
  feature: string
  model: string
  startedAt: number
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  } | null
  error?: string
  userId?: string
}

export async function logOpenAIUsage(input: UsageInput): Promise<void> {
  const latencyMs = Math.round(performance.now() - input.startedAt)
  const base = {
    feature: input.feature,
    model: input.model,
    latency_ms: latencyMs,
    user_id: input.userId,
  }
  if (input.error) {
    console.warn('[openai] error', { ...base, error: input.error })
    return
  }
  console.log('[openai] success', {
    ...base,
    prompt_tokens: input.usage?.prompt_tokens,
    completion_tokens: input.usage?.completion_tokens,
    total_tokens: input.usage?.total_tokens,
  })
}
