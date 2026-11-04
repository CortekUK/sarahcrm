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
// writes data Stripe confirms. Every transition is a conditional update
// (pending → confirmed, or "awaiting checkout" → held), so a replayed
// success link, a page refresh, or racing with the stripe-webhook can never
// re-confirm a cancelled booking or send a second email. A payment whose
// booking is no longer active (removed / cancelled) is recorded anyway and
// flagged to the team for refund.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { notifyAdmins } from '@/lib/email/admin-notify'
import { AWAITING_CHECKOUT, escapeHtml, getSiteUrl } from '@/lib/stripe/server-helpers'
import { sendBookingConfirmationEmail } from '@/lib/stripe/booking-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  session_id?: string
}

type BookingRow = {
  id: string
  status: string
  amount_pence: number | null
  member_id: string | null
  is_guest: boolean
  guest_name: string | null
  guest_email: string | null
  guests_invited: number | null
  accommodation_booked: boolean | null
  stripe_payment_intent_id: string | null
  events: { id: string; title: string | null; start_date: string | null; venue_name: string | null } | null
  members: { profiles: { first_name: string | null; email: string | null } | null } | null
}

const BOOKING_SELECT =
  'id, status, amount_pence, member_id, is_guest, guest_name, guest_email, guests_invited, accommodation_booked, stripe_payment_intent_id, events(id, title, start_date, venue_name), members(profiles(first_name, email))'

