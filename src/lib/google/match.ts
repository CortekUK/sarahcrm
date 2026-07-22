// Resolves a Gmail counterpart email address to a CRM member.
//
// Members are linked to an auth-backed profile which carries the email, so we
// match on profiles.email → members.profile_id. Unmatched addresses return
// null (the caller stores those messages with member_id = null so they surface
// as "new contacts" for AI extraction).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Db = SupabaseClient<Database>

// Batch-resolves a set of lowercased emails to member ids in one round-trip.
// Returns a Map keyed by email → member id (only present for matches).
export async function resolveMembersByEmail(
  db: Db,
  emails: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (unique.length === 0) return map

  // profiles.email → profile id, then members.profile_id → member id.
  const { data: profiles } = await db
    .from('profiles')
    .select('id, email')
    .in('email', unique)
  if (!profiles?.length) return map

  const profileByEmail = new Map<string, string>()
  for (const p of profiles) {
    if (p.email) profileByEmail.set(p.email.toLowerCase(), p.id)
  }

  const { data: members } = await db
    .from('members')
    .select('id, profile_id')
    .in('profile_id', [...profileByEmail.values()])
    .is('deleted_at', null)
  if (!members?.length) return map

  const memberByProfile = new Map<string, string>()
  for (const m of members) {
    if (m.profile_id) memberByProfile.set(m.profile_id, m.id)
  }

  for (const [email, profileId] of profileByEmail) {
    const memberId = memberByProfile.get(profileId)
    if (memberId) map.set(email, memberId)
  }
  return map
}
