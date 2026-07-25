// POST /api/admin/sponsorship/match — the sponsor matching engine.
//
// Given an event (and optionally a short brief / parsed deck brief), this
// builds a ranked list of candidate sponsors and persists them as
// sponsor_prospects for the human to review. It is WARM-FIRST:
//   1. It gathers warm candidates from the CRM with NO external vendor call —
//      past sponsors + sponsor-aligned members.
//   2. It reads the event's booked audience to derive the dominant sectors.
//   3. ONLY if there are fewer than 8 warm candidates does it reach out to the
//      enrichment wrapper for selective COLD discovery. If that capability is
//      unavailable / needs an upgrade / errors, it degrades silently (the
//      request still succeeds; `cold_status` explains why cold is empty).
//   4. OpenAI ranks every candidate 0-100 for THIS event + audience (with a
//      rule-only fallback when no key / the call fails); warm candidates get a
//      fixed +20 warm-first boost.
//   5. Each candidate is upserted into sponsor_prospects, preserving any human
//      status progress past 'suggested'.
//
// This route only reads / enriches / ranks / persists — it never sends anything.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'
import { searchSponsorCompanies } from '@/lib/enrichment'
import type { SearchCriteria, CapabilityStatus } from '@/lib/enrichment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Club brand-voice guidance — mirrors the marketing/generate + proposal routes.
const CLUB_VOICE = `The Club by Sarah Restrick is a private membership community of exceptional founders and senior leaders. Its events are curated, intimate, luxury gatherings built on trusted introductions — never mass-market. When judging a sponsor fit, favour brands whose audience, values and positioning align with a discerning, high-net-worth, relationship-led membership.`

const WARM_BONUS = 20
const WARM_TARGET = 8 // below this many warm candidates we allow selective cold

type ProspectSource =
  | 'past_sponsor'
  | 'crm_member'
  | 'crm_contact'
  | 'warm_lead'
  | 'cold'
type Temperature = 'warm' | 'cold'

interface Candidate {
  company_name: string
  company_domain: string | null
  website_url: string | null
  linkedin_url: string | null
  industry: string | null
  employee_count: number | null
  revenue_printed: string | null
  description: string | null
  source: ProspectSource
  temperature: Temperature
  source_ref_id: string | null
  vendor: string | null
  vendor_raw: unknown
  // filled by ranking
  match_score?: number
  match_reasons?: string[]
  ai_rationale?: string | null
}

interface MatchBody {
  event_id?: string
  brief?: string
  deck_brief?: string
}

const rankingSchema = z.object({
  rankings: z.array(
    z.object({
      index: z.number().int(),
      score: z.number().int(),
      reasons: z.array(z.string()),
      rationale: z.string(),
    }),
  ),
})

function rankingJsonSchema() {
  return {
    name: 'sponsor_rankings',
    strict: true as const,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rankings: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              index: { type: 'integer' },
              score: { type: 'integer' },
              reasons: { type: 'array', items: { type: 'string' } },
              rationale: { type: 'string' },
            },
            required: ['index', 'score', 'reasons', 'rationale'],
          },
        },
      },
      required: ['rankings'],
    },
  }
}

