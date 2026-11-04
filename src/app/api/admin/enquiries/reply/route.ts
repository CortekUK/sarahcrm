// POST /api/admin/enquiries/reply
//
// Send an in-app reply to a public-contact-form enquiry through the same
// branded Resend pipeline every other transactional email uses — so admins
// never have to leave the CRM for their external mail client. On a successful
// send the enquiry row is marked replied.
//
// Body: { enquiry_id: string, subject: string, body: string }
// Returns: { ok: true } or { error }

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { escapeHtml, renderClubEmail, sendClubEmail } from '@/lib/email/club-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(request: Request) {
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

  // ── Parse + validate ────────────────────────────────────────────
  let payload: { enquiry_id?: string; subject?: string; body?: string }
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const enquiryId = typeof payload.enquiry_id === 'string' ? payload.enquiry_id.trim() : ''
  // The subject is a plain-text header: strip any tags typed into it and
  // collapse whitespace/newlines (header injection).
  const subject =
    typeof payload.subject === 'string'
      ? payload.subject.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      : ''
  const body = typeof payload.body === 'string' ? payload.body.trim() : ''
  if (!enquiryId || !subject || !body) {
    return Response.json(
      { error: 'enquiry_id, subject and body are all required.' },
      { status: 400 },
    )
  }
  if (subject.length > 200 || body.length > 20000) {
    return Response.json({ error: 'Subject or message is too long.' }, { status: 400 })
  }

  const admin = getAdminDb()

  // ── Load the enquiry (need the recipient email) ─────────────────
  const { data: enquiry, error: loadError } = await admin
    .from('enquiries')
    .select('id, email, first_name')
    .eq('id', enquiryId)
    .single()
  if (loadError || !enquiry) {
    return Response.json({ error: 'Enquiry not found.' }, { status: 404 })
  }
  if (!enquiry.email) {
    return Response.json({ error: 'This enquiry has no email address.' }, { status: 400 })
  }

  // ── Render branded HTML + send ──────────────────────────────────
  // The admin writes plain text; each paragraph (blank-line separated)
  // becomes its own branded paragraph so line breaks read naturally. The
  // text is escaped first, so any HTML typed or pasted (e.g. quoting the
  // enquirer's message) is shown as text, never rendered.
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => escapeHtml(p.trim()).replace(/\n/g, '<br />'))
    .filter(Boolean)
  const html = renderClubEmail({
    heading: escapeHtml(subject),
    paragraphs: paragraphs.length ? paragraphs : [escapeHtml(body)],
  })

  const result = await sendClubEmail({
    to: enquiry.email,
    subject,
    html,
    category: 'enquiry_reply',
  })
  if (!result.sent) {
    return Response.json({ error: result.error ?? 'Failed to send email.' }, { status: 502 })
  }

  // ── Mark replied ────────────────────────────────────────────────
  const repliedAt = new Date().toISOString()
  const { error: updateError } = await admin
    .from('enquiries')
    .update({ status: 'replied', replied_at: repliedAt })
    .eq('id', enquiryId)
  if (updateError) {
    // Email already went out — surface the row-update failure but don't
    // pretend the send failed.
    return Response.json(
      { ok: true, warning: 'Reply sent, but could not update status.' },
      { status: 200 },
    )
  }

  return Response.json({ ok: true, replied_at: repliedAt })
}
