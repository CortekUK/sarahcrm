// POST /api/admin/google/gmail/extract
//
// Runs AI extraction over UNMATCHED inbound Gmail messages (member_id null)
// that don't yet have an extraction, proposing potential new contacts and
// detected introductions. Recommendation-only — writes `pending` rows to
// gmail_extractions; a human approves/dismisses later. Capped per call.
// Callable by an admin (session) or the cron (Bearer CRON_SECRET).

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH = 15

function getAdminDb() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function isAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false
    const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    return p?.role === 'admin'
  } catch {
    return false
  }
}

const extractionSchema = z.object({
  contact: z
    .object({
      first_name: z.string().nullable(),
      last_name: z.string().nullable(),
      email: z.string().nullable(),
      company: z.string().nullable(),
      position: z.string().nullable(),
      reason: z.string().nullable(),
    })
    .nullable(),
  introduction: z
    .object({ from_party: z.string().nullable(), to_party: z.string().nullable(), context: z.string().nullable() })
    .nullable(),
})

const openAiJsonSchema = {
  name: 'gmail_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      contact: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          first_name: { type: ['string', 'null'] },
          last_name: { type: ['string', 'null'] },
          email: { type: ['string', 'null'] },
          company: { type: ['string', 'null'] },
          position: { type: ['string', 'null'] },
          reason: { type: ['string', 'null'] },
        },
        required: ['first_name', 'last_name', 'email', 'company', 'position', 'reason'],
      },
      introduction: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          from_party: { type: ['string', 'null'] },
          to_party: { type: ['string', 'null'] },
          context: { type: ['string', 'null'] },
        },
        required: ['from_party', 'to_party', 'context'],
      },
    },
    required: ['contact', 'introduction'],
  },
} as const

const SYSTEM_PROMPT = `You extract structured CRM data from a single inbound email for The Club by Sarah Restrick. Return a "contact" object if the email is from or introduces a potential new business contact (name, company, role). Return an "introduction" object if the email proposes or references introducing two parties. Use null for any field or object you cannot determine from the email. Do not guess or invent details.`

async function handle(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const viaCron = Boolean(cronSecret) && req.headers.get('authorization') === `Bearer ${cronSecret}`
  if (!viaCron && !(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'OpenAI is not configured.' }, { status: 503 })

  const db = getAdminDb()

  // Unmatched inbound messages without an extraction yet.
  const { data: done } = await db.from('gmail_extractions').select('gmail_message_id')
  const doneIds = new Set((done ?? []).map((d) => d.gmail_message_id))
  const { data: candidates } = await db
    .from('gmail_messages')
    .select('gmail_message_id, from_email, subject, body_text')
    .is('member_id', null)
    .eq('direction', 'inbound')
    .order('internal_date', { ascending: false })
    .limit(BATCH * 3)
  const todo = (candidates ?? []).filter((m) => !doneIds.has(m.gmail_message_id)).slice(0, BATCH)

  if (!todo.length) return NextResponse.json({ ok: true, processed: 0, created: 0 })

  const openai = new OpenAI({ apiKey })
  const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'
  let created = 0

  for (const m of todo) {
    const startedAt = performance.now()
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `From: ${m.from_email ?? ''}\nSubject: ${m.subject ?? ''}\n\n${(m.body_text ?? '').slice(0, 4000)}`,
          },
        ],
        response_format: { type: 'json_schema', json_schema: openAiJsonSchema },
        temperature: 0,
      })
      await logOpenAIUsage({ feature: 'gmail-extract', model, usage: res.usage, startedAt })
      const raw = res.choices[0]?.message?.content
      if (!raw) continue
      const parsed = extractionSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) continue

      const rows: Database['public']['Tables']['gmail_extractions']['Insert'][] = []
      if (parsed.data.contact && (parsed.data.contact.email || parsed.data.contact.first_name)) {
        rows.push({ gmail_message_id: m.gmail_message_id, kind: 'new_contact', payload: parsed.data.contact })
      }
      if (parsed.data.introduction && (parsed.data.introduction.from_party || parsed.data.introduction.to_party)) {
        rows.push({ gmail_message_id: m.gmail_message_id, kind: 'introduction', payload: parsed.data.introduction })
      }
      if (rows.length) {
        await db.from('gmail_extractions').upsert(rows, { onConflict: 'gmail_message_id,kind' })
        created += rows.length
      }
    } catch (e) {
      await logOpenAIUsage({
        feature: 'gmail-extract',
        model,
        startedAt,
        error: e instanceof Error ? e.message : 'extract failed',
      })
    }
  }

  return NextResponse.json({ ok: true, processed: todo.length, created })
}

export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}
