// POST /api/portal/introductions/respond
//
// A member accepts or rejects an introduction and optionally leaves a note
// (the note is for The Club / Sarah only — never shown to the other member).
//
// Resolves the caller to member_a or member_b, records their response, then
// rolls up the overall status:
//   both accepted  -> 'accepted'  (ready for Sarah to connect them)
//   either declined -> 'declined'
//   otherwise stays 'sent'/'scheduled'
//
// Only allowed once The Club has sent this member the introduction, while
// it is still open (sent/scheduled), and only once per side.
//
// Body: { introduction_id, response: 'accepted' | 'declined', note?: string }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    introduction_id?: string
    response?: 'accepted' | 'declined'
    note?: string
  }
  if (!body.introduction_id || (body.response !== 'accepted' && body.response !== 'declined')) {
    return Response.json({ error: 'introduction_id and a valid response are required.' }, { status: 400 })
  }

  // Which member is the caller?
  const { data: me } = await supabase
    .from('members')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!me) return Response.json({ error: 'No member profile found.' }, { status: 403 })

  const admin = getAdminDb()
  const { data: intro } = await admin
    .from('introductions')
    .select(
      'id, member_a_id, member_b_id, member_a_response, member_b_response, email_a_sent_at, email_b_sent_at, status',
    )
    .eq('id', body.introduction_id)
    .maybeSingle()
  if (!intro) return Response.json({ error: 'Introduction not found.' }, { status: 404 })

  const isA = intro.member_a_id === me.id
  const isB = intro.member_b_id === me.id
  if (!isA && !isB) {
    return Response.json({ error: 'This introduction is not yours.' }, { status: 403 })
  }
  const side = isA ? 'a' : 'b'

  // A member can only answer once The Club has actually sent THEM the
  // introduction, while it is still open, and only once. (A request the
  // member made themselves sits at 'suggested' with no email sent until
  // Sarah approves and sends it, so it can't be self-accepted.) Re-sending
  // after a decline resets that side to 'pending' (see admin send route).
  const OPEN = ['sent', 'scheduled']
  const mySentAt = isA ? intro.email_a_sent_at : intro.email_b_sent_at
  const myCurrent = isA ? intro.member_a_response : intro.member_b_response
  if (!mySentAt || !OPEN.includes(intro.status as string)) {
    return Response.json(
      { error: 'This introduction is not open for a response yet.' },
      { status: 409 },
    )
  }
  if (myCurrent !== 'pending') {
    return Response.json({ error: 'You have already responded to this introduction.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const note = body.note?.trim() ? body.note.trim().slice(0, 2000) : null

  const update: Record<string, unknown> = isA
    ? { member_a_response: body.response, member_a_response_note: note, member_a_responded_at: now }
    : { member_b_response: body.response, member_b_response_note: note, member_b_responded_at: now }
  if (body.response === 'declined') update.status = 'declined'

  // Conditional update = atomic claim: only lands while this side is still
  // pending and the introduction is still open, so a double-click or a
  // replay can't flip an answer that was already given.
  const { data: claimed, error } = await admin
    .from('introductions')
    .update(update)
    .eq('id', intro.id)
    .eq(`member_${side}_response`, 'pending')
    .not(`email_${side}_sent_at`, 'is', null)
    .in('status', OPEN)
    .select('id, member_a_response, member_b_response, status')
    .maybeSingle()
  if (error) {
    console.error('[introductions/respond] update failed:', error)
    return Response.json({ error: 'Could not save your response.' }, { status: 500 })
  }
  if (!claimed) {
    return Response.json({ error: 'You have already responded to this introduction.' }, { status: 409 })
  }

  // Roll up 'accepted' from the row as it now stands (not from our earlier
  // read) so two members accepting at the same moment still end accepted.
  let overall = claimed.status as string
  if (claimed.member_a_response === 'accepted' && claimed.member_b_response === 'accepted') {
    const { data: rolled } = await admin
      .from('introductions')
      .update({ status: 'accepted', accepted_at: now })
      .eq('id', intro.id)
      .in('status', OPEN)
      .select('status')
      .maybeSingle()
    overall = (rolled?.status as string | undefined) ?? 'accepted'
  }

  return Response.json({ ok: true, response: body.response, overall })
}
