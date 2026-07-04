// AI contract drafting endpoint — the contract-builder counterpart to
// /api/templates/ai-generate. Reuses the same block schema + expansion helpers
// so the output drops straight onto the shared canvas, but with a contract-
// focused system prompt (agreements / NDAs) and no email-only concerns
// (subject/preheader/events/attachments). Chat history persists to
// contract_ai_chats / contract_ai_messages.
//
// POST /api/contracts/ai-generate
// Body: { prompt, mode, docType?, existingBlocks?, existingTheme?, chat_id?, contract_id? }
// Returns: { intent, reply, name, blocks, theme, chat_id }
//
// Admin only.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import {
  aiTemplateResponseSchema,
  expandAiBlocks,
  mergeAiBlocksWithExisting,
  compactBlockForPrompt,
  openAiJsonSchema,
  AI_FONT_OPTIONS,
  resolveAiFont,
} from '@/lib/templates/ai-schema'
import type { EditorBlock } from '@/lib/templates/editor-types'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { Json } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  prompt?: string
  mode?: 'create' | 'enhance'
  docType?: string
  existingBlocks?: EditorBlock[]
  existingTheme?: Record<string, string> | null
  chat_id?: string | null
  contract_id?: string | null
}

function getAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function deriveChatTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'New contract chat'
  const first = cleaned.split(/[.!?]\s/)[0]
  let title = first.length <= 60 ? first : cleaned
  if (title.length > 60) {
    const cut = title.slice(0, 60)
    const lastSpace = cut.lastIndexOf(' ')
    title = (lastSpace > 30 ? cut.slice(0, lastSpace) : cut) + '…'
  }
  return title.replace(/[?!.,;:]+$/, '')
}

