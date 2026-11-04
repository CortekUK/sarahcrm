// POST /api/admin/applications/delete
//
// Delete a membership application. Replaces the old direct browser delete,
// which removed only the CRM row and left the applicant's saved card (and
// Stripe customer) attached in Stripe with nothing pointing at it (QA #42).
//
// Body: { application_id: string }
//
// Admin only. Refused (409) for applications that are approved, mid-approval
// ('processing'), or carry a payment / subscription / refund record — those
// are financial records and must be kept (cancel or reject instead).
// Otherwise, if a saved payment method is on file it is detached in Stripe
// FIRST; if that fails (other than "already gone") the row is kept so the
// card isn't orphaned, and the admin sees the error.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
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
  const auth = await requireAdmin()
  if ('error' in auth) {
    return Response.json({ error: auth.error }, { status: auth.status })
  }

  let body: { application_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const applicationId = typeof body.application_id === 'string' ? body.application_id.trim() : ''
  if (!applicationId) {
    return Response.json({ error: 'application_id is required.' }, { status: 400 })
  }

  const db = getAdminDb()
  const { data: app, error: loadErr } = await db
    .from('membership_applications')
    .select(
      'id, status, amount_paid_pence, paid_at, stripe_subscription_id, refund_id, refunded_at, stripe_payment_method_id, stripe_customer_id',
    )
    .eq('id', applicationId)
    .maybeSingle()
  if (loadErr) {
    return Response.json({ error: loadErr.message }, { status: 500 })
  }
  if (!app) {
    return Response.json({ error: 'Application not found.' }, { status: 404 })
  }

  if (app.status === 'approved') {
    return Response.json(
      {
        error:
          'This application has been approved and the applicant is a member — it is kept as their joining record. Manage or cancel the membership from Members instead.',
      },
      { status: 409 },
    )
  }
  if (app.status === 'processing') {
    return Response.json(
      { error: 'This application is being approved right now. Wait for that to finish, then try again.' },
      { status: 409 },
    )
  }
  const hasPaymentRecord =
    (app.amount_paid_pence ?? 0) > 0 ||
    Boolean(app.paid_at) ||
    Boolean(app.stripe_subscription_id) ||
    Boolean(app.refund_id) ||
    Boolean(app.refunded_at)
  if (hasPaymentRecord) {
    return Response.json(
      {
        error:
          'This application has a payment, subscription or refund on record, so it can’t be deleted — Finance needs it. Reject it instead if it isn’t already.',
      },
      { status: 409 },
    )
  }

  // Detach the saved card / Direct Debit mandate so nothing stays chargeable
  // in Stripe once the CRM row is gone.
  let paymentMethodDetached = false
  if (app.stripe_payment_method_id) {
    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json(
        {
          error:
            'A saved payment method is on file but Stripe isn’t configured on this server, so it can’t be removed. The application was not deleted.',
        },
        { status: 500 },
      )
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
    })
    try {
      await stripe.paymentMethods.detach(app.stripe_payment_method_id)
      paymentMethodDetached = true
    } catch (err) {
      const e = err as { code?: string; message?: string }
      // Already detached / deleted in Stripe — nothing left to clean up.
      const alreadyGone =
        e.code === 'resource_missing' ||
        /not attached|no such paymentmethod/i.test(e.message ?? '')
      if (!alreadyGone) {
        return Response.json(
          {
            error: `Couldn’t remove the saved payment method in Stripe (${e.message ?? 'unknown error'}). The application was not deleted — try again.`,
          },
          { status: 502 },
        )
      }
    }
  }

  const { error: delErr } = await db
    .from('membership_applications')
    .delete()
    .eq('id', applicationId)
  if (delErr) {
    return Response.json({ error: delErr.message }, { status: 500 })
  }

  return Response.json({ ok: true, payment_method_detached: paymentMethodDetached })
}
