// POST /api/portal/introductions/request
//
// A member, browsing the Network, asks The Club to introduce them to another
// member. Creates an introduction at status 'suggested' with requested_by =
// the asking member. It then appears in the admin "Requests" tab for Sarah to
// approve (→ compose & send) or reject.
//
// Body: { target_member_id }   (the member they'd like to meet)

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { orderedPair } from '@/lib/introductions/matching'

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

  const body = (await req.json().catch(() => ({}))) as { target_member_id?: string }
  if (!body.target_member_id) {
    return Response.json({ error: 'target_member_id is required.' }, { status: 400 })
  }

  const { data: me } = await supabase
    .from('members')
    .select('id, profiles(first_name, last_name)')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!me) return Response.json({ error: 'No member profile found.' }, { status: 403 })
  if (me.id === body.target_member_id) {
    return Response.json({ error: 'You cannot request an introduction to yourself.' }, { status: 400 })
  }

  const admin = getAdminDb()

  // Target must be an active member.
  const { data: target } = await admin
    .from('members')
    .select('id, membership_status')
    .eq('id', body.target_member_id)
    .maybeSingle()
  if (!target || target.membership_status !== 'active') {
    return Response.json({ error: 'That member is not available.' }, { status: 404 })
  }

  const [aId, bId] = orderedPair(me.id, body.target_member_id)

  const p = (me.profiles ?? {}) as { first_name?: string | null; last_name?: string | null }
  const requesterName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'A member'

  // A pair CAN have multiple introductions over time. Only block a new request
  // if one is currently in flight (not completed/declined) — past ones are
  // kept as history and don't prevent a fresh introduction.
  const ACTIVE = ['suggested', 'approved', 'sent', 'scheduled', 'accepted']
  const { data: existing } = await admin
    .from('introductions')
    .select('id, status')
    .eq('member_a_id', aId)
    .eq('member_b_id', bId)
  const inFlight = (existing ?? []).find((i) => ACTIVE.includes(i.status))
  if (inFlight) {
    return Response.json({
      ok: true,
      already: true,
      status: inFlight.status,
      message:
        inFlight.status === 'suggested'
          ? 'You have already requested this introduction.'
          : 'An introduction with this member is already in progress.',
    })
  }

  const { error } = await admin.from('introductions').insert({
    member_a_id: aId,
    member_b_id: bId,
    status: 'suggested',
    requested_by: me.id,
    match_reason: `Requested by ${requesterName}.`,
  })
  if (error) {
    console.error('[introductions/request] insert failed:', error)
    return Response.json({ error: 'Could not send your request.' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
