// POST /api/admin/introductions/generate-suggestions
//
// Admin-triggered AI matchmaking pass. Loads every active member (+ their
// tags) and ALL existing introductions, runs the deterministic tag engine
// across the whole membership, and INSERTS the top new cross-member matches as
// `introductions` rows at status='suggested' (requested_by = null — that's
// what distinguishes an AI suggestion from a member request).
//
// RECOMMEND-ONLY: never sends email, never sets status beyond 'suggested',
// never re-suggests a pair that already has an introduction (any status).
//
// Returns: { created: n, skipped: m }

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generateSuggestions, pairKey } from '@/lib/introductions/suggest'
import type { MatchCandidate } from '@/lib/introductions/matching'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// Tuning: keep only strong, normalised matches and never flood the inbox.
const MIN_SCORE = 0.5
const CAP = 20

export async function POST() {
  // ── Admin gate ──────────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return Response.json({ error: 'Admin only.' }, { status: 403 })
  }

  const admin = getAdminDb()

  // ── Load active members + their tags + all existing intros ──────
  const [membersRes, tagsRes, introsRes] = await Promise.all([
    admin
      .from('members')
      .select(
        'id, company_name, sector, sub_sector, intro_target_types, intro_target_criteria, what_they_can_offer, profiles(first_name, last_name, company_name, email)',
      )
      .eq('membership_status', 'active')
      .is('deleted_at', null),
    admin.from('member_tags').select('member_id, tag_id, tags(name, category)'),
    admin.from('introductions').select('id, member_a_id, member_b_id, status'),
  ])

  if (membersRes.error) {
    console.error('[generate-suggestions] members load failed:', membersRes.error)
    return Response.json({ error: 'Could not load members.' }, { status: 500 })
  }

  const tagMap = new Map<string, { tagId: string; name: string; category: string }[]>()
  for (const row of (tagsRes.data ?? []) as unknown as Array<{
    member_id: string
    tag_id: string
    tags: { name: string; category: string } | null
  }>) {
    if (!row.tags) continue
    const arr = tagMap.get(row.member_id) ?? []
    arr.push({ tagId: row.tag_id, name: row.tags.name, category: row.tags.category })
    tagMap.set(row.member_id, arr)
  }

  const candidates: MatchCandidate[] = (
    (membersRes.data ?? []) as unknown as Array<{
      id: string
      company_name: string | null
      sector: string | null
      sub_sector: string | null
      intro_target_types: string | null
      intro_target_criteria: string | null
      what_they_can_offer: string | null
      profiles: {
        first_name: string | null
        last_name: string | null
        company_name: string | null
        email: string | null
      } | null
    }>
  ).map((m) => ({
    id: m.id,
    name: `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim() || 'Unnamed',
    company: m.company_name ?? m.profiles?.company_name ?? null,
    email: m.profiles?.email ?? null,
    tags: tagMap.get(m.id) ?? [],
    sector: m.sector,
    subSector: m.sub_sector,
    introTargetTypes: m.intro_target_types,
    introTargetCriteria: m.intro_target_criteria,
    whatTheyCanOffer: m.what_they_can_offer,
  }))

  // Dedupe set — every pair that ALREADY has an introduction (any status).
  const existingPairKeys = new Set<string>()
  for (const intro of (introsRes.data ?? []) as Array<{
    member_a_id: string
    member_b_id: string
  }>) {
    existingPairKeys.add(pairKey(intro.member_a_id, intro.member_b_id))
  }

  // ── Run the engine ──────────────────────────────────────────────
  const suggestions = generateSuggestions(candidates, existingPairKeys, {
    minScore: MIN_SCORE,
    cap: CAP,
  })

  if (suggestions.length === 0) {
    console.log(
      `[generate-suggestions] created 0 (candidates=${candidates.length}, existing pairs=${existingPairKeys.size})`,
    )
    return Response.json({ created: 0, skipped: existingPairKeys.size })
  }

  // ── Insert as 'suggested' rows (recommend-only) ─────────────────
  const rows = suggestions.map((s) => ({
    member_a_id: s.memberAId,
    member_b_id: s.memberBId,
    status: 'suggested' as const,
    match_score: s.matchScore,
    match_reason: s.matchReason || null,
    // `matching_tags` stores tag UUIDs (the detail page resolves them via
    // `tags.id`). The engine only has tag NAMES (from scoreMatches.sharedTags),
    // and the shared tags are already spelled out in `match_reason`, so we
    // leave this null — matching how the existing approve flow inserts it.
    matching_tags: null,
    requested_by: null,
  }))

  const { data: inserted, error: insErr } = await admin
    .from('introductions')
    .insert(rows)
    .select('id')

  if (insErr) {
    console.error('[generate-suggestions] insert failed:', insErr)
    return Response.json({ error: 'Could not save suggestions.' }, { status: 500 })
  }

  const created = inserted?.length ?? 0
  console.log(
    `[generate-suggestions] created ${created} suggestion(s); skipped ${existingPairKeys.size} existing pair(s); candidates=${candidates.length}`,
  )

  return Response.json({ created, skipped: existingPairKeys.size })
}
