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
    .select('id, member_a_id, member_b_id, member_a_response, member_b_response, status')
    .eq('id', body.introduction_id)
    .single()
  if (!intro) return Response.json({ error: 'Introduction not found.' }, { status: 404 })

  const isA = intro.member_a_id === me.id
  const isB = intro.member_b_id === me.id
  if (!isA && !isB) {
    return Response.json({ error: 'This introduction is not yours.' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const note = body.note?.trim() ? body.note.trim() : null

  const update: Record<string, unknown> = isA
    ? { member_a_response: body.response, member_a_response_note: note, member_a_responded_at: now }
    : { member_b_response: body.response, member_b_response_note: note, member_b_responded_at: now }

  // Roll up the overall status.
  const myResp = body.response
  const otherResp = isA ? intro.member_b_response : intro.member_a_response
  if (myResp === 'declined') {
    update.status = 'declined'
  } else if (myResp === 'accepted' && otherResp === 'accepted') {
    update.status = 'accepted'
    update.accepted_at = now
  }

  const { error } = await admin.from('introductions').update(update).eq('id', intro.id)
  if (error) {
    console.error('[introductions/respond] update failed:', error)
    return Response.json({ error: 'Could not save your response.' }, { status: 500 })
  }

  return Response.json({ ok: true, response: body.response, overall: update.status ?? intro.status })
}
