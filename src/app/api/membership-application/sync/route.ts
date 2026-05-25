// POST /api/membership-application/sync
//
// Idempotent reconciliation between Stripe and our DB for the
// membership-application + pay flow.
//
// Why this exists: the Supabase Edge Function webhook is the
// authoritative path (it fires the moment Stripe confirms payment),
// but in local dev — and any environment where the webhook isn't
// reachable / hasn't been redeployed — payments would silently never
// land in our DB. This route gives the post-Stripe success page (and
// admin debugging) a way to pull the same data on demand: read the
// session, extract the subscription + customer + amount, then update
// the matching application row (and the member's row + payment, if a
// member already exists for that email).
//
// Body: { session_id: string }
//
// Public — anyone who has the session_id can trigger a sync (Stripe
// session IDs are not secret, but they ARE single-purpose and tied to
// a specific application). The sync only writes data Stripe confirms;
// it does not create members or accept user input.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { computeNextRenewal } from '@/lib/billing/renewal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  session_id?: string
}

export async function POST(req: NextRequest) {
  try {
    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const sessionId = body.session_id
    if (!sessionId) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })

    // 1. Load the session + subscription. `expand` saves us a round-trip
    //    to fetch the subscription separately.
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    })

    if (session.mode !== 'subscription') {
      return NextResponse.json(
        { error: 'session is not a subscription checkout' },
        { status: 400 },
      )
    }
    if (session.payment_status !== 'paid') {
      // Stripe hasn't finalised yet (pending bank confirmation, async
      // payment method). Caller can retry shortly.
      return NextResponse.json(
        { ok: false, status: 'pending', payment_status: session.payment_status },
        { status: 200 },
      )
    }

    const applicationId =
      (session.metadata?.application_id as string | undefined) ?? null
    const cadence =
      (session.metadata?.cadence as 'annual' | 'monthly' | undefined) ?? 'monthly'

    if (!applicationId) {
      return NextResponse.json(
        { error: 'session has no application_id metadata — nothing to sync' },
        { status: 400 },
      )
    }

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription?.id ?? null)
    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer?.id ?? null)
    const amountPence = session.amount_total ?? 0
    const paidAt = new Date().toISOString()
    const renewalDate = computeNextRenewal(paidAt, cadence)

    // 2. Admin client to bypass RLS — we're writing on behalf of a user
    //    who isn't authenticated yet.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 3. Update the application row with Stripe details. Safe to re-run
    //    (overwrites with same values).
    const { error: appErr, data: app } = await admin
      .from('membership_applications')
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        paid_at: paidAt,
        amount_paid_pence: amountPence,
      })
      .eq('id', applicationId)
      .select('email')
      .single()
    if (appErr) {
      console.error('[sync] failed to update application', appErr)
      return NextResponse.json({ error: appErr.message }, { status: 500 })
    }

    // 4. If a member already exists for this email (admin approved
    //    before the sync ran), link the Stripe data on the member row
    //    and create the initial payment record so finances + dashboard
    //    revenue + portal billing all reflect it.
    let memberLinked = false
    let paymentInserted = false
    if (app?.email) {
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('email', app.email)
        .maybeSingle()
      if (profile?.id) {
        const { data: member } = await admin
          .from('members')
          .select('id')
          .eq('profile_id', profile.id)
          .is('deleted_at', null)
          .maybeSingle()
        if (member) {
          await admin
            .from('members')
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              renewal_date: renewalDate,
              membership_status: 'active',
            })
            .eq('id', member.id)
          memberLinked = true

          // Idempotent payment insert — keyed on the session id so
          // re-running this route doesn't double-charge the books.
          const { data: existingPay } = await admin
            .from('payments')
            .select('id')
            .eq('stripe_checkout_session_id', sessionId)
            .maybeSingle()
          if (!existingPay) {
            await admin.from('payments').insert({
              member_id: member.id,
              amount_pence: amountPence,
              currency: 'GBP',
              payment_type: 'membership',
              payment_method: 'stripe',
              status: 'paid',
              paid_at: paidAt,
              stripe_checkout_session_id: sessionId,
              description: 'Membership — initial subscription payment',
            })
            paymentInserted = true
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      application_id: applicationId,
      member_linked: memberLinked,
      payment_inserted: paymentInserted,
      stripe_subscription_id: subscriptionId,
      amount_paid_pence: amountPence,
    })
  } catch (e) {
    console.error('[sync] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
