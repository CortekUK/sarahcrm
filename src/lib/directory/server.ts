// Server helpers for the member directory (/api/portal/directory/*).
//
// The caller is verified from the session cookie FIRST (active member or
// admin); only then is the service-role client handed out. Contacts are never
// exposed to members through RLS — the routes call the SQL functions in
// supabase/migrations/20261022_directory_contact_intros.sql, which select only
// the permitted columns.

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'

export function getServiceDb(): SupabaseClient {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export type DirectoryViewer =
  | {
      ok: true
      profileId: string
      memberId: string | null // null for an admin without a member record
      isAdmin: boolean
      memberName: string
      admin: SupabaseClient
    }
  | { ok: false; error: string; status: 401 | 403 }

export async function requireDirectoryViewer(): Promise<DirectoryViewer> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated', status: 401 }

  const admin = getServiceDb()
  const [{ data: profile }, { data: member }] = await Promise.all([
    admin.from('profiles').select('id, role, first_name, last_name').eq('id', user.id).maybeSingle(),
    admin
      .from('members')
      .select('id, membership_status, deleted_at')
      .eq('profile_id', user.id)
      .maybeSingle(),
  ])
  if (!profile) return { ok: false, error: 'No profile found.', status: 403 }

  const isAdmin = profile.role === 'admin'
  const activeMember = member && member.membership_status === 'active' && !member.deleted_at
  if (!isAdmin && !activeMember) {
    return { ok: false, error: 'The directory is open to active members only.', status: 403 }
  }

  return {
    ok: true,
    profileId: profile.id,
    memberId: activeMember ? member.id : null,
    isAdmin,
    memberName: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'A member',
    admin,
  }
}

// Opaque keyset cursor: base64url(JSON [sortKey, id]).
export function encodeCursor(sortKey: string, id: string): string {
  return Buffer.from(JSON.stringify([sortKey, id])).toString('base64url')
}

export function decodeCursor(cursor: string | null): { key: string; id: string } | null {
  if (!cursor) return null
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string' && UUID_RE.test(v[1])) {
      return { key: v[0], id: v[1] }
    }
  } catch {
    // fall through
  }
  return null
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The SQL search uses LIKE, so strip its wildcards from member input.
export function cleanSearch(q: string | null): string | null {
  const s = (q ?? '').replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return s || null
}
