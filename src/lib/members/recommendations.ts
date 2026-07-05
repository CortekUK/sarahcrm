// Member recommendation engine (Feature #6).
//
// Computes, for a single member, relevant UPCOMING EVENTS, relevant
// SPONSORS / STRATEGIC PARTNERS, and CURATED EXPERIENCES / TRAVEL — purely
// on the fly from existing tables (no new tables, no migration). This is a
// RECOMMEND-ONLY, display surface: the admin acts on the suggestions
// manually. It deliberately does NOT do member-to-member introduction
// matchmaking — that is already covered by `MemberMatchesPanel`.
//
// Like `roi.ts`, this runs in the client member-detail view using the
// browser supabase client by default, but accepts an injected client so the
// same logic can be reused server-side if ever needed. Kept deterministic
// and cheap: a handful of parallel reads + in-memory keyword scoring.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { supabase as browserClient } from '@/lib/supabase/client'

type DbClient = SupabaseClient<Database>

export interface RecommendedEvent {
  id: string
  title: string
  startDate: string
  eventType: string
  venue: string | null
  pricePence: number
  score: number
  reason: string
}

export interface RecommendedSponsor {
  key: string
  company: string
  alignment: string | null
  packageName: string | null
  exampleEventId: string | null
  score: number
  reason: string
}

export interface RecommendedExperience {
  id: string
  title: string
  description: string | null
  linkUrl: string | null
  imageUrl: string | null
  score: number
  reason: string
}

export interface MemberRecommendations {
  memberId: string
  // False when the member has NO usable preference signals to match on — the
  // panel uses this to prompt "Add preferences to personalise" rather than
  // dumping an undifferentiated list.
  hasSignals: boolean
  events: RecommendedEvent[]
  sponsors: RecommendedSponsor[]
  experiences: RecommendedExperience[]
}

const emptyRecs = (memberId: string, hasSignals = false): MemberRecommendations => ({
  memberId,
  hasSignals,
  events: [],
  sponsors: [],
  experiences: [],
})

const EVENT_LIMIT = 5
const SPONSOR_LIMIT = 4
const EXPERIENCE_LIMIT = 4

// Very small stopword set — we only want to drop noise words that would
// otherwise produce spurious keyword matches.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'our', 'you', 'your', 'are', 'from', 'this',
  'that', 'have', 'has', 'will', 'was', 'were', 'they', 'their', 'who', 'what',
  'all', 'any', 'not', 'but', 'can', 'other', 'into', 'more', 'new', 'via',
  'ltd', 'inc', 'llp', 'plc', 'company', 'group', 'business', 'businesses',
])

