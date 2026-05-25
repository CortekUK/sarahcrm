// POST /api/events/sync
//
// Reconcile an event booking with Stripe on demand. Same pattern as
// /api/membership-application/sync — the success page calls this when
// the user lands after paying, so the booking flips to "confirmed"
// and a payment row is inserted without depending on the webhook.
//
// Body: { session_id: string }
//
// Public — anyone who has the session_id can trigger; the route only
// writes data Stripe confirms.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

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

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    })

    if (session.mode !== 'payment') {
      return NextResponse.json(
        { error: 'session is not a one-off payment checkout' },
        { status: 400 },
      )
    }
    if (session.payment_status !== 'paid') {
      // Stripe hasn't finalised yet — caller can retry shortly.
      return NextResponse.json(
        { ok: false, status: 'pending', payment_status: session.payment_status },
        { status: 200 },
      )
    }

    const bookingId = (session.metadata?.booking_id as string | undefined) ?? null
    if (!bookingId) {
      return NextResponse.json(
        { error: 'session has no booking_id metadata — nothing to sync' },
        { status: 400 },
      )
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null)
    const amountPence = session.amount_total ?? 0
    const paidAt = new Date().toISOString()

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 1. Flip the booking to confirmed. Save the payment intent id so
    //    the webhook's idempotency check won't double-process if it
    //    eventually does fire.
    const { data: booking, error: bookErr } = await admin
      .from('bookings')
      .update({
        status: 'confirmed',
        stripe_payment_intent_id: paymentIntentId,
        amount_pence: amountPence,
      })
      .eq('id', bookingId)
      .select('id, member_id, is_guest')
      .single()
    if (bookErr || !booking) {
      console.error('[event-sync] failed to update booking', bookErr)
      return NextResponse.json(
        { error: bookErr?.message ?? 'Booking not found' },
        { status: 500 },
      )
    }

    // 2. Insert a payment row IF the booking is tied to a member.
    //    payments.member_id is NOT NULL — guest bookings don't get a
    //    member-keyed payment record. (Finance still sees the revenue
    //    via the bookings.amount_pence aggregate; this is a known
    //    limitation of payments being member-scoped.)
    let paymentInserted = false
    if (booking.member_id) {
      const { data: existing } = await admin
        .from('payments')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle()
      if (!existing) {
        await admin.from('payments').insert({
          member_id: booking.member_id,
          amount_pence: amountPence,
          currency: 'GBP',
          payment_type: 'event_booking',
          payment_method: 'stripe',
          status: 'paid',
          paid_at: paidAt,
          stripe_payment_intent_id: paymentIntentId,
          reference_id: booking.id,
          description: 'Event booking',
        })
        paymentInserted = true
      }
    }

    return NextResponse.json({
      ok: true,
      booking_id: booking.id,
      payment_inserted: paymentInserted,
      is_guest: booking.is_guest,
      amount_pence: amountPence,
    })
  } catch (e) {
    console.error('[event-sync] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
