// POST /api/admin/introductions/reject
//
// Sarah declines an introduction (typically a member-initiated request).
// Marks it 'declined', stores an internal note (admin-only), and optionally
// emails the requester a short, polite note.
//
// Body: { introduction_id, note?, notify?: boolean, message? }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { renderClubEmail } from '@/lib/email/club-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const DEFAULT_MESSAGE =
  "Thank you for letting us know who you'd like to meet. On this occasion we're not able to make this introduction, but we'll keep it in mind as the membership grows."

export async function POST(req: NextRequest) {
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

  const body = (await req.json().catch(() => ({}))) as {
    introduction_id?: string
    note?: string
    notify?: boolean
    message?: string
  }
  if (!body.introduction_id) {
    return Response.json({ error: 'introduction_id is required.' }, { status: 400 })
  }

  const admin = getAdminDb()
  const { data: intro } = await admin
    .from('introductions')
    .select(
      'id, requested_by, member_a_id, member_b_id, a:members!introductions_member_a_id_fkey(profiles(first_name, email)), b:members!introductions_member_b_id_fkey(profiles(first_name, email))',
    )
    .eq('id', body.introduction_id)
    .single()
  if (!intro) return Response.json({ error: 'Introduction not found.' }, { status: 404 })

  const note = body.note?.trim() || null
  await admin
    .from('introductions')
    .update({ status: 'declined', ...(note ? { outcome: `Declined: ${note}` } : {}) })
    .eq('id', intro.id)

  // Optionally email the requester (the member who asked).
  let emailed = false
  if (body.notify) {
    const requesterIsA = intro.requested_by === intro.member_a_id
    const requesterIsB = intro.requested_by === intro.member_b_id
    const requester = requesterIsA
      ? (intro.a as { profiles?: { first_name?: string | null; email?: string | null } } | null)?.profiles
      : requesterIsB
        ? (intro.b as { profiles?: { first_name?: string | null; email?: string | null } } | null)?.profiles
        : null
    if (requester?.email) {
      const { sendClubEmail } = await import('@/lib/email/club-email')
      const html = renderClubEmail({
        eyebrow: 'Introductions',
        heading: 'About your introduction request',
        paragraphs: [
          `Hello ${requester.first_name || 'there'},`,
          (body.message?.trim() || DEFAULT_MESSAGE),
        ],
      })
      const r = await sendClubEmail({
        to: requester.email,
        subject: 'Your introduction request',
        html,
        category: 'introduction_declined',
        memberId: intro.requested_by ?? null,
      })
      emailed = r.sent
    }
  }

  return Response.json({ ok: true, status: 'declined', emailed })
}
