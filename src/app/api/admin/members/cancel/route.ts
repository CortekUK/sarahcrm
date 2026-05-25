// POST /api/admin/members/cancel
//
// Cancel a member's membership. Three things happen:
//   1. members.membership_status → 'cancelled'
//   2. If they have a Stripe subscription, cancel it at-period-end (so
//      they get their paid time, but no renewal). Falls through silently
//      if Stripe call fails — local cancellation still wins.
//   3. Sign out their current session(s) by deleting their refresh
//      tokens. The middleware enforces /portal access on every request,
//      so they'd be booted on the next click regardless — this just
//      makes the boot immediate instead of one-tab-cycle later.
//
// Body: { member_id: string, reason?: string }
//
// Admin-only.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  member_id?: string
  reason?: string
}

function getAdminDb() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only.', status: 403 as const }
  }
  return { admin: profile }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return Response.json({ error: auth.error }, { status: auth.status })
    }

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.member_id) {
      return Response.json({ error: 'member_id required' }, { status: 400 })
    }

    const admin = getAdminDb()

    // 1. Load the member to grab profile_id + Stripe sub (if any)
    const { data: member, error: loadErr } = await admin
      .from('members')
      .select('id, profile_id, stripe_subscription_id, membership_status')
      .eq('id', body.member_id)
      .single()
    if (loadErr || !member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }
    if (member.membership_status === 'cancelled') {
      // Idempotent: already cancelled is success.
      return Response.json({ ok: true, already_cancelled: true })
    }

    // 2. Cancel Stripe subscription if one exists — at-period-end so the
    //    member keeps the time they've already paid for. Wrapped in
    //    try/catch so a Stripe outage / stale sub doesn't block the
    //    local cancellation (the source of truth is our DB).
    let stripeCancelled: 'cancelled' | 'failed' | 'none' = 'none'
    let stripeError: string | null = null
    if (member.stripe_subscription_id) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: '2026-02-25.clover',
        })
        await stripe.subscriptions.update(member.stripe_subscription_id, {
          cancel_at_period_end: true,
          metadata: {
            cancelled_by: auth.admin.id,
            reason: body.reason ?? '',
          },
        })
        stripeCancelled = 'cancelled'
      } catch (err) {
        console.error('[cancel-member] Stripe update failed', err)
        stripeCancelled = 'failed'
        stripeError = err instanceof Error ? err.message : 'Stripe cancel failed'
      }
    }

    // 3. Local cancel — this is the bit that actually blocks portal access
    //    via the middleware's status check.
    const { error: updErr } = await admin
      .from('members')
      .update({
        membership_status: 'cancelled',
        membership_end_date: new Date().toISOString().slice(0, 10),
        notes: body.reason
          ? `[Cancelled ${new Date().toISOString().slice(0, 10)} by admin] ${body.reason}`
          : undefined,
      })
      .eq('id', body.member_id)
    if (updErr) {
      return Response.json({ error: updErr.message }, { status: 500 })
    }

    // 4. Boot any active session immediately. `signOut` on the auth admin
    //    client invalidates all the user's refresh tokens — so even if
    //    their browser still has a stale JWT, the next /portal request
    //    fails the cookie check and the middleware redirects them to
    //    /login. Without this step they'd keep portal access until the
    //    JWT expired (~1 hour by default).
    try {
      await admin.auth.admin.signOut(member.profile_id)
    } catch (err) {
      console.error('[cancel-member] signOut failed (non-fatal)', err)
    }

    return Response.json({
      ok: true,
      stripe: stripeCancelled,
      stripe_error: stripeError,
    })
  } catch (e) {
    console.error('[cancel-member] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
