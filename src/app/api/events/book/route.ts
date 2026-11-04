// POST /api/events/book
//
// MEMBER event booking. Unlike guests, members already have a card on file
// (saved when they joined), so we never bounce them to Stripe to re-type it:
//
//   • free (£0) ticket                 → no Stripe at all; booking = confirmed
//                                        (auto-confirm) or pending (approval).
//   • auto-confirm ON  + card on file → charge the saved card off-session now,
//                                        booking = confirmed.
//   • auto-confirm OFF + card on file → booking = pending, NO charge; the team
//                                        charges the held card on approval.
//   • no usable card (or the saved card is declined/expired) → fall back to
//     Stripe Checkout to collect a card (charge if auto-confirm, else hold).
//
// The booking row is pre-created here with status pending; the off-session
// path flips it to confirmed, and the Checkout fallback is finalised by
// /api/events/sync on the confirmation page (or the stripe-webhook). A
// Checkout booking is tagged AWAITING_CHECKOUT and released automatically if
// the member never completes Checkout (see src/lib/stripe/server-helpers.ts).
//
// Capacity and one-booking-per-member are enforced atomically by the bookings
// BEFORE INSERT trigger (DUPLICATE_BOOKING / EVENT_FULL → 409); the checks
// below are the friendly pre-checks.
//
// Body: { event_id, bring_guest?, guest_name?, add_accommodation? }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { excludeDirectDebitFromInstantCheckout } from '@/lib/billing/direct-debit'
import { notifyAdmins } from '@/lib/email/admin-notify'
import {
  AWAITING_CHECKOUT,
  bookingDbError,
  checkoutExpiresAt,
  cleanText,
  escapeHtml,
  getSiteUrl,
  releaseAbandonedCheckouts,
  seatsTaken,
} from '@/lib/stripe/server-helpers'
import { sendBookingConfirmationEmail } from '@/lib/stripe/booking-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BookBody {
  event_id?: string
  bring_guest?: boolean
  guest_name?: string
  add_accommodation?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as BookBody
    if (!body.event_id || typeof body.event_id !== 'string' || !UUID_RE.test(body.event_id)) {
      return NextResponse.json({ error: 'event_id is required.' }, { status: 400 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Member for this user.
    const { data: member } = await admin
      .from('members')
      .select('id, stripe_customer_id, membership_status, deleted_at, profiles:profile_id(first_name, email)')
      .eq('profile_id', user.id)
      .maybeSingle()
    if (!member || member.deleted_at) {
      return NextResponse.json({ error: 'No member account found.' }, { status: 403 })
    }
    // Member prices are for members in good standing only.
    if (member.membership_status !== 'active') {
      return NextResponse.json(
        { error: 'Your membership is not active, so member booking is unavailable. Please contact the team.' },
        { status: 403 },
      )
    }
    const profileRaw = member.profiles as unknown as
      | { first_name: string | null; email: string | null }
      | { first_name: string | null; email: string | null }[]
      | null
    const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
    const memberEmail = profile?.email ?? user.email ?? null

    // Event.
    const { data: event } = await admin
      .from('events')
      .select(
        'id, slug, title, status, start_date, venue_name, member_price_pence, guest_price_pence, sponsor_price_pence, accommodation_available, accommodation_price_pence, capacity, auto_confirm',
      )
      .eq('id', body.event_id)
      .maybeSingle()
    if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    if (!['published', 'live'].includes(event.status)) {
      return NextResponse.json({ error: 'This event is not open for bookings.' }, { status: 400 })
    }
    if (!event.start_date || new Date(event.start_date) < new Date()) {
      return NextResponse.json({ error: 'This event has already taken place.' }, { status: 400 })
    }

    // Free seats held by Checkouts that were never completed.
    await releaseAbandonedCheckouts(admin, event.id)

    // Existing-booking guard. A pending booking still waiting on Stripe
    // Checkout (abandoned / cancelled / card declined) is REUSED rather than
    // blocking the member from trying again.
    const { data: existingRows } = await admin
      .from('bookings')
      .select('id, status, charge_error')
      .eq('event_id', event.id)
      .eq('member_id', member.id)
      .in('status', ['confirmed', 'pending'])
      .order('created_at', { ascending: true })
      .limit(5)
    const existing = existingRows ?? []
    const reusable =
      existing.length === 1 &&
      existing[0].status === 'pending' &&
      existing[0].charge_error === AWAITING_CHECKOUT
        ? existing[0]
        : null
    if (existing.length > 0 && !reusable) {
      return NextResponse.json(
        { error: 'You already have a booking for this event.' },
        { status: 409 },
      )
    }

    // Is this member a sponsor of this event? If so, their ticket is the
    // negotiated sponsor rate (event_price_pence, falling back to the event's
    // sponsor price) instead of the standard member rate, and the booking is
    // attributed to the sponsorship.
    const { data: sponsorRows } = await admin
      .from('sponsorships')
      .select('id, event_price_pence, package_name, status')
      .eq('event_id', event.id)
      .eq('member_id', member.id)
      .neq('status', 'declined')
      .limit(1)
    const sponsorship = sponsorRows?.[0] ?? null
    const sponsorRate = sponsorship
      ? (sponsorship.event_price_pence ?? event.sponsor_price_pence ?? 0)
      : 0
    const ticketPrice =
      sponsorship && sponsorRate > 0 ? sponsorRate : (event.member_price_pence ?? 0)

    // Amount = ticket (member or sponsor) + optional guest + optional accommodation.
    const wantsGuest = body.bring_guest === true && (event.guest_price_pence ?? 0) > 0
    const guestName = wantsGuest ? cleanText(body.guest_name, 200) : null
    if (wantsGuest && !guestName) {
      return NextResponse.json({ error: "Please enter your guest's name." }, { status: 400 })
    }
    const wantsAccommodation =
      body.add_accommodation === true &&
      event.accommodation_available === true &&
      (event.accommodation_price_pence ?? 0) > 0
    const amount =
      ticketPrice +
      (wantsGuest ? (event.guest_price_pence ?? 0) : 0) +
      (wantsAccommodation ? (event.accommodation_price_pence ?? 0) : 0)

    // Capacity pre-check (seats = booker + guests). The trigger is the
    // authoritative, race-free check.
    if (event.capacity != null) {
      const taken = await seatsTaken(admin, event.id, { excludeBookingId: reusable?.id })
      if (taken + 1 + (wantsGuest ? 1 : 0) > event.capacity) {
        return NextResponse.json({ error: 'This event is fully booked.' }, { status: 409 })
      }
    }

    const autoConfirm = event.auto_confirm !== false
    const isFree = amount <= 0

    // Pre-create the booking (pending). The off-session path confirms it;
    // the Checkout fallback is finalised by /api/events/sync. Free bookings
    // are created in their final state straight away.
    const bookingFields = {
      event_id: event.id,
      member_id: member.id,
      is_guest: false,
      status: isFree && autoConfirm ? 'confirmed' : 'pending',
      payment_method: isFree ? null : 'stripe',
      amount_pence: amount,
      guests_invited: wantsGuest ? 1 : 0,
      guest_name: guestName,
      accommodation_booked: wantsAccommodation,
      stripe_customer_id: member.stripe_customer_id ?? null,
      sponsorship_id: sponsorship?.id ?? null,
      sponsor_package: sponsorship?.package_name ?? null,
      charge_error: null as string | null,
    }
    let bookingId: string
    if (reusable) {
      const { data: upd, error: updErr } = await admin
        .from('bookings')
        .update(bookingFields)
        .eq('id', reusable.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (updErr || !upd) {
        return NextResponse.json(
          { error: 'You already have a booking for this event.' },
          { status: 409 },
        )
      }
      bookingId = upd.id
    } else {
      const { data: ins, error: bookErr } = await admin
        .from('bookings')
        .insert(bookingFields)
        .select('id')
        .single()
      if (bookErr || !ins) {
        const mapped = bookingDbError(bookErr)
        if (mapped) return NextResponse.json({ error: mapped.error }, { status: mapped.status })
        console.error('[events/book] insert failed', bookErr)
        return NextResponse.json({ error: 'Could not create booking.' }, { status: 500 })
      }
      bookingId = ins.id
    }

    // If this member was on the event's invite list, flip their invite to
    // confirmed and link the booking (powers the Invited-vs-Confirmed views).
    // Reverted automatically if an abandoned Checkout booking is released.
    {
      const inviteMatch = user.email
        ? `invitee_email.ilike.${user.email},member_id.eq.${member.id}`
        : `member_id.eq.${member.id}`
      await admin
        .from('event_invitations')
        .update({
          status: 'confirmed',
          booking_id: bookingId,
          responded_at: new Date().toISOString(),
        })
        .eq('event_id', event.id)
        .eq('status', 'invited')
        .or(inviteMatch)
    }

    const site = getSiteUrl()
    const safeTitle = escapeHtml(event.title)
    const extras = `${wantsAccommodation ? ' (with accommodation)' : ''}${wantsGuest ? ' and is bringing a guest' : ''}`
    const tellAdmins = (line: string) =>
      notifyAdmins(admin, {
        subject: `New member booking — ${event.title}`,
        heading: 'A member has booked an event.',
        paragraphs: [
          `A member booked <strong style="color:#2C2825;">${safeTitle}</strong>${extras}.`,
          line,
        ],
        ctaUrl: `${site}/dashboard/bookings`,
        ctaLabel: 'View bookings',
      })

    // ── Free / complimentary ticket — no Stripe ──────────────────────
    if (isFree) {
      await tellAdmins(
        autoConfirm
          ? 'It is a complimentary place and is confirmed.'
          : 'It is a complimentary place awaiting your approval in the dashboard.',
      )
      if (memberEmail) {
        await sendBookingConfirmationEmail({
          to: memberEmail,
          firstName: profile?.first_name,
          eventId: event.id,
          eventTitle: event.title,
          startDate: event.start_date,
          venueName: event.venue_name,
          amountPence: 0,
          kind: autoConfirm ? 'free' : 'free_pending',
          memberId: member.id,
        })
      }
      return NextResponse.json({
        ok: true,
        booking_id: bookingId,
        status: autoConfirm ? 'confirmed' : 'pending',
      })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })

    // Does the member have a usable saved card?
    let defaultPm: string | null = null
    if (member.stripe_customer_id) {
      try {
        const customer = await stripe.customers.retrieve(member.stripe_customer_id)
        if (customer && !customer.deleted) {
          const dpm = customer.invoice_settings?.default_payment_method
          defaultPm = typeof dpm === 'string' ? dpm : (dpm?.id ?? null)
        }
      } catch {
        defaultPm = null
      }
    }

    // ── Card on file ────────────────────────────────────────────────
    if (defaultPm && member.stripe_customer_id) {
      if (!autoConfirm) {
        // Hold: no charge now; the team charges the saved card on approval.
        await tellAdmins('Their request is pending — approve it in the dashboard to charge their saved card.')
        if (memberEmail) {
          await sendBookingConfirmationEmail({
            to: memberEmail,
            firstName: profile?.first_name,
            eventId: event.id,
            eventTitle: event.title,
            startDate: event.start_date,
            venueName: event.venue_name,
            amountPence: amount,
            kind: 'held',
            memberId: member.id,
          })
        }
        return NextResponse.json({ ok: true, booking_id: bookingId, status: 'pending' })
      }
      // Auto-confirm: charge the saved card off-session right now. The
      // idempotency key makes a retried / duplicated request return the same
      // PaymentIntent instead of charging twice.
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount,
            currency: 'gbp',
            customer: member.stripe_customer_id,
            payment_method: defaultPm,
            off_session: true,
            confirm: true,
            metadata: { booking_id: bookingId, event_id: event.id, member_id: member.id },
          },
          { idempotencyKey: `event-book-${bookingId}-${defaultPm}-${amount}` },
        )
        if (pi.status === 'succeeded') {
          const { data: claimed } = await admin
            .from('bookings')
            .update({ status: 'confirmed', stripe_payment_intent_id: pi.id, charge_error: null })
            .eq('id', bookingId)
            .eq('status', 'pending')
            .select('id')
            .maybeSingle()
          // Member-scoped payment row so Finance sees it (once).
          const { data: existingPay } = await admin
            .from('payments')
            .select('id')
            .eq('stripe_payment_intent_id', pi.id)
            .limit(1)
          if (!existingPay?.length) {
            await admin.from('payments').insert({
              member_id: member.id,
              amount_pence: amount,
              currency: 'GBP',
              payment_type: 'event_booking',
              payment_method: 'stripe',
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: pi.id,
              reference_id: bookingId,
              description: `Event booking — ${event.title}`,
            })
          }
          if (claimed) {
            await tellAdmins('It has been charged to their card on file and is confirmed.')
            if (memberEmail) {
              await sendBookingConfirmationEmail({
                to: memberEmail,
                firstName: profile?.first_name,
                eventId: event.id,
                eventTitle: event.title,
                startDate: event.start_date,
                venueName: event.venue_name,
                amountPence: amount,
                kind: 'charged',
                memberId: member.id,
              })
            }
          }
          return NextResponse.json({ ok: true, booking_id: bookingId, status: 'confirmed' })
        }
        // Needs action / not succeeded → fall through to Checkout collection.
      } catch {
        // Card declined / expired (#6) → fall through to collect a fresh card.
      }
    }

    // ── Fallback: collect a card via Stripe Checkout ────────────────
    // Links come from the fixed site URL, never request headers.
    const success_url = `${site}/portal/events/${event.id}/confirmation?session_id={CHECKOUT_SESSION_ID}&booking_id=${bookingId}`
    const cancel_url = `${site}/portal/events/${event.id}`
    const metadata = { booking_id: bookingId, event_id: event.id, member_id: member.id }

    // Tag the booking as awaiting Checkout so an abandoned session releases
    // the seat (and lets the member try again).
    await admin.from('bookings').update({ charge_error: AWAITING_CHECKOUT }).eq('id', bookingId)

    let session: Stripe.Checkout.Session
    try {
      session = autoConfirm
        ? await stripe.checkout.sessions.create({
            // Keep instant event checkouts off Bacs Direct Debit (no-op unless
            // Direct Debit is enabled) — see src/lib/billing/direct-debit.ts.
            ...excludeDirectDebitFromInstantCheckout(),
            mode: 'payment',
            ...(member.stripe_customer_id
              ? { customer: member.stripe_customer_id }
              : { customer_email: memberEmail ?? undefined }),
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: 'gbp',
                  unit_amount: amount,
                  product_data: { name: event.title },
                },
              },
            ],
            metadata,
            payment_intent_data: { metadata },
            expires_at: checkoutExpiresAt(),
            success_url,
            cancel_url,
          })
        : await stripe.checkout.sessions.create({
            // Keep instant event checkouts off Bacs Direct Debit (no-op unless
            // Direct Debit is enabled) — see src/lib/billing/direct-debit.ts.
            ...excludeDirectDebitFromInstantCheckout(),
            mode: 'setup',
            // Setup-mode Checkout requires a currency when payment methods
            // are chosen dynamically ("Missing required param: currency").
            currency: 'gbp',
            ...(member.stripe_customer_id
              ? { customer: member.stripe_customer_id }
              : { customer_email: memberEmail ?? undefined }),
            metadata,
            setup_intent_data: { metadata },
            expires_at: checkoutExpiresAt(),
            success_url,
            cancel_url,
          })
    } catch (e) {
      // Don't leave a reserved seat behind if Stripe refused the session.
      await admin
        .from('bookings')
        .update({ status: 'cancelled', charge_error: 'Checkout could not be opened.' })
        .eq('id', bookingId)
        .eq('status', 'pending')
      await admin
        .from('event_invitations')
        .update({ status: 'invited', booking_id: null, responded_at: null })
        .eq('booking_id', bookingId)
      console.error('[events/book] checkout create failed', e)
      return NextResponse.json({ error: 'Could not open checkout. Please try again.' }, { status: 502 })
    }

    if (!session.url) {
      return NextResponse.json({ error: 'Could not open checkout.' }, { status: 500 })
    }
    // Admins are told once Checkout completes (/api/events/sync or webhook).
    return NextResponse.json({ url: session.url, hold: !autoConfirm })
  } catch (e) {
    console.error('[events/book] error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
