// Profile / membership / introduction / block lookups used by auth, policy
// inputs and summary building.
import { log } from '../log.js'
import { supabase, must } from '../supabase.js'
import { chunk, PROFILE_COLS, type ProfileRow } from '../rows.js'

export async function getProfile(id: string): Promise<ProfileRow | null> {
  const res = await supabase.from('profiles').select(PROFILE_COLS).eq('id', id).maybeSingle()
  const row = must(res, 'profile') as ProfileRow | null
  if (row) await fillMemberCompanies([row])
  return row
}

// Many members only have their company on the members row, not the profile —
// fall back to it so headers show "role · company".
async function fillMemberCompanies(rows: ProfileRow[]): Promise<void> {
  const missing = rows.filter((r) => !r.company_name).map((r) => r.id)
  if (!missing.length) return
  const byProfile = new Map<string, string>()
  for (const part of chunk(missing, 150)) {
    const ms = must(
      await supabase.from('members').select('profile_id, company_name').in('profile_id', part).is('deleted_at', null),
      'members',
    ) as { profile_id: string; company_name: string | null }[]
    for (const m of ms) if (m.company_name && !byProfile.has(m.profile_id)) byProfile.set(m.profile_id, m.company_name)
  }
  for (const r of rows) if (!r.company_name) r.company_name = byProfile.get(r.id) ?? null
}

export async function getProfiles(ids: string[]): Promise<Map<string, ProfileRow>> {
  const out = new Map<string, ProfileRow>()
  const unique = [...new Set(ids)].filter(Boolean)
  for (const part of chunk(unique, 150)) {
    const rows = must(await supabase.from('profiles').select(PROFILE_COLS).in('id', part), 'profiles') as ProfileRow[]
    for (const r of rows) out.set(r.id, r)
  }
  await fillMemberCompanies([...out.values()])
  return out
}

/** members.id rows (non-deleted) for a profile, plus whether any is active. */
export async function getMemberships(profileId: string): Promise<{ memberIds: string[]; active: boolean }> {
  const rows = must(
    await supabase.from('members').select('id, membership_status').eq('profile_id', profileId).is('deleted_at', null),
    'members',
  ) as { id: string; membership_status: string }[]
  return { memberIds: rows.map((r) => r.id), active: rows.some((r) => r.membership_status === 'active') }
}

/** Profile ids (of role member) that have an active, non-deleted members row. */
export async function activeMemberProfiles(profileIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (const part of chunk([...new Set(profileIds)], 150)) {
    const rows = must(
      await supabase
        .from('members')
        .select('profile_id')
        .in('profile_id', part)
        .eq('membership_status', 'active')
        .is('deleted_at', null),
      'active members',
    ) as { profile_id: string }[]
    for (const r of rows) out.add(r.profile_id)
  }
  return out
}

export async function areIntroduced(aMemberIds: string[], bMemberIds: string[]): Promise<boolean> {
  if (!aMemberIds.length || !bMemberIds.length) return false
  const a = aMemberIds.join(',')
  const b = bMemberIds.join(',')
  const res = await supabase
    .from('introductions')
    .select('id')
    .in('status', ['accepted', 'completed'])
    .or(`and(member_a_id.in.(${a}),member_b_id.in.(${b})),and(member_a_id.in.(${b}),member_b_id.in.(${a}))`)
    .limit(1)
  return (must(res, 'introductions') as unknown[]).length > 0
}

/** Everyone the viewer blocked or is blocked by. */
export async function blockedWith(profileId: string): Promise<Set<string>> {
  const rows = must(
    await supabase
      .from('chat_blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${profileId},blocked_id.eq.${profileId}`),
    'blocks',
  ) as { blocker_id: string; blocked_id: string }[]
  return new Set(rows.map((r) => (r.blocker_id === profileId ? r.blocked_id : r.blocker_id)))
}

/** Which way(s) a block runs between `viewer` and `other`. */
export async function blockDirection(viewer: string, other: string): Promise<{ byMe: boolean; me: boolean }> {
  const rows = must(
    await supabase
      .from('chat_blocks')
      .select('blocker_id')
      .or(`and(blocker_id.eq.${viewer},blocked_id.eq.${other}),and(blocker_id.eq.${other},blocked_id.eq.${viewer})`),
    'blocks',
  ) as { blocker_id: string }[]
  return { byMe: rows.some((r) => r.blocker_id === viewer), me: rows.some((r) => r.blocker_id === other) }
}

export async function isBlockedEither(a: string, b: string): Promise<boolean> {
  const res = await supabase
    .from('chat_blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1)
  return (must(res, 'blocks') as unknown[]).length > 0
}

export interface PeopleRow extends ProfileRow {
  sort_name: string
}

export async function searchPeople(args: {
  viewerId: string
  all: boolean
  q: string | null
  after: { name: string; id: string } | null
  limit: number
  /** leave out people the viewer already has a DM with messages with */
  excludeDm?: boolean
}): Promise<PeopleRow[]> {
  const params = {
    p_viewer: args.viewerId,
    p_all: args.all,
    p_q: args.q,
    p_has_cursor: !!args.after,
    p_after_name: args.after?.name ?? null,
    p_after_id: args.after?.id ?? null,
    p_limit: args.limit,
  }
  // Always send the 8th arg so the call is unambiguous once
  // 20261021_member_chat_2.sql is applied; before that, fall back to the
  // 7-arg signature (no exclusion — the client also filters known DMs).
  const res = await supabase.rpc('chat_people', { ...params, p_exclude_dm: !!args.excludeDm })
  if (res.error && (res.error as { code?: string }).code === 'PGRST202') {
    log.warn('chat_people_v1_fallback', { hint: 'apply supabase/migrations/20261021_member_chat_2.sql' })
    return must(await supabase.rpc('chat_people', params), 'chat_people') as PeopleRow[]
  }
  return must(res, 'chat_people') as PeopleRow[]
}
