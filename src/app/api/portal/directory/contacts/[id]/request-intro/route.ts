// POST /api/portal/directory/contacts/[id]/request-intro
//
// A member asks The Club to introduce them to a wider-network (CRM) contact.
// Creates a contact_intro_requests row at 'pending'; it appears alongside the
// member→member requests on the admin Introductions page for Sarah to handle.
//
// Body: { reason, desired_outcome? }
//
// Quota mirrors the member→member flow exactly: requesting is never blocked
// by monthly_intro_quota. The soft counter (intros_used_this_month) is bumped
// when the introduction is actually made — here, when Sarah marks the request
// 'completed' (see /api/admin/introductions/contact-requests/[id]).
//
// In-app admin notification only — no email is sent to anyone.

import { NextRequest } from 'next/server'
import { requireDirectoryViewer, UUID_RE } from '@/lib/directory/server'
import { createAdminNotification } from '@/lib/notifications/in-app'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireDirectoryViewer()
  if (!viewer.ok) return Response.json({ error: viewer.error }, { status: viewer.status })
  if (!viewer.memberId) {
    return Response.json(
      { error: 'Only members can request introductions.' },
      { status: 403 },
    )
  }

  const { id } = await params
  if (!UUID_RE.test(id)) return Response.json({ error: 'Unknown contact.' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as {
    reason?: string
    desired_outcome?: string
  }
  const reason = body.reason?.trim().slice(0, 2000) || null
  const desiredOutcome = body.desired_outcome?.trim().slice(0, 2000) || null
  if (!reason) {
    return Response.json({ error: 'Please share a reason for the introduction.' }, { status: 400 })
  }

  const admin = viewer.admin

  // Same visibility rules as the directory list — a hidden or member contact
  // can't be requested by guessing its id.
  const { data: contact } = await admin
    .from('contacts')
    .select('id, first_name, last_name, company_name, member_id, is_member_flag, directory_hidden')
    .eq('id', id)
    .maybeSingle()
  if (
    !contact ||
    contact.member_id ||
    contact.is_member_flag ||
    contact.directory_hidden ||
    !contact.first_name?.trim() ||
    !contact.last_name?.trim()
  ) {
    return Response.json({ error: 'That contact is not available.' }, { status: 404 })
  }

  // Block a new request while one is still open (pending or approved).
  const { data: open } = await admin
    .from('contact_intro_requests')
    .select('id, status')
    .eq('requester_member_id', viewer.memberId)
    .eq('contact_id', id)
    .in('status', ['pending', 'approved'])
    .limit(1)
  if (open && open.length > 0) {
    return Response.json(
      { error: 'You have already requested this introduction.', status: open[0].status },
      { status: 409 },
    )
  }

  const { error } = await admin.from('contact_intro_requests').insert({
    requester_member_id: viewer.memberId,
    contact_id: id,
    reason,
    desired_outcome: desiredOutcome,
  })
  if (error) {
    // 23505 = the unique pending index caught a double-submit race.
    if (error.code === '23505') {
      return Response.json({ error: 'You have already requested this introduction.' }, { status: 409 })
    }
    console.error('[directory/request-intro] insert failed:', error)
    return Response.json({ error: 'Could not send your request.' }, { status: 500 })
  }

  const contactName = `${contact.first_name} ${contact.last_name}`.trim()
  await createAdminNotification(admin, {
    kind: 'directory_contact_intro_request',
    title: `${viewer.memberName} would like to meet ${contactName}`,
    body: [contact.company_name, reason].filter(Boolean).join(' — '),
    link: '/dashboard/introductions',
  })

  return Response.json({ ok: true })
}
