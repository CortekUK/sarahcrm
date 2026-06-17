// AI tag suggestions for a member.
//
// POST /api/admin/members/[id]/suggest-tags
//
// Reads the member's profile + relationship-intelligence fields, hands them
// to OpenAI ALONGSIDE the club's existing tag vocabulary, and asks the model
// to pick the tags that genuinely fit — WITH A REASON for each. The model may
// ONLY return tags that already exist (it's given their ids); it never invents
// new ones. Sarah then accepts any/all in the member-detail tags panel.
//
// Returns: { suggestions: Array<{ tag_id, name, category, reason }> }
//
// Admin only.

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SUGGESTIONS = 6

interface TagRow {
  id: string
  name: string
  category: string
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: memberId } = await params

  const supabase = await createClient()

  // ── Auth: admin only ────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI is not configured.' }, { status: 500 })
  }

  // ── Load the member's profile + relationship-intelligence fields ─────
  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select(
      'id, company_name, company_description, company_website, sector, sub_sector, charitable_interests, sporting_interests, favourite_brands, intro_target_types, intro_target_criteria, dream_introductions, what_they_can_offer, business_objectives, budgets, profiles(first_name, last_name, job_title, bio, company_name)',
    )
    .eq('id', memberId)
    .single()

  if (memberErr || !member) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  }

  // ── Load the full tag vocabulary (the only tags the AI may pick) ─────
  const { data: tags } = await supabase
    .from('tags')
    .select('id, name, category')
    .order('category')
    .order('name')

  const tagList = (tags ?? []) as TagRow[]
  if (tagList.length === 0) {
    return NextResponse.json({ suggestions: [] })
  }

  // ── Build a compact, human-readable profile for the prompt ───────────
  const p = (member.profiles ?? {}) as {
    first_name?: string | null
    last_name?: string | null
    job_title?: string | null
    bio?: string | null
    company_name?: string | null
  }
  const m = member as Record<string, unknown>
  const field = (label: string, val: unknown) => {
    const s = typeof val === 'string' ? val.trim() : ''
    return s ? `${label}: ${s}` : null
  }
  const profileLines = [
    field('Name', `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()),
    field('Job title', p.job_title),
    field('Company', member.company_name || p.company_name),
    field('Company description', member.company_description),
    field('Website', member.company_website),
    field('Sector', member.sector),
    field('Sub-sector', member.sub_sector),
    field('Bio', p.bio),
    field('What they can offer', member.what_they_can_offer),
    field('Business objectives', member.business_objectives),
    field('Who they want to be introduced to', member.intro_target_types),
    field('Ideal introduction criteria', member.intro_target_criteria),
    field('Dream introductions', member.dream_introductions),
    field('Budgets', member.budgets),
    field('Charitable interests', member.charitable_interests),
    field('Sporting interests', member.sporting_interests),
    field('Favourite brands', member.favourite_brands),
  ].filter(Boolean) as string[]

  if (profileLines.length === 0) {
    return NextResponse.json({
      suggestions: [],
      note: 'Not enough profile information to suggest tags. Add company/profile detail first.',
    })
  }

  const tagCatalogue = tagList
    .map((t) => `- id:${t.id} | category:${t.category} | "${t.name}"`)
    .join('\n')

  const systemPrompt = `You are the relationship-intelligence assistant for "The Club by Sarah Restrick", a private members networking club. Your job: read a member's profile and choose which EXISTING tags best describe them, so the club can match them with the right people for introductions.

Tag categories mean:
- industry: what the member's business does / their field.
- interest: personal interests (sport, travel, charitable, brands).
- need: what they are LOOKING FOR (clients, investment, partners, suppliers, growth).

RULES:
- You may ONLY choose tags from the provided catalogue. Use the exact id. Never invent tags or ids.
- Choose up to ${MAX_SUGGESTIONS} tags, only the ones that genuinely fit. Fewer is better than forcing weak matches.
- Prefer a spread across categories when the profile supports it (e.g. an industry, an interest, and what they're looking for) because matching keys off needs vs industries.
- For each tag give a short, specific reason (max ~20 words) grounded in the member's profile — not generic.`

  const userPrompt = `MEMBER PROFILE:\n${profileLines.join('\n')}\n\nTAG CATALOGUE (choose only from these):\n${tagCatalogue}`

  const jsonSchema = {
    name: 'tag_suggestions',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        suggestions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              tag_id: { type: 'string', description: 'Exact id from the catalogue.' },
              reason: { type: 'string', description: 'Short, specific reason this tag fits.' },
            },
            required: ['tag_id', 'reason'],
          },
        },
      },
      required: ['suggestions'],
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
      temperature: 0.3,
    })
    raw = response.choices[0]?.message?.content ?? null
    await logOpenAIUsage({
      feature: 'member_tag_suggestions',
      model,
      startedAt,
      usage: response.usage,
      userId: user.id,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'OpenAI request failed'
    await logOpenAIUsage({ feature: 'member_tag_suggestions', model, startedAt, error: message })
    console.error('[suggest-tags] OpenAI failed:', e)
    return NextResponse.json({ error: 'AI suggestion failed. Please try again.' }, { status: 502 })
  }

  // ── Validate against the real catalogue (drop hallucinated ids) ──────
  let parsed: { suggestions?: Array<{ tag_id?: string; reason?: string }> }
  try {
    parsed = JSON.parse(raw ?? '{}')
  } catch {
    return NextResponse.json({ error: 'AI returned an unreadable response.' }, { status: 502 })
  }

  const byId = new Map(tagList.map((t) => [t.id, t]))
  const seen = new Set<string>()
  const suggestions = (parsed.suggestions ?? [])
    .map((s) => {
      const tag = s.tag_id ? byId.get(s.tag_id) : undefined
      if (!tag || seen.has(tag.id)) return null
      seen.add(tag.id)
      return {
        tag_id: tag.id,
        name: tag.name,
        category: tag.category,
        reason: typeof s.reason === 'string' ? s.reason.trim() : '',
      }
    })
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS)

  return NextResponse.json({ suggestions })
}
