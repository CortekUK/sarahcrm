// POST /api/portal/introductions/request
//
// A member, browsing the Network, asks The Club to introduce them to another
// member. Creates an introduction at status 'suggested' with requested_by =
// the asking member. It then appears in the admin "Requests" tab for Sarah to
// approve (→ compose & send) or reject.
//
// Body: { target_member_id, reason, desired_outcome? }
//
// Limits: reason required (≤2000 chars); at most monthly_intro_quota requests
// per calendar month (UK); target must be an active, non-deleted member who
// is listed in the directory; one in-flight request per pair.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { orderedPair } from '@/lib/introductions/matching'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT = 2000
// Ceiling for members with no monthly_intro_quota set (0).
const FALLBACK_MONTHLY_LIMIT = 10

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
    target_member_id?: string
    reason?: string
    desired_outcome?: string
  }
  if (!body.target_member_id) {
    return Response.json({ error: 'target_member_id is required.' }, { status: 400 })
  }

  if (!UUID_RE.test(body.target_member_id)) {
    return Response.json({ error: 'That member is not available.' }, { status: 404 })
  }

  // Free-text context from the requesting member. The Network screen
  // requires a reason, so the API does too; whitespace-only counts as
  // empty, and both fields are length-limited.
  const requestReason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const desiredOutcome =
    typeof body.desired_outcome === 'string' ? body.desired_outcome.trim() || null : null
  if (!requestReason) {
    return Response.json({ error: 'Please share a reason for the introduction.' }, { status: 400 })
  }
  if (requestReason.length > MAX_TEXT || (desiredOutcome && desiredOutcome.length > MAX_TEXT)) {
    return Response.json(
      { error: `Please keep the reason and desired outcome under ${MAX_TEXT} characters.` },
      { status: 400 },
    )
  }

  const { data: me } = await supabase
    .from('members')
    .select('id, membership_status, monthly_intro_quota, profiles(first_name, last_name)')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!me) return Response.json({ error: 'No member profile found.' }, { status: 403 })
  if (me.membership_status !== 'active') {
    return Response.json({ error: 'Only active members can request introductions.' }, { status: 403 })
  }
  if (me.id === body.target_member_id) {
    return Response.json({ error: 'You cannot request an introduction to yourself.' }, { status: 400 })
  }

  const admin = getAdminDb()

  // Target must be an active, non-deleted member who is listed in the
  // directory (same visibility rule as the Network page) — a hidden member
  // can't be requested by guessing their id.
  const { data: target } = await admin
    .from('members')
    .select('id, membership_status, showcase_enabled, deleted_at')
    .eq('id', body.target_member_id)
    .maybeSingle()
  if (
    !target ||
    target.membership_status !== 'active' ||
    target.deleted_at ||
    !target.showcase_enabled
  ) {
    return Response.json({ error: 'That member is not available.' }, { status: 404 })
  }

  const ACTIVE = ['suggested', 'approved', 'sent', 'scheduled', 'accepted']
  const [aId, bId] = orderedPair(me.id, body.target_member_id)

  const p = (me.profiles ?? {}) as { first_name?: string | null; last_name?: string | null }
  const requesterName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'A member'

  // A pair CAN have multiple introductions over time. Only block a new request
  // if one is currently in flight (not completed/declined) — past ones are
  // kept as history and don't prevent a fresh introduction.
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

  // Monthly allowance: a member can make at most monthly_intro_quota
  // requests per calendar month (any outcome). With no quota set we still
  // apply a fixed anti-abuse ceiling.
  const quota = (me.monthly_intro_quota as number | null) ?? 0
  const limit = quota > 0 ? quota : FALLBACK_MONTHLY_LIMIT
  const monthStart = startOfMonthIso()
  const { count: usedThisMonth } = await admin
    .from('introductions')
    .select('id', { count: 'exact', head: true })
    .eq('requested_by', me.id)
    .gte('created_at', monthStart)
  if ((usedThisMonth ?? 0) >= limit) {
    return Response.json(
      { error: `You have used this month's ${limit} introduction requests. You can request more next month.` },
      { status: 429 },
    )
  }

  const { data: inserted, error } = await admin
    .from('introductions')
    .insert({
      member_a_id: aId,
      member_b_id: bId,
      status: 'suggested',
      requested_by: me.id,
      request_reason: requestReason,
      desired_outcome: desiredOutcome,
      match_reason: `Requested by ${requesterName}.`,
    })
    .select('id')
    .single()
  if (error || !inserted) {
    if (error?.code === '23505') {
      return Response.json({
        ok: true,
        already: true,
        status: 'suggested',
        message: 'You have already requested this introduction.',
      })
    }
    console.error('[introductions/request] insert failed:', error)
    return Response.json({ error: 'Could not send your request.' }, { status: 500 })
  }

  // Concurrency guard (no DB lock/unique rule to lean on): several requests
  // fired at once can all pass the checks above. Re-read and keep only the
  // OLDEST in-flight row for this pair, and only the first `limit` requests
  // this month; if ours lost either race, remove it again.
  const byAge = (x: { created_at: string; id: string }, y: { created_at: string; id: string }) =>
    x.created_at === y.created_at ? (x.id < y.id ? -1 : 1) : x.created_at < y.created_at ? -1 : 1
  const [{ data: pairRows }, { data: monthRows }] = await Promise.all([
    admin
      .from('introductions')
      .select('id, created_at, status')
      .eq('member_a_id', aId)
      .eq('member_b_id', bId)
      .in('status', ACTIVE),
    admin
      .from('introductions')
      .select('id, created_at')
      .eq('requested_by', me.id)
      .gte('created_at', monthStart),
  ])
  const firstForPair = [...(pairRows ?? [])].sort(byAge)[0]
  const monthRank = [...(monthRows ?? [])].sort(byAge).findIndex((r) => r.id === inserted.id)
  if (firstForPair && firstForPair.id !== inserted.id) {
    await admin.from('introductions').delete().eq('id', inserted.id).eq('status', 'suggested')
    return Response.json({
      ok: true,
      already: true,
      status: firstForPair.status,
      message:
        firstForPair.status === 'suggested'
          ? 'You have already requested this introduction.'
          : 'An introduction with this member is already in progress.',
    })
  }
  if (monthRank >= limit) {
    await admin.from('introductions').delete().eq('id', inserted.id).eq('status', 'suggested')
    return Response.json(
      { error: `You have used this month's ${limit} introduction requests. You can request more next month.` },
      { status: 429 },
    )
  }

  return Response.json({ ok: true })
}

// First instant of the current calendar month in UK time, as an ISO string.
function startOfMonthIso(): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const y = Number(parts.find((p) => p.type === 'year')?.value)
  const m = Number(parts.find((p) => p.type === 'month')?.value)
  // Midnight UK on the 1st: UTC midnight minus the UK offset on that date
  // (BST = +1h). Probe the offset at 12:00 UTC on the 1st.
  const probe = new Date(Date.UTC(y, m - 1, 1, 12))
  const ukHour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(probe),
  )
  const offsetH = ukHour - 12
  return new Date(Date.UTC(y, m - 1, 1, 0) - offsetH * 3600_000).toISOString()
}
