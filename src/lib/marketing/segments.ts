// Segment resolver — Marketing AI Engine, Module 4.
//
// Turns a rule-based `SegmentRules` object into a concrete list of member
// recipients, in the EXACT shape the existing campaigns/send pipeline uses
// for members (see buildRecipients() in
// src/app/api/admin/campaigns/send/route.ts) so `replaceMergeTags` keeps
// working unchanged.
//
// Rules shape (all keys optional — empty / omitted key = no constraint on
// that dimension):
//   { tiers, statuses, types, tag_ids, tag_match: 'any' | 'all' }
//
// Behaviour mirrors the existing member recipient path:
//   * default to membership_status = 'active' when `statuses` is empty
//   * always exclude soft-deleted members (deleted_at is null)
//   * emails / names come from the joined `profiles` row
//   * members get NO unsubscribe token (matches current member logic)
//   * dedup by lowercased email
//
// Pure server util. Takes a service-role client (untyped — the caller
// passes getAdmin() / getAdminDb()); it must never be imported into client
// code.

// The service-role client is intentionally untyped in the marketing layer
// (the marketing_* tables are not in the generated Database types).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export interface SegmentRules {
  tiers?: string[]
  statuses?: string[]
  types?: string[]
  tag_ids?: string[]
  tag_match?: 'any' | 'all'
}

// The member-recipient shape used by campaigns/send — kept byte-compatible.
export interface SegmentRecipient {
  email: string
  first_name: string
  last_name: string
  unsubscribe_token: string | null
}

function cleanList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

// Normalise raw jsonb into a well-formed SegmentRules (defensive — rules
// come from the DB / request body).
export function normaliseRules(raw: unknown): SegmentRules {
  const r = (raw ?? {}) as Record<string, unknown>
  const tag_match = r.tag_match === 'all' ? 'all' : 'any'
  return {
    tiers: cleanList(r.tiers),
    statuses: cleanList(r.statuses),
    types: cleanList(r.types),
    tag_ids: cleanList(r.tag_ids),
    tag_match,
  }
}

// Resolve the set of member ids matching the rules (before profile join).
// Returns null if the rules are impossible to satisfy (e.g. tag_match='all'
// but a member set that is provably empty) — callers treat that as [].
async function matchingMemberIds(
  admin: AdminClient,
  rules: SegmentRules,
): Promise<string[]> {
  const tiers = rules.tiers ?? []
  const statuses = rules.statuses ?? []
  const types = rules.types ?? []
  const tagIds = rules.tag_ids ?? []
  const tagMatch = rules.tag_match === 'all' ? 'all' : 'any'

  let query = admin
    .from('members')
    .select('id')
    .is('deleted_at', null)

  // Default to active-only when no explicit status filter (mirrors existing
  // member recipient path in campaigns/send).
  if (statuses.length > 0) {
    query = query.in('membership_status', statuses)
  } else {
    query = query.eq('membership_status', 'active')
  }
  if (tiers.length > 0) query = query.in('membership_tier', tiers)
  if (types.length > 0) query = query.in('membership_type', types)

  const { data: memberRows, error } = await query
  if (error) throw new Error(error.message)
  let ids = (memberRows ?? []).map((m: { id: string }) => m.id)
  if (ids.length === 0) return []

  // Tag filtering via member_tags.
  if (tagIds.length > 0) {
    const { data: tagRows, error: tagErr } = await admin
      .from('member_tags')
      .select('member_id, tag_id')
      .in('member_id', ids)
      .in('tag_id', tagIds)
    if (tagErr) throw new Error(tagErr.message)

    // Group tag_ids held per member (dedup tag ids per member).
    const held = new Map<string, Set<string>>()
    for (const row of tagRows ?? []) {
      const set = held.get(row.member_id) ?? new Set<string>()
      set.add(row.tag_id)
      held.set(row.member_id, set)
    }

    if (tagMatch === 'all') {
      // Keep members that hold EVERY requested tag id.
      const needed = new Set(tagIds).size
      ids = ids.filter((id: string) => (held.get(id)?.size ?? 0) >= needed)
    } else {
      // 'any' — keep members that hold AT LEAST ONE requested tag id.
      ids = ids.filter((id: string) => (held.get(id)?.size ?? 0) > 0)
    }
  }

  return ids
}

// Load profile-backed recipients for a set of member ids, deduped by email.
async function recipientsForMemberIds(
  admin: AdminClient,
  memberIds: string[],
): Promise<SegmentRecipient[]> {
  if (memberIds.length === 0) return []

  const result: SegmentRecipient[] = []
  // Chunk the id filter to stay well within URL / statement limits.
  const CHUNK = 500
  for (let i = 0; i < memberIds.length; i += CHUNK) {
    const slice = memberIds.slice(i, i + CHUNK)
    const { data, error } = await admin
      .from('members')
      .select('id, profiles(email, first_name, last_name)')
      .in('id', slice)
    if (error) throw new Error(error.message)
    for (const m of data ?? []) {
      const p = (m.profiles ?? null) as {
        email: string | null
        first_name: string | null
        last_name: string | null
      } | null
      if (!p?.email) continue
      result.push({
        email: p.email,
        first_name: p.first_name ?? '',
        last_name: p.last_name ?? '',
        unsubscribe_token: null,
      })
    }
  }

  // Dedup by lowercased email.
  const seen = new Set<string>()
  const deduped: SegmentRecipient[] = []
  for (const r of result) {
    const key = r.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(r)
  }
  return deduped
}

// Public: resolve the full recipient list for a rules object.
export async function resolveSegmentRecipients(
  admin: AdminClient,
  rulesRaw: unknown,
): Promise<SegmentRecipient[]> {
  const rules = normaliseRules(rulesRaw)
  const ids = await matchingMemberIds(admin, rules)
  return recipientsForMemberIds(admin, ids)
}

// Public: count matching recipients (for the live preview). Uses the same
// resolution so the count matches exactly what would be sent (post-dedup,
// only members with a real profile email).
export async function countSegment(
  admin: AdminClient,
  rulesRaw: unknown,
): Promise<number> {
  const recipients = await resolveSegmentRecipients(admin, rulesRaw)
  return recipients.length
}

// Human-readable one-line summary of a rules object — used as the
// email_campaigns.audience_label fallback when a segment has no saved name.
export function summariseRules(rulesRaw: unknown): string {
  const r = normaliseRules(rulesRaw)
  const parts: string[] = []
  if (r.tiers && r.tiers.length) parts.push(`tiers ${r.tiers.join('/')}`)
  if (r.statuses && r.statuses.length) parts.push(`status ${r.statuses.join('/')}`)
  else parts.push('active')
  if (r.types && r.types.length) parts.push(`type ${r.types.join('/')}`)
  if (r.tag_ids && r.tag_ids.length) {
    parts.push(`${r.tag_match === 'all' ? 'all' : 'any'} of ${r.tag_ids.length} tag(s)`)
  }
  return parts.join(', ')
}
