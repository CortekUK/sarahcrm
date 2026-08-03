// /api/admin/inbox/access — ADMIN ONLY. Powers the Manage-access UI.
//
// GET  → { users, catalog, grants } — the grantable CRM users (admins + staff),
//         the inbox catalogue, and the current mailbox grants.
// POST → { action:'grant'|'revoke', profile_id, mailbox } — mutate a grant.
//
// Access is double-gated: requireInboxAccess (authenticated + has inbox access)
// AND an explicit admin-role assertion, since granting mailboxes is privileged.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireInboxAccess } from '@/lib/inbox/guard'
import {
  getInboxCatalog,
  listGrants,
  grantMailbox,
  revokeMailbox,
} from '@/lib/inbox/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// CRM users only — the people who log in and operate the CRM. Clients/members
// (role 'member') are NOT grantable inbox users.
const GRANTABLE_ROLES = ['admin', 'team_member', 'freelancer']

const bodySchema = z.object({
  action: z.enum(['grant', 'revoke']),
  profile_id: z.string().uuid(),
  mailbox: z.string().min(1),
})

export async function GET() {
  const auth = await requireInboxAccess()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (auth.profile.role !== 'admin') {
    return Response.json({ error: 'Admin only.' }, { status: 403 })
  }

  const { admin } = auth

  const [catalog, grantsRaw, usersRes] = await Promise.all([
    getInboxCatalog(admin),
    listGrants(admin),
    admin
      .from('profiles')
      .select('id, first_name, last_name, email, role')
      .in('role', GRANTABLE_ROLES),
  ])

  const users = ((usersRes.data ?? []) as Array<{
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    role: string
  }>).map((u) => ({
    id: u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || (u.email ?? 'Unknown'),
    email: u.email,
    role: u.role,
  }))

  const catalogOut = catalog.map((c) => ({ email: c.email, label: c.label }))
  const grants = grantsRaw.map((g) => ({ profile_id: g.profile_id, mailbox: g.mailbox }))

  return Response.json({ users, catalog: catalogOut, grants })
}

export async function POST(req: NextRequest) {
  const auth = await requireInboxAccess()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (auth.profile.role !== 'admin') {
    return Response.json({ error: 'Admin only.' }, { status: 403 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { admin, profile } = auth
  const { action, profile_id, mailbox } = parsed.data

  if (action === 'grant') {
    await grantMailbox(admin, profile_id, mailbox, profile.id)
  } else {
    await revokeMailbox(admin, profile_id, mailbox)
  }

  return Response.json({ ok: true })
}
