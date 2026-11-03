// Server-only: pick a contact sector from a company's name + description when
// Clay returns no industry (e.g. "The Funding Globe" — description says
// business lending, industry is blank). Keyword-matching a long description
// misfires (one passing "events" wins), so a small model chooses one of the
// canonical sector keys — or "none" when nothing clearly fits. Never throws:
// no key, a timeout or a bad answer all resolve to null (stays Unsegmented).

import OpenAI from 'openai'
import { SECTORS } from './sectors'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'

const KEYS = SECTORS.map((s) => s.key)
const TIMEOUT_MS = 12_000

export async function classifySector(input: {
  name: string | null
  description: string | null
  domain: string
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  const description = (input.description ?? '').trim().slice(0, 1500)
  if (!apiKey || (!description && !input.name)) return null

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini'
  const startedAt = performance.now()
  try {
    const openai = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 })
    const res = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 20,
      messages: [
        {
          role: 'system',
          content:
            'Classify a company into exactly one sector for a UK members club CRM. ' +
            `Sectors: ${SECTORS.map((s) => `${s.key} = ${s.label}`).join('; ')}. ` +
            'Answer "none" if the information is too thin or nothing clearly fits.',
        },
        {
          role: 'user',
          content: `Company: ${input.name ?? '(unknown)'}\nWebsite: ${input.domain}\nDescription: ${description || '(none)'}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'sector',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { sector: { type: 'string', enum: [...KEYS, 'none'] } },
            required: ['sector'],
          },
        },
      },
    })
    await logOpenAIUsage({ feature: 'contact-sector', model, startedAt, usage: res.usage })
    const sector = (JSON.parse(res.choices[0]?.message?.content ?? '{}') as { sector?: string }).sector
    return sector && KEYS.includes(sector) ? sector : null
  } catch (e) {
    await logOpenAIUsage({
      feature: 'contact-sector',
      model,
      startedAt,
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}
