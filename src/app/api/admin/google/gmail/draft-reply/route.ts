// POST /api/admin/google/gmail/draft-reply
//
// Generates (does NOT save) an AI-drafted reply to a Gmail thread, in The
// Club's voice. Returns { subject, body_html } for the admin to review; saving
// it into Gmail as a draft is a separate, explicit step (create-draft route).
// Admin only.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'
import { gmailClient } from '@/lib/google/client'
import { listThreadMessages } from '@/lib/google/gmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const replySchema = z.object({ subject: z.string(), body_html: z.string() })
const openAiJsonSchema = {
  name: 'gmail_reply',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      subject: { type: 'string', description: 'Reply subject, usually "Re: <original>"' },
      body_html: { type: 'string', description: 'The reply body as simple HTML (paragraphs).' },
    },
    required: ['subject', 'body_html'],
  },
} as const

const SYSTEM_PROMPT = `You draft email replies for The Club by Sarah Restrick, a premium private members' club for business leaders. Write warm, concise, commercially-minded replies in a founder-led, relationship-first voice. Be helpful and specific to the thread. Keep it short (a few short paragraphs). Output simple HTML for the body (<p> paragraphs, no images or styles). Do not invent facts, prices, or commitments; if information is missing, ask a brief clarifying question or offer to follow up. Sign off as "The Club by Sarah Restrick".`

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
  if (!profile || profile.role !== 'admin') return { error: 'Admin only.', status: 403 as const }
  return { profile }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: { thread_id?: string; guidance?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.thread_id) return Response.json({ error: 'thread_id is required.' }, { status: 400 })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return Response.json({ error: 'OpenAI is not configured.' }, { status: 503 })

  // Pull the conversation for context.
  let transcript: string
  let lastSubject = ''
  try {
    const gmail = gmailClient()
    const msgs = await listThreadMessages(gmail, body.thread_id)
    if (!msgs.length) return Response.json({ error: 'Thread not found.' }, { status: 404 })
    lastSubject = msgs[msgs.length - 1].subject
    transcript = msgs
      .map((m) => `From: ${m.from}\nDate: ${m.internalDate}\nSubject: ${m.subject}\n\n${m.bodyText.slice(0, 4000)}`)
      .join('\n\n---\n\n')
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to read thread'
    return Response.json({ error: message }, { status: 502 })
  }

  const userMessage = [
    'Draft a reply to the most recent message in this email thread.',
    body.guidance ? `Guidance from the team: ${body.guidance}` : '',
    '',
    'Conversation (oldest first):',
    transcript,
  ]
    .filter(Boolean)
    .join('\n')

  const openai = new OpenAI({ apiKey })
  const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'
  const startedAt = performance.now()
  let response
  try {
    response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_schema', json_schema: openAiJsonSchema },
      temperature: 0.6,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'OpenAI request failed'
    await logOpenAIUsage({ feature: 'gmail-draft-reply', model, startedAt, error: message, userId: auth.profile.id })
    return Response.json({ error: `OpenAI: ${message}` }, { status: 502 })
  }
  await logOpenAIUsage({ feature: 'gmail-draft-reply', model, usage: response.usage, startedAt, userId: auth.profile.id })

  const raw = response.choices[0]?.message?.content
  if (!raw) return Response.json({ error: 'OpenAI returned an empty response.' }, { status: 502 })

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'OpenAI returned invalid JSON.' }, { status: 502 })
  }
  const validation = replySchema.safeParse(parsed)
  if (!validation.success) {
    return Response.json({ error: 'AI response failed validation.' }, { status: 502 })
  }

  const subject = validation.data.subject || (lastSubject.startsWith('Re:') ? lastSubject : `Re: ${lastSubject}`)
  return Response.json({ ok: true, subject, body_html: validation.data.body_html })
}
