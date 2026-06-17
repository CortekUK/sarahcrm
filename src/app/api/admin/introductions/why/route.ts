// POST /api/admin/introductions/why
//
// AI explanation of WHY two members are a good introduction. Reads both
// members' profile + relationship-intelligence fields and asks the model to
// articulate the fit, grounded in what each actually said. Also returns the
// key underlying facts (what the target is looking for vs what the other
// offers) so the dialog can show the evidence, not just the prose.
//
// Body: { member_id, other_id }
// Returns: { reasoning: { summary, points[] }, target, other }

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const SELECT =
  'id, company_name, company_description, company_website, sector, sub_sector, what_they_can_offer, business_objectives, intro_target_types, intro_target_criteria, dream_introductions, budgets, profiles(first_name, last_name, job_title, bio, company_name)'

interface Loaded {
  id: string
  name: string
  firstName: string
  facts: { label: string; value: string }[]
  profileLines: string[]
}

function shape(row: Record<string, unknown>): Loaded {
  const p = (row.profiles ?? {}) as Record<string, string | null>
  const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Member'
  const f = (label: string, val: unknown) => {
    const s = typeof val === 'string' ? val.trim() : ''
    return s ? { label, value: s } : null
  }
  const facts = [
    f('Company', (row.company_name as string) || (p.company_name ?? null)),
    f('Role', p.job_title),
    f('Sector', row.sector),
    f('What they offer', row.what_they_can_offer),
    f('Looking to meet', row.intro_target_types),
    f('Ideal match', row.intro_target_criteria),
    f('Dream introductions', row.dream_introductions),
    f('Business objectives', row.business_objectives),
    f('Bio', p.bio),
  ].filter(Boolean) as { label: string; value: string }[]
  return {
    id: row.id as string,
    name,
    firstName: p.first_name ?? name,
    facts,
    profileLines: facts.map((x) => `${x.label}: ${x.value}`),
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return Response.json({ error: 'Admin only.' }, { status: 403 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return Response.json({ error: 'OpenAI is not configured.' }, { status: 500 })

  const body = (await req.json().catch(() => ({}))) as { member_id?: string; other_id?: string }
  if (!body.member_id || !body.other_id) {
    return Response.json({ error: 'member_id and other_id are required.' }, { status: 400 })
  }

  const admin = getAdminDb()
  const { data: rows } = await admin.from('members').select(SELECT).in('id', [body.member_id, body.other_id])
  const target = (rows ?? []).map((r) => r as Record<string, unknown>).find((r) => r.id === body.member_id)
  const other = (rows ?? []).map((r) => r as Record<string, unknown>).find((r) => r.id === body.other_id)
  if (!target || !other) return Response.json({ error: 'Members not found.' }, { status: 404 })

  const T = shape(target)
  const O = shape(other)

  const systemPrompt = `You are the relationship-intelligence assistant for "The Club by Sarah Restrick", a private members networking club. Two members have been matched for a possible introduction. Explain WHY this is a strong introduction, grounded ONLY in the facts provided about each member. Be specific — quote or paraphrase what each member said. Do not invent facts. Frame it as a concierge would: warm, concise, business-savvy.`

  const userPrompt = `MEMBER A — ${T.name}:\n${T.profileLines.join('\n') || '(limited profile)'}\n\nMEMBER B — ${O.name}:\n${O.profileLines.join('\n') || '(limited profile)'}\n\nExplain why introducing ${T.name} to ${O.name} is valuable.`

  const jsonSchema = {
    name: 'match_reasoning',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string', description: 'One or two sentences on why this match works.' },
        points: {
          type: 'array',
          description: '2-4 specific reasons, each citing a concrete fact from one or both profiles.',
          items: { type: 'string' },
        },
      },
      required: ['summary', 'points'],
    },
  } as const

  const model =
    process.env.OPENAI_MODEL_TEMPLATE_AI || process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'
  const openai = new OpenAI({ apiKey })
  const startedAt = performance.now()

  let raw: string | null = null
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_schema', json_schema: jsonSchema },
      temperature: 0.4,
    })
    raw = response.choices[0]?.message?.content ?? null
    await logOpenAIUsage({ feature: 'introduction_match_why', model, startedAt, usage: response.usage, userId: user.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'OpenAI request failed'
    await logOpenAIUsage({ feature: 'introduction_match_why', model, startedAt, error: message })
    return Response.json({ error: 'AI explanation failed. Please try again.' }, { status: 502 })
  }

  let parsed: { summary?: string; points?: string[] }
  try {
    parsed = JSON.parse(raw ?? '{}')
  } catch {
    return Response.json({ error: 'AI returned an unreadable response.' }, { status: 502 })
  }

  return Response.json({
    reasoning: {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      points: Array.isArray(parsed.points) ? parsed.points.filter((p) => typeof p === 'string') : [],
    },
    target: { name: T.name, facts: T.facts },
    other: { name: O.name, facts: O.facts },
  })
}