export async function POST(req: NextRequest) {
  try {
    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const sessionId = body.session_id
    if (!sessionId || typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]{1,250}$/.test(sessionId)) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })

    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent', 'setup_intent'],
      })
    } catch {
      return NextResponse.json({ error: 'Checkout session not found.' }, { status: 404 })
    }

    const bookingId = (session.metadata?.booking_id as string | undefined) ?? null
    if (!bookingId) {
      return NextResponse.json(
        { error: 'session has no booking_id metadata — nothing to sync' },
        { status: 400 },
      )
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const site = getSiteUrl()

    const recipientOf = (b: BookingRow) => ({
      email: b.is_guest ? b.guest_email : (b.members?.profiles?.email ?? b.guest_email),
      firstName: b.is_guest ? b.guest_name : (b.members?.profiles?.first_name ?? b.guest_name),
    })
    const tellAdmins = (b: BookingRow, line: string) => {
      const title = escapeHtml(b.events?.title ?? 'an event')
      const who = b.is_guest ? escapeHtml(b.guest_name || 'A guest') : 'A member'
      return notifyAdmins(admin, {
        subject: `${b.is_guest ? 'New guest booking' : 'New member booking'} — ${b.events?.title ?? 'event'}`,
        heading: b.is_guest ? 'A new guest booking has come in.' : 'A member has booked an event.',
        paragraphs: [
          `<strong style="color:#2C2825;">${who}</strong> booked <strong style="color:#2C2825;">${title}</strong>${b.accommodation_booked ? ' (with accommodation)' : ''}${(b.guests_invited ?? 0) > 0 ? ' and is bringing a guest' : ''}.`,
          line,
        ],
        ctaUrl: `${site}/dashboard/bookings`,
        ctaLabel: 'View bookings',
      })
    }

    // ── HOLD flow (non-auto-confirm events) ──────────────────────────
    // The card was saved, not charged. Persist the saved card on the
    // booking and leave status 'pending' for admin approval. No money
    // has moved.
    if (session.mode === 'setup') {
      const si = session.setup_intent
      const setupIntent =
        typeof si === 'string' ? await stripe.setupIntents.retrieve(si) : si
      if (!setupIntent || setupIntent.status !== 'succeeded') {
        return NextResponse.json(
          { ok: false, status: 'pending', held: false },
          { status: 200 },
        )
      }
      const paymentMethodId =
        typeof setupIntent.payment_method === 'string'
          ? setupIntent.payment_method
          : (setupIntent.payment_method?.id ?? null)
      const customerId =
        typeof setupIntent.customer === 'string'
          ? setupIntent.customer
          : (setupIntent.customer?.id ?? null)
      // Only a booking that is still pending can take the card.
      const { data: current } = await admin
        .from('bookings')
        .select('id, status')
        .eq('id', bookingId)
        .maybeSingle()
      if (!current || current.status !== 'pending') {
        return NextResponse.json(
          { ok: false, error: 'This booking is no longer active.' },
          { status: 409 },
        )
      }
      // Make the saved card the customer's default so approval can charge
      // it off-session without re-selecting a payment method.
      if (paymentMethodId && customerId) {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        })
      }
      // Conditional on the "awaiting checkout" marker: only the first of
      // sync / webhook / a refresh gets a row back, and only it notifies.
      const { data: claimed } = await admin
        .from('bookings')
        .update({ charge_error: null })
        .eq('id', bookingId)
        .eq('status', 'pending')
        .eq('charge_error', AWAITING_CHECKOUT)
        .select(BOOKING_SELECT)
        .maybeSingle()
      await admin
        .from('bookings')
        .update({
          stripe_setup_intent_id: setupIntent.id,
          stripe_payment_method_id: paymentMethodId,
          stripe_customer_id: customerId,
        })
        .eq('id', bookingId)
        .eq('status', 'pending')
      if (claimed) {
        const b = claimed as unknown as BookingRow
        await tellAdmins(b, 'Their card is held — approve the booking in the dashboard to charge it.')
        const r = recipientOf(b)
        if (r.email) {
          await sendBookingConfirmationEmail({
            to: r.email,
            firstName: r.firstName,
            eventId: b.events?.id ?? '',
            eventTitle: b.events?.title,
            startDate: b.events?.start_date,
            venueName: b.events?.venue_name,
            amountPence: b.amount_pence ?? 0,
            kind: 'held',
            isGuest: b.is_guest,
            memberId: b.member_id,
          })
        }
      }
      return NextResponse.json({ ok: true, held: true, status: 'pending', booking_id: bookingId })
    }

    // ── CHARGE flow (auto-confirm events) ────────────────────────────
    if (session.payment_status !== 'paid') {
      // Stripe hasn't finalised yet — caller can retry shortly.
      return NextResponse.json(
        { ok: false, status: 'pending', payment_status: session.payment_status },
        { status: 200 },
      )
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null)
    const amountPence = session.amount_total ?? 0
    const paidAt = new Date().toISOString()

    // 1. Flip the booking to confirmed — ONLY from pending. Save the payment
    //    intent id so the webhook's idempotency check won't double-process.
    const { data: claimedRow, error: bookErr } = await admin
      .from('bookings')
      .update({
        status: 'confirmed',
        stripe_payment_intent_id: paymentIntentId,
        amount_pence: amountPence,
        charge_error: null,
      })
      .eq('id', bookingId)
      .eq('status', 'pending')
      .select(BOOKING_SELECT)
      .maybeSingle()
    if (bookErr) {
      console.error('[event-sync] failed to update booking', bookErr)
      return NextResponse.json({ error: 'Could not update booking.' }, { status: 500 })
    }

    let booking = claimedRow as unknown as BookingRow | null
    let orphan = false
    if (!booking) {
      const { data: currentRow } = await admin
        .from('bookings')
        .select(BOOKING_SELECT)
        .eq('id', bookingId)
        .maybeSingle()
      const current = currentRow as unknown as BookingRow | null
      if (current && current.status === 'confirmed' && current.stripe_payment_intent_id === paymentIntentId) {
        // Already processed (webhook or an earlier sync) — idempotent no-op.
        return NextResponse.json({
          ok: true,
          booking_id: current.id,
          payment_inserted: false,
          is_guest: current.is_guest,
          amount_pence: amountPence,
        })
      }
      // Paid, but the booking was removed / cancelled / already paid by a
      // different payment. Record the money and flag it for refund — never
      // resurrect the booking.
      orphan = true
      booking = current
    }

    const eventTitle = booking?.events?.title ?? null

    // 2. Insert a payment row — for members AND guests. payments.member_id
    //    is nullable (see 20260617_guest_payments_ledger), so guest
    //    bookings get a proper ledger row too (member_id null, admin-only
    //    under RLS). Idempotent on the payment intent.
    let paymentInserted = false
    {
      const { data: existing } = await admin
        .from('payments')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .limit(1)
      if (!existing?.length) {
        await admin.from('payments').insert({
          member_id: booking?.member_id ?? null,
          amount_pence: amountPence,
          currency: 'GBP',
          payment_type: 'event_booking',
          payment_method: 'stripe',
          status: 'paid',
          paid_at: paidAt,
          stripe_payment_intent_id: paymentIntentId,
          reference_id: booking?.id ?? bookingId,
          description: orphan
            ? `REFUND NEEDED — payment for booking ${bookingId} which is ${booking ? booking.status : 'no longer on file'} (${eventTitle ?? 'event'})`
            : booking?.member_id
              ? eventTitle
                ? `Event booking — ${eventTitle}`
                : 'Event booking'
              : `Event booking — ${eventTitle ?? 'event'} (guest${booking?.guest_name ? `: ${booking.guest_name}` : ''})`,
        })
        paymentInserted = true
      }
    }

    if (orphan) {
      if (paymentInserted) {
        await notifyAdmins(admin, {
          subject: 'Payment received for an inactive booking — refund needed',
          heading: 'A payment needs refunding.',
          paragraphs: [
            `Stripe payment <strong style="color:#2C2825;">${escapeHtml(paymentIntentId ?? '')}</strong> (£${(amountPence / 100).toFixed(2)}) was made for booking ${escapeHtml(bookingId)}, which is ${escapeHtml(booking ? booking.status : 'no longer on file')}.`,
            `The booking was not reinstated. Please refund the payment in Stripe or rebook the attendee.`,
          ],
          ctaUrl: `${site}/dashboard/bookings`,
          ctaLabel: 'View bookings',
        })
      }
      return NextResponse.json(
        { ok: false, error: 'This booking is no longer active. The team has been notified.' },
        { status: 409 },
      )
    }

    // 3. Admin alert + confirmation email — once, by whoever won the
    //    pending → confirmed transition above.
    const b = booking as BookingRow
    await tellAdmins(b, 'Payment has been received and the booking is confirmed.')
    const r = recipientOf(b)
    if (r.email) {
      await sendBookingConfirmationEmail({
        to: r.email,
        firstName: r.firstName,
        eventId: b.events?.id ?? '',
        eventTitle,
        startDate: b.events?.start_date,
        venueName: b.events?.venue_name,
        amountPence,
        kind: 'charged',
        isGuest: b.is_guest,
        memberId: b.member_id,
      })
    }

    return NextResponse.json({
      ok: true,
      booking_id: b.id,
      payment_inserted: paymentInserted,
      is_guest: b.is_guest,
      amount_pence: amountPence,
    })
  } catch (e) {
    console.error('[event-sync] unhandled error:', e)
    return NextResponse.json({ error: 'Could not sync booking.' }, { status: 500 })
  }
}
