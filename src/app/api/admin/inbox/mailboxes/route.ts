// GET /api/admin/inbox/mailboxes
//
// The caller's readable inboxes, for the account switcher. Admins get every
// enabled catalogue inbox; everyone else gets their granted ∩ enabled set.
// Labels come from the catalogue (falling back to the email).

import { requireInboxAccess } from '@/lib/inbox/guard'
import { getInboxCatalog } from '@/lib/inbox/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireInboxAccess()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { allowed, admin, profile } = auth
  const catalog = await getInboxCatalog(admin)
  const labelOf = (email: string) =>
    catalog.find((c) => c.email.toLowerCase() === email.toLowerCase())?.label ?? email

  const mailboxes = allowed.map((email) => ({ email, label: labelOf(email) }))
  return Response.json({ mailboxes, is_admin: profile.role === 'admin' })
}
