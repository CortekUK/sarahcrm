// Content Library (Module 5) — searchable/filterable store of produced pieces.
//
// GET /api/admin/marketing/library
//   query filters (all optional):
//     channel, voice, event_id, sponsor_member_id, member_id, q (title+body)
//   →  { items: LibraryItem[], facets: { events, sponsors, channels, voices } }
//
// "Library-worthy" assets are those the admin has FINISHED with:
//   status in ('approved','published')  OR  a newsletter handed to the
//   designer (email_template_id is not null). Never mutates anything.
//
// Admin only. Reads via the untyped service-role client (marketing_* tables
// aren't in the generated types), per the Module 1-4 convention.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { isMarketingChannel } from '@/lib/marketing/channels'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The library-worthy predicate as a PostgREST `or` expression.
const LIBRARY_WORTHY = 'status.in.(approved,published),email_template_id.not.is.null'

type AnyRow = Record<string, unknown>

function displayName(m: AnyRow | undefined): string {
  if (!m) return ''
  const company = (m.company_name as string | null)?.trim()
  if (company) return company
  const full = [m.first_name, m.last_name].filter(Boolean).join(' ').trim()
  return full || ''
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const admin = getAdmin()
  const sp = req.nextUrl.searchParams

  const channel = sp.get('channel')?.trim() || ''
  const voice = sp.get('voice')?.trim() || ''
  const eventId = sp.get('event_id')?.trim() || ''
  const sponsorMemberId = sp.get('sponsor_member_id')?.trim() || ''
  const memberId = sp.get('member_id')?.trim() || ''
  // Strip PostgREST `or`-breaking characters from the free-text query.
  const q = (sp.get('q') ?? '').replace(/[,()*%]/g, ' ').trim()

  // ── Main (filtered) query ────────────────────────────────────────────
  let query = admin
    .from('marketing_assets')
    .select(
      'id, campaign_id, channel, variant, voice, title, body, status, email_template_id, event_id, sponsor_member_id, member_id, published_at, updated_at, created_at',
    )
    .or(LIBRARY_WORTHY)

  if (channel && isMarketingChannel(channel)) query = query.eq('channel', channel)
  if (voice === 'club' || voice === 'sarah') query = query.eq('voice', voice)
  if (eventId) query = query.eq('event_id', eventId)
  if (sponsorMemberId) query = query.eq('sponsor_member_id', sponsorMemberId)
  if (memberId) query = query.eq('member_id', memberId)
  if (q) query = query.or(`title.ilike.*${q}*,body.ilike.*${q}*`)

  const { data: rows, error } = await query
    .order('updated_at', { ascending: false })
    .limit(300)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const assets = (rows ?? []) as AnyRow[]

  // ── Facets — computed over the WHOLE library-worthy set (filter-agnostic
  //    so the dropdowns stay stable regardless of the active filters). ────
  const { data: facetRows } = await admin
    .from('marketing_assets')
    .select('channel, voice, event_id, sponsor_member_id')
    .or(LIBRARY_WORTHY)
  const facetAssets = (facetRows ?? []) as AnyRow[]

  const eventIds = new Set<string>()
  const sponsorIds = new Set<string>()
  const memberIds = new Set<string>()
  const channels = new Set<string>()
  const voices = new Set<string>()
  for (const a of facetAssets) {
    if (typeof a.channel === 'string') channels.add(a.channel)
    if (a.voice === 'club' || a.voice === 'sarah') voices.add(a.voice)
    if (typeof a.event_id === 'string') eventIds.add(a.event_id)
    if (typeof a.sponsor_member_id === 'string') sponsorIds.add(a.sponsor_member_id)
  }
  // Also resolve names for anything shown in the current result set.
  for (const a of assets) {
    if (typeof a.event_id === 'string') eventIds.add(a.event_id)
    if (typeof a.sponsor_member_id === 'string') sponsorIds.add(a.sponsor_member_id)
    if (typeof a.member_id === 'string') memberIds.add(a.member_id)
  }

  // ── Resolve display names ────────────────────────────────────────────
  const eventTitleById = new Map<string, string>()
  if (eventIds.size > 0) {
    const { data: events } = await admin
      .from('events')
      .select('id, title')
      .in('id', [...eventIds])
    for (const e of (events ?? []) as AnyRow[]) {
      if (typeof e.id === 'string') eventTitleById.set(e.id, (e.title as string) ?? '')
    }
  }

  const allMemberIds = new Set<string>([...sponsorIds, ...memberIds])
  const memberNameById = new Map<string, string>()
  if (allMemberIds.size > 0) {
    const { data: members } = await admin
      .from('members')
      .select('id, company_name, first_name, last_name')
      .in('id', [...allMemberIds])
    for (const m of (members ?? []) as AnyRow[]) {
      if (typeof m.id === 'string') memberNameById.set(m.id, displayName(m))
    }
  }

  // Campaign titles (for the "Open" action context).
  const campaignIds = [
    ...new Set(assets.map((a) => a.campaign_id).filter((v): v is string => typeof v === 'string')),
  ]
  const campaignTitleById = new Map<string, string>()
  if (campaignIds.length > 0) {
    const { data: campaigns } = await admin
      .from('marketing_campaigns')
      .select('id, title')
      .in('id', campaignIds)
    for (const c of (campaigns ?? []) as AnyRow[]) {
      if (typeof c.id === 'string') campaignTitleById.set(c.id, (c.title as string) ?? '')
    }
  }

  const items = assets.map((a) => ({
    id: a.id as string,
    campaign_id: (a.campaign_id as string) ?? null,
    campaign_title:
      typeof a.campaign_id === 'string' ? campaignTitleById.get(a.campaign_id) ?? null : null,
    channel: a.channel as string,
    variant: (a.variant as string | null) ?? null,
    voice: (a.voice as string | null) ?? null,
    title: (a.title as string | null) ?? null,
    body: (a.body as string | null) ?? null,
    status: a.status as string,
    email_template_id: (a.email_template_id as string | null) ?? null,
    event_id: (a.event_id as string | null) ?? null,
    event_title:
      typeof a.event_id === 'string' ? eventTitleById.get(a.event_id) ?? null : null,
    sponsor_member_id: (a.sponsor_member_id as string | null) ?? null,
    sponsor_name:
      typeof a.sponsor_member_id === 'string'
        ? memberNameById.get(a.sponsor_member_id) ?? null
        : null,
    member_id: (a.member_id as string | null) ?? null,
    member_name:
      typeof a.member_id === 'string' ? memberNameById.get(a.member_id) ?? null : null,
    published_at: (a.published_at as string | null) ?? null,
    updated_at: (a.updated_at as string | null) ?? null,
  }))

  const facets = {
    events: [...eventIds]
      .map((id) => ({ id, title: eventTitleById.get(id) || 'Untitled event' }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    sponsors: [...sponsorIds]
      .map((id) => ({ id, name: memberNameById.get(id) || 'Sponsor' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    channels: [...channels],
    voices: [...voices],
  }

  return Response.json({ items, facets })
}