// Normalise a free-text or array signal into a set of comparable tokens
// (lowercased words of length >= 3, stopwords removed).
function tokenize(input: string | string[] | null | undefined): string[] {
  if (!input) return []
  const text = Array.isArray(input) ? input.join(' ') : input
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

// Score a candidate's text against the member's interest tokens. Returns the
// number of distinct member tokens found and the (deduped, original-order)
// list of those tokens for a human-readable reason.
function scoreAgainst(
  memberTokens: Set<string>,
  ...candidateParts: (string | string[] | null | undefined)[]
): { score: number; matched: string[] } {
  const candidateTokens = new Set<string>()
  for (const part of candidateParts) {
    for (const t of tokenize(part)) candidateTokens.add(t)
  }
  const matched: string[] = []
  for (const t of memberTokens) {
    if (candidateTokens.has(t)) matched.push(t)
  }
  return { score: matched.length, matched }
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// A specific, human-readable reason for WHY an item matched — built from the
// member's own interest tokens that the candidate hit. Only ever called when
// there is at least one match.
function matchReason(matched: string[]): string {
  const shown = matched.slice(0, 3).map(capitalise).join(', ')
  const extra = matched.length > 3 ? ` +${matched.length - 3} more` : ''
  return `Matches their interest in ${shown}${extra}`
}

export async function computeMemberRecommendations(
  memberId: string,
  client: DbClient = browserClient as unknown as DbClient,
): Promise<MemberRecommendations> {
  if (!memberId) return emptyRecs(memberId)

  const nowIso = new Date().toISOString()

  const [memberRes, memberTagsRes, eventsRes, invitationsRes, bookingsRes, sponsorshipsRes, experiencesRes] =
    await Promise.all([
      client
        .from('members')
        .select(
          'id, sector, sub_sector, event_preferences, interest_flags, travel_profile, hobbies, sporting_interests, charitable_interests, favourite_brands, favourite_restaurants, drink_preferences, company_name',
        )
        .eq('id', memberId)
        .single(),
      // member_tags → tags(name): treated as additional interest signal.
      client
        .from('member_tags')
        .select('tags(name, category)')
        .eq('member_id', memberId),
      // Upcoming, live-ish events only. Filter cancelled/draft out in code so
      // we don't depend on enum ordering.
      client
        .from('events')
        .select(
          'id, title, description, event_type, start_date, status, venue_name, venue_city, member_price_pence, travel_included',
        )
        .gte('start_date', nowIso)
        .order('start_date', { ascending: true })
        .limit(50),
      // event_invitations has NO declared FK to members — join manually and
      // treat member_id defensively (it's nullable).
      client
        .from('event_invitations')
        .select('event_id, member_id')
        .eq('member_id', memberId),
      // bookings.member_id is nullable — filter by it, keep event_id.
      client
        .from('bookings')
        .select('event_id, member_id')
        .eq('member_id', memberId),
      // Sponsorships across events — the pool of brands / strategic partners.
      client
        .from('sponsorships')
        .select('sponsor_company, brand_alignment, package_name, member_id, event_id, status')
        .limit(200),
      client
        .from('curated_experiences')
        .select('id, title, description, link_url, image_url, is_active, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(50),
    ])

  const member = memberRes.data
  if (!member) return emptyRecs(memberId)

  // ── Build the member's interest token set from every profile signal ──
  const tagNames = (memberTagsRes.data ?? [])
    .map((r) => {
      const t = (r as unknown as { tags: { name: string | null } | null }).tags
      return t?.name ?? null
    })
    .filter((n): n is string => !!n)

  const memberTokens = new Set<string>()
  for (const signal of [
    member.sector,
    member.sub_sector,
    member.event_preferences,
    member.interest_flags,
    member.travel_profile,
    member.hobbies,
    member.sporting_interests,
    member.charitable_interests,
    member.favourite_brands,
    member.favourite_restaurants,
    member.drink_preferences,
    ...tagNames,
  ] as (string | string[] | null | undefined)[]) {
    for (const t of tokenize(signal)) memberTokens.add(t)
  }

  // No usable preference signals → don't dump an undifferentiated list. Signal
  // to the panel so it can prompt the admin to add preferences instead.
  if (memberTokens.size === 0) return emptyRecs(memberId, false)

  // Travel-specific tokens — used to bias experience matching towards genuine
  // travel/interest signals rather than the whole interest cloud.
  const travelTokens = new Set<string>()
  for (const signal of [member.travel_profile, member.event_preferences, member.interest_flags]) {
    for (const t of tokenize(signal)) travelTokens.add(t)
  }

  // ── Events the member is already connected to (exclude these) ────────
  const connectedEventIds = new Set<string>()
  for (const inv of invitationsRes.data ?? []) {
    if (inv.event_id) connectedEventIds.add(inv.event_id)
  }
  for (const b of bookingsRes.data ?? []) {
    if (b.event_id) connectedEventIds.add(b.event_id)
  }

  // ── Recommended events ───────────────────────────────────────────────
  const ACTIVE_EVENT_STATUSES = new Set(['published', 'live'])
  const events: RecommendedEvent[] = []
  for (const e of eventsRes.data ?? []) {
    if (!ACTIVE_EVENT_STATUSES.has(e.status)) continue
    if (connectedEventIds.has(e.id)) continue
    const { score, matched } = scoreAgainst(memberTokens, e.title, e.description, e.event_type)
    if (score === 0) continue // only surface genuine matches
    const venue = e.venue_name || e.venue_city || null
    events.push({
      id: e.id,
      title: e.title,
      startDate: e.start_date,
      eventType: e.event_type,
      venue,
      pricePence: e.member_price_pence ?? 0,
      score,
      reason: matchReason(matched),
    })
  }
  // Higher score first; ties broken by soonest start date (deterministic).
  events.sort((a, b) => b.score - a.score || a.startDate.localeCompare(b.startDate))
  const topEvents = events.slice(0, EVENT_LIMIT)

  // ── Recommended sponsors / strategic partners ────────────────────────
  // Dedupe by sponsor_company; skip rows where this member IS the sponsor,
  // and rows with no company name. Best-effort: match brand alignment /
  // company / package against the member's interests.
  const sponsorByCompany = new Map<string, RecommendedSponsor>()
  for (const s of sponsorshipsRes.data ?? []) {
    const company = (s.sponsor_company ?? '').trim()
    if (!company) continue
    if (s.member_id && s.member_id === memberId) continue
    const { score, matched } = scoreAgainst(
      memberTokens,
      s.sponsor_company,
      s.brand_alignment,
      s.package_name,
    )
    if (score === 0) continue // only surface genuine matches
    const key = company.toLowerCase()
    const existing = sponsorByCompany.get(key)
    const candidate: RecommendedSponsor = {
      key,
      company,
      alignment: s.brand_alignment ?? null,
      packageName: s.package_name ?? null,
      exampleEventId: s.event_id ?? null,
      score,
      reason: matchReason(matched),
    }
    // Keep the best-scoring instance per company.
    if (!existing || candidate.score > existing.score) {
      sponsorByCompany.set(key, candidate)
    }
  }
  const sponsors = Array.from(sponsorByCompany.values())
  sponsors.sort((a, b) => b.score - a.score || a.company.localeCompare(b.company))
  const topSponsors = sponsors.slice(0, SPONSOR_LIMIT)

  // ── Recommended curated experiences / travel ─────────────────────────
  const experiences: RecommendedExperience[] = []
  for (const x of experiencesRes.data ?? []) {
    // Weight travel tokens double, then fall back to the full interest cloud.
    const travelMatch = scoreAgainst(travelTokens, x.title, x.description)
    const interestMatch = scoreAgainst(memberTokens, x.title, x.description)
    const matched = interestMatch.matched
    const score = travelMatch.score * 2 + interestMatch.score
    if (score === 0 || matched.length === 0) continue // only surface genuine matches
    experiences.push({
      id: x.id,
      title: x.title,
      description: x.description ?? null,
      linkUrl: x.link_url ?? null,
      imageUrl: x.image_url ?? null,
      score,
      reason: matchReason(matched),
    })
  }
  // Score first; ties keep the editorial display_order (already sorted).
  const orderedExperiences = experiences
    .map((x, i) => ({ x, i }))
    .sort((a, b) => b.x.score - a.x.score || a.i - b.i)
    .map((e) => e.x)
  const topExperiences = orderedExperiences.slice(0, EXPERIENCE_LIMIT)

  return {
    memberId,
    hasSignals: true,
    events: topEvents,
    sponsors: topSponsors,
    experiences: topExperiences,
  }
}
