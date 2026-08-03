// Inbox route gate. Every /api/admin/inbox route calls this FIRST:
//   • authenticates the caller (SSR session),
//   • loads their profile,
//   • computes the set of mailbox emails they may read (admins → all enabled;
//     everyone else → their granted ∩ enabled catalogue inboxes),
//   • refuses callers with no access (unless admin).
//
// The returned `allowed` list is the authority for mailbox access — routes must
// validate any client-supplied mailbox param against it (never trust the client).

import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/marketing/admin'
import { allowedMailboxes } from '@/lib/inbox/access'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface InboxProfile {
  id: string
  role: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

export interface InboxAccessOk {
  profile: InboxProfile
  allowed: string[]
  admin: SupabaseClient
}

export interface InboxAccessErr {
  error: string
  status: 401 | 403
}

export async function requireInboxAccess(): Promise<InboxAccessOk | InboxAccessErr> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, first_name, last_name, email')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Not authenticated', status: 401 }

  const admin = getAdmin()
  const p = profile as InboxProfile
  const allowed = await allowedMailboxes(admin, { id: p.id, role: p.role })

  if (allowed.length === 0 && p.role !== 'admin') {
    return { error: 'No inbox access', status: 403 }
  }

  return { profile: p, allowed, admin }
}
