// POST /api/admin/members/change-email
//
// Change a member's email everywhere it matters, so the CRM, their login and
// Stripe never disagree:
//   1. the sign-in address (Supabase auth user — profile id === auth uid),
//      marked confirmed so they can log straight in with it;
//   2. profiles.email (what the CRM shows and emails);
//   3. the Stripe customer's email (receipts/invoices), best-effort.
// The old address stops working for sign-in immediately; their password is
// unchanged.
//
// Body: { member_id: string, email: string }   Admin only.

import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return Response.json({ error: 'Admin only.' }, { status: 403 })

  let body: { member_id?: string; email?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const memberId = typeof body.member_id === 'string' ? body.member_id : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!memberId || !email) {
    return Response.json({ error: 'member_id and email are required.' }, { status: 400 })
  }
  if (email.length > 254 || !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(email)) {
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const admin = getAdminDb()
  const { data: member } = await admin
    .from('members')
    .select('id, profile_id, stripe_customer_id, deleted_at')
    .eq('id', memberId)
    .maybeSingle()
  if (!member || member.deleted_at || !member.profile_id) {
    return Response.json({ error: 'Member not found.' }, { status: 404 })
  }

  // Another CRM account already using it?
  const { data: clash } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .neq('id', member.profile_id)
    .limit(1)
  if (clash && clash.length > 0) {
    return Response.json({ error: 'That email is already used by another account.' }, { status: 409 })
  }

  // 1. Login address (skipped if they have no login yet — the invite will
  //    create it with the new email).
  const { data: authUser } = await admin.auth.admin.getUserById(member.profile_id)
  if (authUser?.user && (authUser.user.email ?? '').toLowerCase() !== email) {
    const { error } = await admin.auth.admin.updateUserById(member.profile_id, {
      email,
      email_confirm: true,
    })
    if (error) {
      return Response.json(
        {
          error: /already|registered|exists/i.test(error.message)
            ? 'That email is already used by another login.'
            : `Could not change their login email: ${error.message}`,
        },
        { status: 409 },
      )
    }
  }

  // 2. CRM profile.
  const { error: profileErr } = await admin.from('profiles').update({ email }).eq('id', member.profile_id)
  if (profileErr) {
    return Response.json({ error: `Login updated, but the profile was not: ${profileErr.message}` }, { status: 500 })
  }

  // 3. Stripe customer — never fails the request.
  let stripeWarning: string | undefined
  if (member.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      await new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' }).customers.update(member.stripe_customer_id, { email })
    } catch (e) {
      console.error('[members/change-email] Stripe update failed:', e)
      stripeWarning = 'Stripe still has the old email for receipts.'
    }
  }

  return Response.json({ ok: true, email, warning: stripeWarning })
}