const SYSTEM_PROMPT = `You are a contract-drafting assistant for The Club by Sarah Restrick — a private members' community. You help an admin compose legal documents (membership agreements, NDAs, introducer/commission agreements, contracts) on a visual block canvas that is later sent to ONE member for e-signature via DocuSign.

Every response goes through a structured JSON schema with these top-level fields:
- \`intent\`: "answer" | "create" | "enhance"
- \`reply\`: a short friendly chat message (ALWAYS required)
- \`name\`, \`subject\`, \`preheader\`, \`blocks\`: content (this is a CONTRACT, so put the document title in \`name\`; \`subject\`/\`preheader\` are unused — set them to a short sensible string / null)
- \`theme\`: optional chrome colours (usually leave null for contracts)
- \`event_picks\`: always null (contracts have no events)

# Intent
- **create** — build ONE contract on the canvas. Fill \`name\` (the document title) and \`blocks\`. Use for "draft an NDA", "create a membership agreement", etc.
- **enhance** — edit the existing canvas. Return the FULL block list with only the requested change applied; copy untouched blocks verbatim.
- **answer** — questions, options, or discussion. Set \`name\`/\`subject\` to "", \`blocks\` to []. When the user asks for multiple options/samples, ALWAYS answer mode.

# DocuSign signature fields — CRITICAL
The member signs electronically. Place signature fields by inserting these EXACT tokens as plain text inside a text block where they belong (usually a signature block at the very end):
- \`[[signature]]\` — where the member signs (REQUIRED — every contract must contain at least one)
- \`[[initials]]\` — initials (use where a clause needs initialling)
- \`[[signed_name]]\` — the member's printed name (auto-filled by DocuSign)
- \`[[date_signed]]\` — the date they sign (auto-filled by DocuSign)

Always end a contract with a signature block text that includes \`[[signature]]\` and \`[[date_signed]]\`, e.g.:
"Signed by the Member: [[signature]]  Printed name: [[signed_name]]  Date: [[date_signed]]".

# Member merge fields
For details you know about the recipient, use merge tags — they are filled from the selected member before sending and are READ-ONLY in the signed document:
\`{{first_name}}\`, \`{{last_name}}\`, \`{{email}}\`, \`{{phone}}\`, \`{{membership_tier}}\`, \`{{company_name}}\`.
Example: "This Agreement is made between The Club by Sarah Restrick and {{first_name}} {{last_name}} ({{company_name}})."

# Available block types
- **text** — the workhorse. \`html\` accepts p, br, strong, em, u, a, ul, ol, li, span. Put clauses, recitals, and the signature line here. Signature tokens and merge tags go inside text.
- **heading** — the document title and section headings (e.g. "1. Confidentiality"). Use \`color\` #2C2825 for a formal tone.
- **divider** — separate sections.
- **spacer** — vertical whitespace.
Avoid button/social/video/image blocks in contracts unless explicitly asked. Do NOT use sarah_signature (that's an email marketing signature, not a legal one — use a text block with [[signature]] instead).

# Style
- Formal, precise British English, but readable — this is a members' club, not a bank. Short numbered clauses.
- Structure: title (heading) → short intro/parties paragraph → numbered clauses (heading + text each) → signature block (text with tokens).
- Never invent specific figures, dates, or legal jurisdictions the user didn't provide — leave a clear placeholder or ask.
- Don't include CSS, <script>, <style>, or <iframe>.

# Fonts
Only these named fonts are allowed (exact names): ${AI_FONT_OPTIONS}. Set \`theme.fontFamily\` for the whole document; leave block \`font\` null to inherit. For contracts, leave theme null unless asked.

# reply
Conversational, 1-3 sentences. For create/enhance, briefly say what you drafted/changed. Reply in the user's language.`

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, first_name')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'AI contract drafting is restricted to admin users.', status: 403 as const }
  }
  return { profile }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return Response.json({ error: 'OPENAI_API_KEY not configured.' }, { status: 500 })

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const prompt = body.prompt?.trim() ?? ''
    if (!prompt) return Response.json({ error: 'prompt is required' }, { status: 400 })
    const mode: 'create' | 'enhance' = body.mode === 'enhance' ? 'enhance' : 'create'

    const admin = getAdmin()

    // Prior turns for context.
    const priorMessages: { role: 'user' | 'assistant'; content: string }[] = []
    if (body.chat_id) {
      const { data: msgs } = await admin
        .from('contract_ai_messages')
        .select('role, content, created_at')
        .eq('chat_id', body.chat_id)
        .order('created_at', { ascending: true })
        .limit(20)
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          if (m && (m.role === 'user' || m.role === 'assistant') && m.content) {
            priorMessages.push({ role: m.role, content: String(m.content) })
          }
        }
      }
    }

    const existingCompact: ReturnType<typeof compactBlockForPrompt>[] = []
    if (mode === 'enhance' && Array.isArray(body.existingBlocks)) {
      for (const b of body.existingBlocks) {
        const compact = compactBlockForPrompt(b)
        if (compact) existingCompact.push(compact)
      }
    }

    const userMessage = (() => {
      const parts: string[] = []
      if (body.docType) parts.push(`Document type: ${body.docType}.`)
      if (mode === 'enhance' && existingCompact.length > 0) {
        parts.push(
          [
            'You are editing an existing contract. Apply ONLY the change the user asks for; copy untouched blocks verbatim and keep their order.',
            `Current blocks (JSON):\n${JSON.stringify(existingCompact, null, 2)}`,
            `User instruction:\n${prompt}`,
          ].join('\n'),
        )
      } else {
        parts.push(`Draft a new contract. User description:\n${prompt}`)
      }
      return parts.join('\n\n')
    })()

    const openai = new OpenAI({ apiKey })
    const model = process.env.OPENAI_MODEL_TEMPLATE_AI || process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'

    const firstName = auth.profile.first_name ?? ''
    const systemPrompt = firstName
      ? `The current user's first name is ${firstName}; address them naturally.\n\n${SYSTEM_PROMPT}`
      : SYSTEM_PROMPT

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...priorMessages,
      { role: 'user', content: userMessage },
    ]

    let response
    const startedAt = performance.now()
    try {
      response = await openai.chat.completions.create({
        model,
        messages,
        response_format: { type: 'json_schema', json_schema: openAiJsonSchema },
        temperature: 0.4,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'OpenAI request failed'
      await logOpenAIUsage({ feature: 'contract-ai-generate', model, startedAt, error: message, userId: auth.profile.id })
      return Response.json({ error: `OpenAI: ${message}` }, { status: 502 })
    }
    await logOpenAIUsage({ feature: 'contract-ai-generate', model, usage: response.usage, startedAt, userId: auth.profile.id })

    const choice = response.choices[0]
    if (choice?.message?.refusal) {
      return Response.json({ error: `AI refused: ${choice.message.refusal}` }, { status: 422 })
    }
    const raw = choice?.message?.content
    if (!raw) return Response.json({ error: 'OpenAI returned an empty response.' }, { status: 502 })

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return Response.json({ error: 'OpenAI returned invalid JSON.' }, { status: 502 })
    }

    const validation = aiTemplateResponseSchema.safeParse(parsed)
    if (!validation.success) {
      return Response.json(
        { error: 'AI returned content that did not match the expected schema.', issues: validation.error.issues },
        { status: 502 },
      )
    }

    const aiIntent = validation.data.intent
    const reply = validation.data.reply

    let blocks: ReturnType<typeof expandAiBlocks> = []
    let name = ''
    type ThemeOverrides = { fontFamily?: string } & Record<string, string>
    let theme: ThemeOverrides | null = null

    if (aiIntent !== 'answer') {
      blocks =
        aiIntent === 'enhance' && Array.isArray(body.existingBlocks)
          ? mergeAiBlocksWithExisting(validation.data.blocks, body.existingBlocks)
          : expandAiBlocks(validation.data.blocks)
      name = validation.data.name
      const t = validation.data.theme
      if (t?.fontFamily) {
        const f = resolveAiFont(t.fontFamily)
        if (f) theme = { fontFamily: f }
      }
    }

    // Persist chat (create lazily) + this turn.
    let chatId = body.chat_id ?? null
    if (!chatId) {
      const { data: created, error } = await admin
        .from('contract_ai_chats')
        .insert({
          user_id: auth.profile.id,
          title: deriveChatTitle(prompt),
          contract_id: body.contract_id ?? null,
        })
        .select('id')
        .single()
      if (!error) chatId = created.id
    }
    if (chatId) {
      await admin.from('contract_ai_messages').insert([
        { chat_id: chatId, role: 'user', content: prompt, blocks_snapshot: null },
        {
          chat_id: chatId,
          role: 'assistant',
          content: reply,
          blocks_snapshot: aiIntent === 'answer' ? null : (blocks as unknown as Json),
        },
      ])
    }

    return Response.json({ intent: aiIntent, reply, name, blocks, theme, chat_id: chatId })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