// Derive a bare host domain from a website URL ("https://www.acme.co/x" → "acme.co").
function deriveDomain(website: string | null | undefined): string | null {
  if (!website) return null
  const trimmed = String(website).trim()
  if (!trimmed) return null
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const host = new URL(withProto).hostname.replace(/^www\./i, '').toLowerCase()
    return host || null
  } catch {
    const host = trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split(/[/?#]/)[0]
      .trim()
      .toLowerCase()
    return host || null
  }
}

// Coerce a possibly-string employee count (members.employee_count is text) to int.
function toInt(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

// A stable dedup key: prefer domain, else the lowercased company name.
function dedupKey(c: { company_domain: string | null; company_name: string }): string {
  return (c.company_domain || c.company_name || '').trim().toLowerCase()
}

function formatEventContext(e: Record<string, unknown>): string {
  const lines: string[] = []
  if (e.title) lines.push(`Title: ${e.title}`)
  if (e.event_type) lines.push(`Type: ${e.event_type}`)
  if (e.start_date) {
    try {
      lines.push(
        `Date: ${new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(new Date(String(e.start_date)))}`,
      )
    } catch {
      lines.push(`Date: ${String(e.start_date)}`)
    }
  }
  const venue = [e.venue_name, e.venue_city].filter(Boolean).join(', ')
  if (venue) lines.push(`Venue: ${venue}`)
  if (e.description)
    lines.push(`Description: ${String(e.description).replace(/\s+/g, ' ').trim().slice(0, 800)}`)
  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    let body: MatchBody
    try {
      body = (await req.json()) as MatchBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const eventId = body.event_id
    if (!eventId) return Response.json({ error: 'event_id is required' }, { status: 400 })

    const admin = getAdmin()

    // ── A. Load event ───────────────────────────────────────────────────
    const { data: event, error: evErr } = await admin
      .from('events')
      .select('id, title, start_date, venue_name, venue_city, description, event_type')
      .eq('id', eventId)
      .maybeSingle()
    if (evErr || !event) return Response.json({ error: 'Event not found' }, { status: 404 })

    // ── B. Warm gather (parallel, no vendor call) ────────────────────────
    // + C. Audience signal (bookings) — gathered in the same parallel batch.
    const [pastSponsorsRes, alignedMembersRes, bookingsRes] = await Promise.all([
      admin
        .from('sponsorships')
        .select('sponsor_company, sponsor_name, member_id, brand_alignment'),
      admin
        .from('members')
        .select(
          'id, company_name, company_website, sector, company_linkedin_url, employee_count, annual_turnover, company_description',
        )
        .eq('sponsor_aligned', true),
      admin
        .from('bookings')
        .select('guest_company, member_id, status')
        .eq('event_id', eventId),
    ])

    const candidates: Candidate[] = []

    // Past sponsors (any event) — dedup by lowercased company name.
    {
      const seen = new Set<string>()
      for (const r of (pastSponsorsRes.data ?? []) as Record<string, unknown>[]) {
        const name = (r.sponsor_company as string) || (r.sponsor_name as string) || ''
        const key = name.trim().toLowerCase()
        if (!name || seen.has(key)) continue
        seen.add(key)
        candidates.push({
          company_name: name,
          company_domain: null,
          website_url: null,
          linkedin_url: null,
          industry: null,
          employee_count: null,
          revenue_printed: null,
          description:
            typeof r.brand_alignment === 'string' && r.brand_alignment
              ? `Past sponsor. Brand alignment: ${r.brand_alignment}`
              : 'Past sponsor.',
          source: 'past_sponsor',
          temperature: 'warm',
          source_ref_id: (r.member_id as string) || null,
          vendor: null,
          vendor_raw: null,
        })
      }
    }

    // Sponsor-aligned CRM members.
    for (const m of (alignedMembersRes.data ?? []) as Record<string, unknown>[]) {
      const name = (m.company_name as string) || ''
      if (!name) continue
      candidates.push({
        company_name: name,
        company_domain: deriveDomain(m.company_website as string | null),
        website_url: (m.company_website as string) || null,
        linkedin_url: (m.company_linkedin_url as string) || null,
        industry: (m.sector as string) || null,
        employee_count: toInt(m.employee_count),
        revenue_printed: (m.annual_turnover as string) || null,
        description: (m.company_description as string) || null,
        source: 'crm_member',
        temperature: 'warm',
        source_ref_id: (m.id as string) || null,
        vendor: null,
        vendor_raw: null,
      })
    }
    // NOTE: 'warm_lead' (enquiry-derived) candidates are intentionally omitted —
    // there is no clean sponsor flag on enquiries in the current schema.

    // ── C. Audience sector/company frequency map ─────────────────────────
    const bookingRows = (bookingsRes.data ?? []) as Record<string, unknown>[]
    // booking_status enum = confirmed|pending|cancelled|refunded (no 'attended').
    // Prefer confirmed as the "real audience"; fall back to all if none confirmed.
    const confirmed = bookingRows.filter((b) => b.status === 'confirmed')
    const audienceRows = confirmed.length > 0 ? confirmed : bookingRows
    const bookingMemberIds = Array.from(
      new Set(
        audienceRows
          .map((b) => b.member_id)
          .filter((v): v is string => typeof v === 'string'),
      ),
    )
    const sectorFreq = new Map<string, number>()
    const companyFreq = new Map<string, number>()
    for (const b of audienceRows) {
      const gc = (b.guest_company as string) || ''
      if (gc.trim()) companyFreq.set(gc.trim(), (companyFreq.get(gc.trim()) ?? 0) + 1)
    }
    if (bookingMemberIds.length > 0) {
      const { data: audMembers } = await admin
        .from('members')
        .select('id, sector, company_name')
        .in('id', bookingMemberIds)
      for (const m of (audMembers ?? []) as Record<string, unknown>[]) {
        const sector = (m.sector as string) || ''
        if (sector.trim()) sectorFreq.set(sector.trim(), (sectorFreq.get(sector.trim()) ?? 0) + 1)
        const cn = (m.company_name as string) || ''
        if (cn.trim()) companyFreq.set(cn.trim(), (companyFreq.get(cn.trim()) ?? 0) + 1)
      }
    }
    const topSectors = Array.from(sectorFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([s]) => s)

    const warmCount = candidates.length

    // ── D. Selective cold (only if warm candidates < target) ─────────────
    let coldStatus: CapabilityStatus | 'skipped' = 'skipped'
    if (warmCount < WARM_TARGET) {
      const keywordSet = new Set<string>()
      for (const kw of [event.event_type, event.venue_city].filter(Boolean)) {
        keywordSet.add(String(kw))
      }
      // Pull a few keywords from brief/deck_brief/description.
      const briefText = [body.brief, body.deck_brief, event.description]
        .filter(Boolean)
        .join(' ')
      for (const w of briefText
        .split(/[^A-Za-z0-9]+/)
        .filter((w) => w.length > 4)
        .slice(0, 12)) {
        keywordSet.add(w.toLowerCase())
      }
      const criteria: SearchCriteria = {
        industries: topSectors.length > 0 ? topSectors : undefined,
        keywords: keywordSet.size > 0 ? Array.from(keywordSet) : undefined,
        limit: 10,
      }
      const cold = await searchSponsorCompanies(criteria)
      coldStatus = cold.status
      if (cold.status === 'ok') {
        for (const item of cold.items) {
          if (!item.companyName) continue
          candidates.push({
            company_name: item.companyName,
            company_domain: item.domain
              ? item.domain.toLowerCase()
              : deriveDomain(item.website),
            website_url: item.website,
            linkedin_url: item.linkedinUrl,
            industry: item.industry,
            employee_count: item.employeeCount,
            revenue_printed: item.revenuePrinted,
            description: item.description,
            source: 'cold',
            temperature: 'cold',
            source_ref_id: null,
            // Provider name is deliberately not surfaced by the wrapper.
            vendor: null,
            vendor_raw: item.raw ?? null,
          })
        }
      }
      // status !== 'ok' → skip silently; cold_status is returned for the UI.
    }

    // ── E. Dedup (domain when present, else lowercased name) ──────────────
    const deduped: Candidate[] = []
    const seenKeys = new Set<string>()
    for (const c of candidates) {
      const key = dedupKey(c)
      if (!key || seenKeys.has(key)) continue
      seenKeys.add(key)
      deduped.push(c)
    }

    // ── F. Ranking (OpenAI structured, or rule-only fallback) ────────────
    const apiKey = process.env.OPENAI_API_KEY ?? null
    const audienceBlock =
      topSectors.length > 0
        ? topSectors.map((s) => `${s} (${sectorFreq.get(s)})`).join(', ')
        : '(no strong audience sector signal)'

    // Rule-only baseline scorer used both as the fallback and to fill any
    // candidate the AI omitted.
    const ruleScore = (c: Candidate): { score: number; reasons: string[] } => {
      let score = 50
      const reasons = ['Rule-based score (AI unavailable)']
      if (
        c.industry &&
        topSectors.some(
          (s) =>
            s.toLowerCase().includes(c.industry!.toLowerCase()) ||
            c.industry!.toLowerCase().includes(s.toLowerCase()),
        )
      ) {
        score += 15
        reasons.push(`Industry matches audience sector (${c.industry})`)
      }
      return { score: Math.min(100, score), reasons }
    }

    const applyWarm = (aiScore: number, temp: Temperature): number =>
      Math.min(100, Math.max(0, aiScore) + (temp === 'warm' ? WARM_BONUS : 0))

    let usedAi = false
    if (apiKey && deduped.length > 0) {
      const openai = new OpenAI({ apiKey })
      const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'
      const startedAt = performance.now()

      const candidateList = deduped
        .map((c, i) =>
          JSON.stringify({
            index: i,
            company_name: c.company_name,
            industry: c.industry,
            employee_count: c.employee_count,
            description: c.description ? String(c.description).slice(0, 400) : null,
          }),
        )
        .join('\n')

      const systemPrompt = `You are the sponsorship strategist for The Club by Sarah Restrick.
${CLUB_VOICE}

Task: score each candidate company 0-100 as a sponsor fit for THIS specific event and its audience. 100 = an outstanding, obvious fit; 50 = plausible; low = weak. For each candidate give 2-4 short, concrete reasons and a single-line rationale. Judge fit on audience alignment, brand positioning and relevance to the event — not company size alone. Return one ranking object per candidate index.`

      const userMessage = `EVENT:
${formatEventContext(event)}

AUDIENCE — dominant booked sectors (with counts): ${audienceBlock}
${body.brief ? `\nADMIN BRIEF:\n${body.brief}` : ''}${
        body.deck_brief ? `\nSPONSORSHIP DECK BRIEF:\n${String(body.deck_brief).slice(0, 4000)}` : ''
      }

CANDIDATES (one JSON object per line):
${candidateList}

Return { "rankings": [ { index, score, reasons, rationale } ] } with exactly one entry per candidate index above.`

      try {
        const response = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          response_format: { type: 'json_schema', json_schema: rankingJsonSchema() },
          temperature: 0.3,
        })
        await logOpenAIUsage({
          feature: 'sponsorship_match',
          model,
          usage: response.usage,
          startedAt,
          userId: auth.profile.id,
        })
        const raw = response.choices[0]?.message?.content
        const parsed = raw ? rankingSchema.safeParse(JSON.parse(raw)) : null
        if (parsed && parsed.success) {
          const byIndex = new Map(parsed.data.rankings.map((r) => [r.index, r]))
          deduped.forEach((c, i) => {
            const r = byIndex.get(i)
            if (r) {
              c.match_score = applyWarm(r.score, c.temperature)
              c.match_reasons = r.reasons
              c.ai_rationale = r.rationale
            } else {
              const rs = ruleScore(c)
              c.match_score = applyWarm(rs.score, c.temperature)
              c.match_reasons = rs.reasons
              c.ai_rationale = null
            }
          })
          usedAi = true
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'OpenAI request failed'
        console.error('[sponsorship/match] OpenAI failed, using rule fallback:', e)
        await logOpenAIUsage({
          feature: 'sponsorship_match',
          model,
          startedAt,
          error: message,
          userId: auth.profile.id,
        })
      }
    }

    // Rule-only fallback (no key, empty set skipped, or AI failed/invalid).
    if (!usedAi) {
      for (const c of deduped) {
        const rs = ruleScore(c)
        c.match_score = applyWarm(rs.score, c.temperature)
        c.match_reasons = rs.reasons
        c.ai_rationale = null
      }
    }

    // ── G. Upsert into sponsor_prospects (preserve human status progress) ─
    const persisted: Record<string, unknown>[] = []
    for (const c of deduped) {
      // Find an existing prospect for this event: by domain if present, else name.
      let existing: Record<string, unknown> | null = null
      if (c.company_domain) {
        const { data } = await admin
          .from('sponsor_prospects')
          .select('id, status')
          .eq('event_id', eventId)
          .ilike('company_domain', c.company_domain)
          .limit(1)
          .maybeSingle()
        existing = (data as Record<string, unknown>) ?? null
      } else {
        const { data } = await admin
          .from('sponsor_prospects')
          .select('id, status')
          .eq('event_id', eventId)
          .is('company_domain', null)
          .ilike('company_name', c.company_name)
          .limit(1)
          .maybeSingle()
        existing = (data as Record<string, unknown>) ?? null
      }

      // Scoring + enrichment fields shared by insert and update.
      const scoringFields = {
        company_name: c.company_name,
        company_domain: c.company_domain,
        website_url: c.website_url,
        linkedin_url: c.linkedin_url,
        industry: c.industry,
        employee_count: c.employee_count,
        revenue_printed: c.revenue_printed,
        description: c.description,
        source: c.source,
        temperature: c.temperature,
        source_ref_id: c.source_ref_id,
        vendor: c.vendor,
        vendor_raw: c.vendor_raw ?? null,
        match_score: c.match_score ?? null,
        match_reasons: c.match_reasons ?? [],
        ai_rationale: c.ai_rationale ?? null,
        updated_at: new Date().toISOString(),
      }

      if (existing) {
        // Preserve status if the human has moved it past 'suggested'.
        const { data: upd } = await admin
          .from('sponsor_prospects')
          .update(scoringFields)
          .eq('id', existing.id as string)
          .select('*')
          .maybeSingle()
        if (upd) persisted.push(upd as Record<string, unknown>)
      } else {
        const { data: ins, error: insErr } = await admin
          .from('sponsor_prospects')
          .insert({ event_id: eventId, status: 'suggested', ...scoringFields })
          .select('*')
          .maybeSingle()
        if (insErr) {
          console.error('[sponsorship/match] insert failed (non-fatal):', insErr.message)
          continue
        }
        if (ins) persisted.push(ins as Record<string, unknown>)
      }
    }

    // ── H. Response — warm-first, then match_score desc ──────────────────
    persisted.sort((a, b) => {
      const aw = a.temperature === 'warm' ? 1 : 0
      const bw = b.temperature === 'warm' ? 1 : 0
      if (aw !== bw) return bw - aw
      return ((b.match_score as number) ?? -1) - ((a.match_score as number) ?? -1)
    })

    const coldPersisted = persisted.filter((p) => p.temperature === 'cold').length
    const warmPersisted = persisted.filter((p) => p.temperature === 'warm').length

    return Response.json({
      ok: true,
      event_id: eventId,
      counts: { warm: warmPersisted, cold: coldPersisted, total: persisted.length },
      cold_status: coldStatus,
      prospects: persisted,
    })
  } catch (e) {
    console.error('[sponsorship/match] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
