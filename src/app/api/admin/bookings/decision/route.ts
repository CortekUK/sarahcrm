// POST /api/admin/bookings/decision  { booking_id, action: 'approve' | 'reject' }
//
// Approve or reject a PENDING event booking whose card was held (Stripe
// setup) rather than charged. Approve charges the held card off-session and
// confirms the booking; reject cancels it and releases the saved card so
// nothing is taken. Used for non-auto-confirm events (guest + member).
//
// Concurrency: the decision first CLAIMS the booking with a conditional
// update (pending + not already being processed → PROCESSING marker in
// charge_error). Two tabs / double clicks can't both get past it, and the
// Stripe charge also carries an idempotency key, so a booking is charged at
// most once. The marker is cleared on success or replaced with the error.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { renderClubEmail, sendClubEmail } from '@/lib/email/club-email'
import { AWAITING_CHECKOUT, escapeHtml, seatsTaken } from '@/lib/stripe/server-helpers'
import { sendBookingConfirmationEmail } from '@/lib/stripe/booking-email'

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

const PROCESSING = 'PROCESSING_DECISION'
// A claim older than this is treated as stale (crashed request) and can be
// re-taken.
const CLAIM_STALE_MS = 5 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    const body = (await req.json().catch(() => ({}))) as {
      booking_id?: string
      action?: string
    }
    if (!body.booking_id || !body.action) {
      return Response.json({ error: 'booking_id and action are required.' }, { status: 400 })
    }
    // Only these two actions exist — anything else must never fall through
    // to "approve" (which charges the card).
    if (body.action !== 'approve' && body.action !== 'reject') {
      return Response.json({ error: "action must be 'approve' or 'reject'." }, { status: 400 })
    }
    if (typeof body.booking_id !== 'string' || !UUID_RE.test(body.booking_id)) {
      return Response.json({ error: 'Booking not found.' }, { status: 404 })
    }
    const action = body.action

    const admin = getAdminDb()
    const { data: booking } = await admin
      .from('bookings')
      .select(
        'id, status, amount_pence, member_id, is_guest, guest_name, guest_email, guests_invited, stripe_customer_id, stripe_payment_method_id, event_id, charge_error, events(id, title, status, start_date, venue_name, capacity), members(id, stripe_customer_id, profiles(first_name, email))',
      )
      .eq('id', body.booking_id)
      .maybeSingle()
    if (!booking) return Response.json({ error: 'Booking not found.' }, { status: 404 })
    if (booking.status !== 'pending') {
      return Response.json({ error: 'Only pending bookings can be decided.' }, { status: 400 })
    }

    // Resolve recipient + event.
    const ev = booking.events as unknown as {
      id: string
      title: string | null
      status: string | null
      start_date: string | null
      venue_name: string | null
      capacity: number | null
    } | null
    const memberRel = booking.members as unknown as {
      stripe_customer_id: string | null
      profiles: { first_name: string | null; email: string | null } | null
    } | null
    const recipientEmail = booking.is_guest
      ? booking.guest_email
      : memberRel?.profiles?.email ?? null
    const firstName = booking.is_guest
      ? booking.guest_name || 'there'
      : memberRel?.profiles?.first_name || 'there'
    const eventTitle = ev?.title || 'the event'

    // Approval guards — before claiming or touching Stripe.
    if (action === 'approve') {
      // The booker is still on the Stripe payment page — it confirms itself
      // when they pay (or is released). The UI hides Approve; enforce it here.
      if (booking.charge_error === AWAITING_CHECKOUT) {
        return Response.json(
          { error: 'This booking is awaiting payment on Stripe — it confirms itself once paid.' },
          { status: 409 },
        )
      }
      if (!ev || !['published', 'live'].includes(ev.status ?? '')) {
        return Response.json(
          { error: 'This event is not open (cancelled, draft or completed) — the booking cannot be approved.' },
          { status: 409 },
        )
      }
      if (ev.start_date && new Date(ev.start_date) < new Date()) {
        return Response.json({ error: 'This event has already taken place.' }, { status: 409 })
      }
      if (ev.capacity != null) {
        const confirmedSeats = await seatsTaken(admin, booking.event_id, {
          statuses: ['confirmed'],
          excludeBookingId: booking.id,
        })
        if (confirmedSeats + 1 + (booking.guests_invited ?? 0) > ev.capacity) {
          return Response.json(
            { error: 'The event is already at capacity — approving would overbook it.' },
            { status: 409 },
          )
        }
      }
    }

    // ── Atomic claim ────────────────────────────────────────────────
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString()
    const { data: claim } = await admin
      .from('bookings')
      .update({ charge_error: PROCESSING })
      .eq('id', booking.id)
      .eq('status', 'pending')
      .or(`charge_error.is.null,charge_error.neq.${PROCESSING},updated_at.lt.${staleBefore}`)
      .select('id')
      .maybeSingle()
    if (!claim) {
      return Response.json(
        { error: 'This booking is already being processed. Refresh to see its current status.' },
        { status: 409 },
      )
    }
    const release = (msg: string | null) =>
      admin
        .from('bookings')
        .update({ charge_error: msg })
        .eq('id', booking.id)
        .eq('charge_error', PROCESSING)

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })

    // ── REJECT ──────────────────────────────────────────────────────
    if (action === 'reject') {
      // Release a guest's held card so nothing can be taken. A member's
      // card is their membership payment method — never detach it.
      const detachCard = booking.is_guest && !booking.member_id && !!booking.stripe_payment_method_id
      if (detachCard) {
        try {
          await stripe.paymentMethods.detach(booking.stripe_payment_method_id!)
        } catch {
          /* already detached / not critical */
        }
      }
      await admin
        .from('bookings')
        .update({ status: 'cancelled', charge_error: null })
        .eq('id', booking.id)
        .eq('status', 'pending')

      if (recipientEmail) {
        const title = escapeHtml(eventTitle)
        const html = renderClubEmail({
          eyebrow: 'Your booking',
          heading: `An update on ${title}`,
          paragraphs: [
            `Hello ${escapeHtml(firstName)},`,
            `Thank you for your interest in <strong style="color:#2C2825;">${title}</strong>. On this occasion we're unable to confirm your place, and <strong style="color:#2C2825;">no payment has been taken</strong>${detachCard ? ' — the card you provided has been removed' : ''}.`,
            `We hope to welcome you to a future gathering.`,
          ],
        })
        await sendClubEmail({ to: recipientEmail, subject: `An update on ${eventTitle}`, html })
      }
      return Response.json({ ok: true, status: 'cancelled' })
    }

    // ── APPROVE (charge the held card) ──────────────────────────────
    const amount = booking.amount_pence ?? 0
    const customerId = booking.stripe_customer_id || memberRel?.stripe_customer_id || null

    // Free booking — confirm without charging.
    if (amount <= 0) {
      await admin
        .from('bookings')
        .update({ status: 'confirmed', charge_error: null })
        .eq('id', booking.id)
        .eq('status', 'pending')
      if (recipientEmail && ev) {
        await sendBookingConfirmationEmail({
          to: recipientEmail,
          firstName,
          eventId: ev.id,
          eventTitle: ev.title,
          startDate: ev.start_date,
          venueName: ev.venue_name,
          amountPence: 0,
          kind: 'free',
          isGuest: booking.is_guest,
          memberId: booking.member_id,
        })
      }
      return Response.json({ ok: true, status: 'confirmed', charged: false })
    }

    if (!customerId) {
      await release('No saved card on this booking to charge.')
      return Response.json(
        { error: 'No saved card on this booking to charge.' },
        { status: 400 },
      )
    }

    // Prefer the card saved on the booking; otherwise the customer's default.
    let paymentMethodId = booking.stripe_payment_method_id
    if (!paymentMethodId) {
      try {
        const customer = await stripe.customers.retrieve(customerId)
        if (customer && !customer.deleted) {
          const dpm = customer.invoice_settings?.default_payment_method
          paymentMethodId = typeof dpm === 'string' ? dpm : (dpm?.id ?? null)
        }
      } catch {
        paymentMethodId = null
      }
    }
    if (!paymentMethodId) {
      await release('No usable saved card.')
      return Response.json(
        { error: 'No usable saved card — ask them to add a card and try again.' },
        { status: 400 },
      )
    }

    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount,
          currency: 'gbp',
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          metadata: {
            booking_id: booking.id,
            event_id: booking.event_id,
            ...(booking.member_id ? { member_id: booking.member_id } : {}),
          },
        },
        // Same booking + card + amount → same PaymentIntent, never a second
        // charge. A new card produces a new key, so a declined card can be
        // retried once the card is updated.
        { idempotencyKey: `booking-approve-${booking.id}-${paymentMethodId}-${amount}` },
      )
      if (pi.status !== 'succeeded') {
        await release(`Charge not completed (${pi.status}).`)
        return Response.json(
          { error: `Charge could not be completed (${pi.status}).` },
          { status: 402 },
        )
      }

      await admin
        .from('bookings')
        .update({ status: 'confirmed', stripe_payment_intent_id: pi.id, charge_error: null })
        .eq('id', booking.id)
        .eq('status', 'pending')

      // Ledger payment row — members AND guests (payments.member_id is
      // nullable; guest rows are admin-only under RLS). Idempotent on the
      // payment intent.
      {
        const { data: existingPay } = await admin
          .from('payments')
          .select('id')
          .eq('stripe_payment_intent_id', pi.id)
          .limit(1)
        if (!existingPay?.length) {
          await admin.from('payments').insert({
            member_id: booking.member_id ?? null,
            amount_pence: amount,
            currency: 'GBP',
            payment_type: 'event_booking',
            payment_method: 'stripe',
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: pi.id,
            reference_id: booking.id,
            description: booking.member_id
              ? `Event booking — ${eventTitle}`
              : `Event booking — ${eventTitle} (guest${booking.guest_name ? `: ${booking.guest_name}` : ''})`,
          })
        }
      }

      if (recipientEmail && ev) {
        await sendBookingConfirmationEmail({
          to: recipientEmail,
          firstName,
          eventId: ev.id,
          eventTitle: ev.title,
          startDate: ev.start_date,
          venueName: ev.venue_name,
          amountPence: amount,
          kind: 'charged',
          isGuest: booking.is_guest,
          memberId: booking.member_id,
        })
      }

      return Response.json({ ok: true, status: 'confirmed', charged: true })
    } catch (e) {
      // Expired / declined held card — surface so the team can ask for a
      // fresh card.
      const msg = e instanceof Error ? e.message : 'Card could not be charged.'
      await release(msg)
      return Response.json(
        { error: `Card declined — ${msg}. Ask the guest/member to update their card.` },
        { status: 402 },
      )
    }
  } catch (e) {
    console.error('[bookings/decision] error', e)
    return Response.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}
