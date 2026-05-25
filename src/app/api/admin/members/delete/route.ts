// POST /api/admin/members/delete
//
// Permanently remove a member: deletes the auth.users row (which
// cascades to profiles + members + bookings + intros), and tries to
// cancel any Stripe subscription IMMEDIATELY (not at-period-end —
// admin chose to delete, not cancel-at-renewal).
//
// Body: { member_id: string }
//
// Admin-only. Destructive — the admin UI confirms before calling this.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  member_id?: string
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

    const { data: member, error: loadErr } = await admin
      .from('members')
      .select('id, profile_id, stripe_subscription_id')
      .eq('id', body.member_id)
      .single()
    if (loadErr || !member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    // Self-delete guard — admins shouldn't be able to remove themselves
    // via the members UI (that's a one-way door to no admins).
    if (member.profile_id === auth.admin.id) {
      return Response.json(
        { error: "You can't delete your own account from here." },
        { status: 400 },
      )
    }

    // 1. Cancel Stripe subscription immediately if it exists. Different
    //    from /cancel which uses cancel_at_period_end — delete is the
    //    "hard" path.
    if (member.stripe_subscription_id) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: '2026-02-25.clover',
        })
        await stripe.subscriptions.cancel(member.stripe_subscription_id)
      } catch (err) {
        console.error('[delete-member] Stripe cancel failed (non-fatal)', err)
      }
    }

    // 2. Delete the auth user. Cascade order (configured in Postgres
    //    FK rules): auth.users → profiles → members → bookings / intros.
    //    One call removes everything atomically.
    const { error: deleteErr } = await admin.auth.admin.deleteUser(member.profile_id)
    if (deleteErr) {
      // Fall back to soft-delete the member row only — that way the
      // admin doesn't lose the audit trail if the auth delete is
      // blocked by RLS/policy.
      console.error('[delete-member] auth.deleteUser failed, falling back to soft delete', deleteErr)
      const { error: softErr } = await admin
        .from('members')
        .update({
          deleted_at: new Date().toISOString(),
          membership_status: 'cancelled',
        })
        .eq('id', body.member_id)
      if (softErr) {
        return Response.json({ error: softErr.message }, { status: 500 })
      }
      return Response.json({
        ok: true,
        soft_deleted: true,
        message: 'Auth user could not be removed; member row soft-deleted.',
      })
    }

    return Response.json({ ok: true, soft_deleted: false })
  } catch (e) {
    console.error('[delete-member] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
