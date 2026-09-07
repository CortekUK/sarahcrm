// POST /api/admin/help/chat
//
// The admin Help Assistant — the floating "Help" button in the dashboard.
// Answers staff questions about how to use the platform ("how do I set up an
// introduction between two people?") from the curated knowledge base in
// `docs/knowledge/`.
//
// Retrieval is model-driven. The system prompt always carries the small core
// brief (~2.5k tokens), which answers the most common questions outright and
// lists which reference file covers what. When it needs more, the model calls
// the `fetch_reference` tool and we hand back the whole file — no chunking, no
// embeddings, no vector store. With four candidate documents this is a routing
// problem, not a search problem, and loading a playbook whole beats retrieving
// a fragment of one.
//
// Admin-only. The transcript is supplied by the client rather than persisted —
// this is an authenticated internal tool, so there is no anonymous-abuse
// surface to defend and no migration to run. Caps below bound the cost.
//
// Body: { messages: { role: 'user' | 'assistant', content: string }[],
//          action?: 'compact' }
// Returns: { reply: string, sources: string[], truncated?: boolean,
//            limit?: 'context' }
//   or, for action 'compact': { summary: string }
//
// A long conversation eventually outgrows either our own replay cap or the
// model's window. Rather than silently forgetting, the route tells the client
// (`truncated` / `limit`) so it can offer to compact the thread — replacing the
// transcript with a short recap — or start over.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'
import {
  FETCHABLE_REFERENCES,
  FETCHABLE_FILE_NAMES,
  readCoreBrief,
  readKnowledgeFile,
} from '@/lib/help/knowledge'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Caps ────────────────────────────────────────────────────────────
const MAX_MESSAGE_CHARS = 2000 // per user message
const MAX_HISTORY_TURNS = 20 // prior messages replayed to the model
const MAX_TOOL_ROUNDS = 2 // reference fetches per answer
const MAX_COMPLETION_TOKENS = 800

const CANNED = {
  noKey:
    'The help assistant is not configured yet — an OpenAI API key is missing. In the meantime, the full training guide is in docs/knowledge/.',
  error:
    "Sorry — I couldn't reach the assistant just then. Please try again in a moment.",
} as const

const COMPACT_SYSTEM = `You compress a help-desk conversation into a handover note.

Write a short recap (under 150 words) of what the person asked about and what
they were told, so the conversation can continue with your recap standing in for
the full transcript. Keep any specifics that later questions might depend on —
screen names, the task they are mid-way through, decisions made. Drop pleasantries
and anything already resolved. Write it as plain notes, no preamble, no heading.`

function buildSystemPrompt(coreBrief: string | null): string {
  const referenceList = Object.entries(FETCHABLE_REFERENCES)
    .map(([file, description]) => `- \`${file}\` — ${description}`)
    .join('\n')

  return `${
    coreBrief ??
    'You are the in-app help assistant for The Club by Sarah Restrick, a private members club CRM. The core brief could not be loaded, so rely on the reference documents below.'
  }

---

# How you must operate

You are answering a signed-in member of staff inside the admin dashboard.

## Grounding
Answer ONLY from the core brief above and the reference documents you fetch.
Never invent a screen, button, field, menu item or status value. If the
knowledge base does not cover something, say plainly that you don't have it
documented and point them to the closest screen — do not guess. If the person
describes behaviour that contradicts your knowledge, trust them about what they
are seeing, say the guide may be out of date, and tell them what it says.

## Fetching references
You can call \`fetch_reference\` to load one document at a time:

${referenceList}

Call it when the core brief doesn't already contain the answer. Most "how do I…"
questions are answered by \`07-workflows-and-faq.md\` — try that first. You may
fetch at most ${MAX_TOOL_ROUNDS} times per answer, so choose deliberately rather
than fetching everything. If the brief already answers the question, just answer
— don't fetch for the sake of it.

## Answering
- British English. Warm, direct, and brief — you are a colleague, not a manual.
- For a task, give numbered steps in order. Name the exact screen and put the
  exact button label in bold, e.g. click **Create Introduction**.
- Lead with the answer. No preamble, no "great question", no restating the ask.
- Typically under 200 words. Go longer only for genuinely multi-stage tasks.
- Mention a consequence only when it matters — e.g. that an introduction stays
  open until someone records the Deal outcome.
- Stay on the platform. If asked something unrelated (general knowledge, coding,
  personal requests), say briefly that you only cover The Club platform.
- Never mention file names, API endpoints, database tables or code paths. Staff
  see screens and buttons, not internals. "The guide says…" is fine; "according
  to 07-workflows-and-faq.md" is not.`
}

const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_reference',
      description:
        'Load one reference document from the platform knowledge base to answer the question accurately. Prefer 07-workflows-and-faq.md for "how do I" questions.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: {
            type: 'string',
            enum: FETCHABLE_FILE_NAMES,
            description: 'The reference document to load.',
          },
        },
        required: ['file'],
      },
    },
  },
]

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only.', status: 403 as const }
  }
  return { userId: user.id }
}

interface IncomingMessage {
  role: 'user' | 'assistant'
  content: string
}

// Keeps only well-formed user/assistant turns, trims them, and caps both the
// length of each and how many are replayed. Reports whether anything was
// dropped so the caller can warn the user instead of silently forgetting.
function sanitiseHistory(raw: unknown): {
  messages: IncomingMessage[]
  truncated: boolean
} {
  if (!Array.isArray(raw)) return { messages: [], truncated: false }
  const cleaned: IncomingMessage[] = []
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue
    const role = (m as { role?: unknown }).role
    const content = (m as { content?: unknown }).content
    if (role !== 'user' && role !== 'assistant') continue
    if (typeof content !== 'string') continue
    const trimmed = content.trim().slice(0, MAX_MESSAGE_CHARS)
    if (!trimmed) continue
    cleaned.push({ role, content: trimmed })
  }
  return {
    messages: cleaned.slice(-MAX_HISTORY_TURNS),
    truncated: cleaned.length > MAX_HISTORY_TURNS,
  }
}

