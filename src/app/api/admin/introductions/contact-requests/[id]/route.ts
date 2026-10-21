// PATCH /api/admin/introductions/contact-requests/[id]
//
// Sarah handles a wider-network intro request: approve, decline or mark it
// completed, with an optional internal note. Status updates only — no email
// is sent to the member or the contact.
//
// Body: { status: 'approved' | 'declined' | 'completed' | 'pending', note? }
//
// Quota (soft, display-only — same as /api/admin/introductions/send): the
// first time a request becomes 'completed' the requester's
// intros_used_this_month is incremented. It never blocks anything; admins see
// the real counts via /api/admin/introductions/history (IntroHistoryBadge).

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/marketing/admin'
import { getServiceDb, UUID_RE } from '@/lib/directory/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUSES = ['pending', 'approved', 'declined', 'completed'] as const
type Status = (typeof STATUSES)[number]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!UUID_RE.test(id)) return Response.json({ error: 'Request not found.' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { status?: string; note?: string }
  const status = body.status as Status
  if (!STATUSES.includes(status)) {
    return Response.json({ error: 'Unknown status.' }, { status: 400 })
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : undefined

  const admin = getServiceDb()
  const { data: current } = await admin
    .from('contact_intro_requests')
    .select('id, status, requester_member_id')
    .eq('id', id)
    .maybeSingle()
  if (!current) return Response.json({ error: 'Request not found.' }, { status: 404 })

  const patch: Record<string, unknown> = {
    status,
    handled_by: auth.profile.id,
    handled_at: new Date().toISOString(),
  }
  if (note !== undefined) patch.admin_note = note || null

  const { error } = await admin.from('contact_intro_requests').update(patch).eq('id', id)
  if (error) {
    if (error.code === '23505') {
      return Response.json(
        { error: 'This member already has another pending request for this contact.' },
        { status: 409 },
      )
    }
    console.error('[contact-requests] update failed:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (status === 'completed' && current.status !== 'completed') {
    const { data: m } = await admin
      .from('members')
      .select('intros_used_this_month')
      .eq('id', current.requester_member_id)
      .maybeSingle()
    if (m) {
      await admin
        .from('members')
        .update({ intros_used_this_month: ((m.intros_used_this_month as number) ?? 0) + 1 })
        .eq('id', current.requester_member_id)
    }
  }

  return Response.json({ ok: true, status })
}