// OpenAI signals an oversized prompt with a 400 and a context-length code.
function isContextLengthError(e: unknown): boolean {
  const err = e as { code?: unknown; status?: unknown; message?: unknown }
  if (err?.code === 'context_length_exceeded') return true
  const message = typeof err?.message === 'string' ? err.message : ''
  return err?.status === 400 && /context length|maximum context/i.test(message)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) {
    return Response.json({ error: auth.error }, { status: auth.status })
  }

  let body: { messages?: unknown; action?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const isCompact = body.action === 'compact'
  const { messages: history, truncated } = sanitiseHistory(body.messages)

  if (history.length === 0) {
    return Response.json(
      { error: 'Expected a non-empty messages array.' },
      { status: 400 },
    )
  }
  if (!isCompact && history[history.length - 1].role !== 'user') {
    return Response.json(
      { error: 'Expected the messages array to end in a user message.' },
      { status: 400 },
    )
  }

  const apiKey = process.env.OPENAI_API_KEY ?? null
  if (!apiKey) {
    return isCompact
      ? Response.json({ error: 'Not configured.' }, { status: 503 })
      : Response.json({ reply: CANNED.noKey, sources: [] })
  }

  // Pinned separately from the rest of the platform so the help assistant can
  // run on a cheaper model than the content-generation features.
  const chatModel =
    process.env.OPENAI_MODEL_HELP || process.env.OPENAI_MODEL || 'gpt-4o-mini'

  // ── Compaction ────────────────────────────────────────────────────
  // Collapses the transcript into a short recap the client swaps in for the
  // full history, so a long session can continue instead of being reset.
  if (isCompact) {
    const transcript = history
      .map((m) => `${m.role === 'user' ? 'Staff' : 'Assistant'}: ${m.content}`)
      .join('\n\n')
    const startedAtCompact = performance.now()
    try {
      const response = await new OpenAI({ apiKey }).chat.completions.create({
        model: chatModel,
        messages: [
          { role: 'system', content: COMPACT_SYSTEM },
          { role: 'user', content: transcript },
        ],
        max_tokens: 300,
        temperature: 0.2,
      })
      await logOpenAIUsage({
        feature: 'admin_help_compact',
        model: chatModel,
        usage: response.usage,
        startedAt: startedAtCompact,
        userId: auth.userId,
      })
      const summary = response.choices[0]?.message?.content?.trim()
      if (!summary) throw new Error('empty summary')
      return Response.json({ summary })
    } catch (e) {
      console.error('[help/chat] compaction failed:', e)
      await logOpenAIUsage({
        feature: 'admin_help_compact',
        model: chatModel,
        startedAt: startedAtCompact,
        userId: auth.userId,
        error: e instanceof Error ? e.message : 'compaction failed',
      })
      return Response.json({ error: 'Could not summarise.' }, { status: 502 })
    }
  }

  const coreBrief = await readCoreBrief()
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(coreBrief) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]

  const model = chatModel
  const openai = new OpenAI({ apiKey })
  const startedAt = performance.now()
  const sources: string[] = []

  try {
    // One turn per allowed tool round, plus a final turn with tools withdrawn
    // so the model is forced to answer rather than fetch again.
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const isFinalRound = round === MAX_TOOL_ROUNDS
      const response = await openai.chat.completions.create({
        model,
        messages,
        max_tokens: MAX_COMPLETION_TOKENS,
        temperature: 0.3,
        ...(isFinalRound ? {} : { tools: TOOLS, tool_choice: 'auto' as const }),
      })
      await logOpenAIUsage({
        feature: 'admin_help_chat',
        model,
        usage: response.usage,
        startedAt,
        userId: auth.userId,
      })

      const choice = response.choices[0]?.message
      if (!choice) break

      const toolCalls = choice.tool_calls ?? []
      if (toolCalls.length === 0) {
        const reply = choice.content?.trim()
        if (reply) {
          return Response.json({
            reply,
            sources,
            ...(truncated ? { truncated: true } : {}),
          })
        }
        break
      }

      // Echo the assistant's tool-call turn back before the tool results —
      // OpenAI requires every tool message to follow its originating call.
      messages.push(choice)

      for (const call of toolCalls) {
        if (call.type !== 'function') continue
        let file = ''
        try {
          const args = JSON.parse(call.function.arguments || '{}')
          file = typeof args.file === 'string' ? args.file : ''
        } catch {
          // Malformed arguments — fall through to the not-found message.
        }
        const content = await readKnowledgeFile(file)
        if (content && !sources.includes(file)) sources.push(file)
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content:
            content ??
            `No document named "${file}" is available. Answer from what you already have, or say you don't have it documented.`,
        })
      }
    }

    // Ran out of rounds without the model producing prose.
    return Response.json({ reply: CANNED.error, sources })
  } catch (e) {
    console.error('[help/chat] OpenAI request failed:', e)
    await logOpenAIUsage({
      feature: 'admin_help_chat',
      model,
      startedAt,
      userId: auth.userId,
      error: e instanceof Error ? e.message : 'OpenAI request failed',
    })
    // An oversized prompt is recoverable by the user — tell the client so it
    // can offer to compact the thread rather than just showing a dead end.
    if (isContextLengthError(e)) {
      return Response.json({
        reply:
          'This conversation has grown too long for me to hold all at once. Compact it to a short recap, or start over.',
        sources,
        limit: 'context',
      })
    }
    return Response.json({ reply: CANNED.error, sources: [] })
  }
}
