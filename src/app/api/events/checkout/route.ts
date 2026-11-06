import { NextRequest, NextResponse } from 'next/server'
import { withEventVat } from '@/lib/events/vat'
import { createClient } from '@supabase/supabase-js'
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
  isValidEmail,
  releaseAbandonedCheckouts,
  seatsTaken,
} from '@/lib/stripe/server-helpers'
import { sendBookingConfirmationEmail } from '@/lib/stripe/booking-email'

// POST /api/events/checkout
//
// Public event booking — guests can book without a membership. Flow:
//   1. Validate event exists + is bookable (status published/live, in the future, capacity).
//   2. Insert a `bookings` row with is_guest=true and guest_name / guest_email / guest_company.
//   3. Create a Stripe Customer for the email + a one-off Checkout Session
//      using inline price_data (no Stripe Price IDs needed).
//   4. Return the Stripe URL — client redirects.
//
// Members should book through the portal instead (different code path with
// the member_price_pence rate). This route handles the guest-rate flow.
//
// Capacity and one-booking-per-email are enforced atomically by the bookings
// BEFORE INSERT trigger (DUPLICATE_BOOKING / EVENT_FULL → 409). A booking
// sent to Checkout is tagged AWAITING_CHECKOUT and released if Checkout is
// never completed (src/lib/stripe/server-helpers.ts).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CheckoutBody {
  event_id?: string
  guest_name?: string
  guest_email?: string
  guest_company?: string | null
  dietary_requirements?: string | null
  special_requests?: string | null
  add_accommodation?: boolean
  // When booking through a sponsor's personalised link, the token that
  // identifies which sponsorship (and therefore which negotiated price).
  sponsor_token?: string | null
}

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json().catch(() => null)) as CheckoutBody | null
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    // Normalise + bound every free-text field (control chars / NUL would
    // otherwise surface as a 500 from Postgres).
    const body = {
      ...raw,
      guest_name: cleanText(raw.guest_name, 200) ?? '',
      guest_email: (cleanText(raw.guest_email, 254) ?? '').toLowerCase(),
      guest_company: cleanText(raw.guest_company, 200),
      dietary_requirements: cleanText(raw.dietary_requirements, 1000),
      special_requests: cleanText(raw.special_requests, 2000),
      sponsor_token: cleanText(raw.sponsor_token, 200),
    }

    if (!body.event_id || !body.guest_name || !body.guest_email) {
      return NextResponse.json(
        { error: 'Missing required fields (event, name, email).' },
        { status: 400 },
      )
    }
    if (typeof body.event_id !== 'string' || !UUID_RE.test(body.event_id)) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }
    if (!isValidEmail(body.guest_email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // ── Validate event ─────────────────────────────────────────────
    const { data: event, error: eventErr } = await admin
      .from('events')
      .select(
        'id, slug, title, status, start_date, guest_price_pence, member_price_pence, sponsor_price_pence, capacity, guest_ticket_capacity, venue_name, venue_city, auto_confirm, accommodation_available, accommodation_price_pence, vat_mode, vat_rate, visibility, booking_status',
      )
      .eq('id', body.event_id)
      .maybeSingle()

    if (eventErr || !event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }

    if (!['published', 'live'].includes(event.status)) {
      return NextResponse.json({ error: 'This event is not open for bookings.' }, { status: 400 })
    }
    // Guests can only buy public, open events directly; members-only and
    // invitation/waitlist/sold-out events go through a request (a sponsor's
    // personal link is the one exception).
    if (!body.sponsor_token) {
      if ((event.visibility ?? 'public') !== 'public') {
        return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
      }
      if ((event.booking_status ?? 'open') !== 'open') {
        return NextResponse.json(
          { error: 'This event isn’t open for direct booking — please request an invitation instead.' },
          { status: 409 },
        )
      }
    }

    if (!event.start_date || new Date(event.start_date) < new Date()) {
      return NextResponse.json({ error: 'This event has already taken place.' }, { status: 400 })
    }

    const guestPrice = event.guest_price_pence ?? 0
    // A free event (no member price and no guest price) is bookable by
    // guests at £0 without going through Stripe.
    const isFreeEvent = guestPrice <= 0 && (event.member_price_pence ?? 0) <= 0

    // ── Sponsor invite (optional) ──────────────────────────────────
    // A booking can arrive through a sponsor's personalised link. The
    // sponsor pays their own negotiated ticket price (event_price_pence,
    // falling back to the event-level sponsor rate), the booking is
    // attributed to the sponsorship, and the guest sub-cap is skipped
    // (they're invited, not a walk-up guest).
    let sponsorship: { id: string; package_name: string; member_id: string | null } | null = null
    let basePrice = guestPrice
    if (body.sponsor_token) {
      const { data: sp } = await admin
        .from('sponsorships')
        .select('id, event_id, event_price_pence, package_name, status, member_id')
        .eq('booking_token', body.sponsor_token)
        .maybeSingle()
      if (!sp || sp.event_id !== event.id) {
        return NextResponse.json(
          { error: 'This sponsor link is not valid for this event.' },
          { status: 400 },
        )
      }
      if (sp.status === 'declined') {
        return NextResponse.json(
          { error: 'This sponsor invitation is no longer active.' },
          { status: 400 },
        )
      }
      const sponsorPrice = sp.event_price_pence ?? event.sponsor_price_pence ?? 0
      if (sponsorPrice <= 0) {
        return NextResponse.json(
          { error: 'No sponsor rate has been set for this event.' },
          { status: 400 },
        )
      }
      // One booking per sponsor link: the link can't be reused by anyone
      // else at the sponsor rate. (A pending booking still awaiting Checkout
      // under the same email is reused below, so retries still work.)
      await releaseAbandonedCheckouts(admin, event.id)
      const { data: spBookings } = await admin
        .from('bookings')
        .select('id, guest_email, status, charge_error')
        .eq('sponsorship_id', sp.id)
        .in('status', ['confirmed', 'pending'])
      const others = (spBookings ?? []).filter(
        (b: { guest_email: string | null; status: string; charge_error: string | null }) =>
          !(
            b.status === 'pending' &&
            b.charge_error === AWAITING_CHECKOUT &&
            (b.guest_email ?? '').toLowerCase() === body.guest_email
          ),
      )
      if (others.length > 0) {
        return NextResponse.json(
          { error: 'This sponsor link has already been used to book. Please contact the team.' },
          { status: 409 },
        )
      }
      sponsorship = { id: sp.id, package_name: sp.package_name, member_id: sp.member_id ?? null }
      basePrice = sponsorPrice
    } else if (guestPrice <= 0 && !isFreeEvent) {
      return NextResponse.json(
        { error: 'This event does not have a guest rate.' },
        { status: 400 },
      )
    }

    // Free seats held by Checkouts that were never completed.
    await releaseAbandonedCheckouts(admin, event.id)

    // ── Existing member using the guest form ───────────────────────
    // Members book through the portal (member rate, one booking per
    // member). Without a sponsor link, refuse a member's email here so they
    // can't double-book themselves at the guest rate.
    let emailMemberId: string | null = null
    {
      const { data: prof } = await admin
        .from('profiles')
        .select('id')
        .ilike('email', body.guest_email)
        .limit(1)
      if (prof?.[0]) {
        const { data: m } = await admin
          .from('members')
          .select('id')
          .eq('profile_id', prof[0].id)
          .is('deleted_at', null)
          .limit(1)
        emailMemberId = m?.[0]?.id ?? null
      }
    }
    if (emailMemberId && !body.sponsor_token) {
      return NextResponse.json(
        { error: 'This email belongs to a member account — please sign in to book through the member portal.' },
        { status: 409 },
      )
    }

    // ── Capacity enforcement ───────────────────────────────────────
    // "Taken" = seats (booker + guests) on confirmed/pending bookings
    // (cancelled and refunded free their seat up). The bookings trigger
    // re-checks this atomically on insert.
    // The same person retrying after cancelling Stripe still has their own
    // unpaid hold (reused below) — don't count it against them, or the last
    // place reads as "full" for the very person holding it.
    const { data: ownHoldRows } = await admin
      .from('bookings')
      .select('id')
      .eq('event_id', event.id)
      .eq('status', 'pending')
      .eq('charge_error', AWAITING_CHECKOUT)
      .ilike('guest_email', body.guest_email)
      .limit(1)
    const ownHoldId: string | undefined = ownHoldRows?.[0]?.id
    if (event.capacity != null) {
      const taken = await seatsTaken(admin, event.id, { excludeBookingId: ownHoldId })
      if (taken + 1 > event.capacity) {
        return NextResponse.json({ error: 'This event is fully booked.' }, { status: 409 })
      }
    }
    // Guests have their own sub-cap (guest_ticket_capacity) on top of the
    // overall capacity — enforce it separately for the guest path. Sponsor
    // invites bypass this sub-cap (they're invited, not walk-up guests).
    if (!sponsorship && event.guest_ticket_capacity != null) {
      const guestCount = await seatsTaken(admin, event.id, { guestOnly: true, excludeBookingId: ownHoldId })
      if (guestCount + 1 > event.guest_ticket_capacity) {
        return NextResponse.json(
          { error: 'Guest places for this event are full.' },
          { status: 400 },
        )
      }
    }

    // Optional accommodation add-on — only when the event offers it.
    const accommodationPrice =
      event.accommodation_available && body.add_accommodation
        ? (event.accommodation_price_pence ?? 0)
        : 0
    const accommodationBooked = accommodationPrice > 0
    // Plus VAT on top when the event is set to add it (events.vat_mode).
    const price = withEventVat(basePrice + accommodationPrice, event)

    // If this is a sponsor booking AND the sponsor is (or matches) a member,
    // attribute the booking to that member so it appears in their portal. The
    // sponsorship is linked directly when the sponsor is a member; otherwise
    // we match the booking email to a member's profile.
    let linkedMemberId: string | null = null
    if (sponsorship) {
      if (sponsorship.member_id) {
        linkedMemberId = sponsorship.member_id
      } else {
        linkedMemberId = emailMemberId
      }
    }

    // When the event is NOT auto-confirm we HOLD the card (Stripe setup
    // mode) and charge only on admin approval — no money is taken now.
    // Auto-confirm events charge immediately.
    const holdOnly = event.auto_confirm === false

    // ── Duplicate guard ────────────────────────────────────────────
    // One active (confirmed/pending) booking per person per event — same
    // rule the member route enforces. We dedupe on the booking email, and
    // also on member_id when the booker resolves to a member (so a sponsor
    // link can't double up on a seat the member already holds).
    // A pending booking for the same email that is still awaiting Checkout
    // (abandoned / cancelled on Stripe / card declined) is REUSED instead of
    // refusing the retry.
    let dupQuery = admin
      .from('bookings')
      .select('id, status, charge_error, guest_email')
      .eq('event_id', event.id)
      .in('status', ['confirmed', 'pending'])
    dupQuery = linkedMemberId
      ? dupQuery.or(`guest_email.ilike.${body.guest_email},member_id.eq.${linkedMemberId}`)
      : dupQuery.ilike('guest_email', body.guest_email)
    const { data: dupRows } = await dupQuery.limit(5)
    const dups = dupRows ?? []
    const reusable =
      dups.length === 1 &&
      dups[0].status === 'pending' &&
      dups[0].charge_error === AWAITING_CHECKOUT
        ? dups[0]
        : null
    if (dups.length > 0 && !reusable) {
      return NextResponse.json(
        {
          error:
            'There is already a booking for this event under that email. Please check your inbox for the confirmation.',
        },
        { status: 409 },
      )
    }

    // ── Insert booking (pending — webhook flips to confirmed) ──────
    // payment_method is a postgres enum: stripe | gocardless | invoice
    // | manual. We're sending the user to Stripe Checkout, so 'stripe'
    // is the right value here — anything else (including 'card')
    // produces a 22P02 invalid_enum error and the whole insert fails.
    const isFree = price <= 0
    const bookingFields = {
      event_id: event.id,
      member_id: linkedMemberId,
      is_guest: linkedMemberId ? false : true,
      guest_name: body.guest_name,
      guest_email: body.guest_email,
      guest_company: body.guest_company || null,
      dietary_requirements: body.dietary_requirements || null,
      special_requests: body.special_requests || null,
      accommodation_booked: accommodationBooked,
      amount_pence: price,
      status: isFree && !holdOnly ? 'confirmed' : 'pending',
      payment_method: isFree ? null : 'stripe',
      sponsorship_id: sponsorship?.id ?? null,
      sponsor_package: sponsorship?.package_name ?? null,
      charge_error: isFree ? null : AWAITING_CHECKOUT,
    }
    const { data: booking, error: bookErr } = reusable
      ? await admin
          .from('bookings')
          .update(bookingFields)
          .eq('id', reusable.id)
          .eq('status', 'pending')
          .select('id')
          .single()
      : await admin.from('bookings').insert(bookingFields).select('id').single()

    if (bookErr || !booking) {
      const mapped = bookingDbError(bookErr)
      if (mapped) {
        return NextResponse.json(
          {
            error:
              mapped.error === 'There is already a booking for this event.'
                ? 'There is already a booking for this event under that email. Please check your inbox for the confirmation.'
                : mapped.error,
          },
          { status: mapped.status },
        )
      }
      console.error('booking insert failed', bookErr)
      // Surface the real DB error in dev so we don't have to debug
      // through "please try again" again — but keep production safe.
      const detail =
        process.env.NODE_ENV !== 'production' && bookErr
          ? `${bookErr.code ?? ''} ${bookErr.message}`.trim()
          : null
      return NextResponse.json(
        {
          error: detail
            ? `Could not reserve your seat: ${detail}`
            : 'Could not reserve your seat. Please try again.',
        },
        { status: 500 },
      )
    }

    // If this guest was on the event's invite list, flip their invite to
    // confirmed and link the booking (powers the Invited-vs-Confirmed views).
    {
      const inviteMatch = linkedMemberId
        ? `invitee_email.ilike.${body.guest_email},member_id.eq.${linkedMemberId}`
        : `invitee_email.ilike.${body.guest_email}`
      await admin
        .from('event_invitations')
        .update({
          status: 'confirmed',
          booking_id: booking.id,
          responded_at: new Date().toISOString(),
        })
        .eq('event_id', event.id)
        .eq('status', 'invited')
        .or(inviteMatch)
    }

    const site = getSiteUrl()

    // ── Free event — no Stripe ─────────────────────────────────────
    if (isFree) {
      await notifyAdmins(admin, {
        subject: `New guest booking — ${event.title}`,
        heading: 'A new guest booking has come in.',
        paragraphs: [
          `<strong style="color:#2C2825;">${escapeHtml(body.guest_name)}</strong> booked a complimentary place at <strong style="color:#2C2825;">${escapeHtml(event.title)}</strong>.`,
          holdOnly ? `It is awaiting your approval in the dashboard.` : `It is confirmed.`,
        ],
        ctaUrl: `${site}/dashboard/bookings`,
        ctaLabel: 'View bookings',
      })
      await sendBookingConfirmationEmail({
        to: body.guest_email,
        firstName: body.guest_name,
        eventId: event.id,
        eventTitle: event.title,
        startDate: event.start_date,
        venueName: event.venue_name,
        amountPence: 0,
        kind: holdOnly ? 'free_pending' : 'free',
        isGuest: true,
      })
      return NextResponse.json({
        ok: true,
        booking_id: booking.id,
        status: holdOnly ? 'pending' : 'confirmed',
        url: `${site}/events/${event.slug}/success?free=1${holdOnly ? '&pending=1' : ''}`,
      })
    }

    // ── Stripe Checkout Session ────────────────────────────────────
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })

    // Links come from the fixed site URL, never request headers.
    const success_url = `${site}/events/${event.slug}/success?session_id={CHECKOUT_SESSION_ID}`
    const cancel_url = `${site}/events/${event.slug}?cancelled=1`
    const metadata = { booking_id: booking.id, event_id: event.id }

    let session: Stripe.Checkout.Session
    try {
      const customer = await stripe.customers.create(
        {
          email: body.guest_email,
          name: body.guest_name,
          metadata: {
            booking_id: booking.id,
            event_id: event.id,
            booking_type: 'guest',
          },
        },
      )

      // Save the customer on the booking so approval can charge the held
      // card later (hold flow) or reconcile (charge flow).
      await admin
        .from('bookings')
        .update({ stripe_customer_id: customer.id })
        .eq('id', booking.id)

      session = holdOnly
        ? // HOLD: save the card now, charge on approval. No charge today.
          await stripe.checkout.sessions.create({
            // Keep instant event checkouts off Bacs Direct Debit (no-op unless
            // Direct Debit is enabled) — see src/lib/billing/direct-debit.ts.
            ...excludeDirectDebitFromInstantCheckout(),
            mode: 'setup',
            // Setup-mode Checkout requires a currency when payment methods
            // are chosen dynamically ("Missing required param: currency").
            currency: 'gbp',
            customer: customer.id,
            metadata,
            setup_intent_data: { metadata },
            expires_at: checkoutExpiresAt(),
            success_url,
            cancel_url,
          })
        : // CHARGE: take payment immediately.
          await stripe.checkout.sessions.create({
            // Keep instant event checkouts off Bacs Direct Debit (no-op unless
            // Direct Debit is enabled) — see src/lib/billing/direct-debit.ts.
            ...excludeDirectDebitFromInstantCheckout(),
            mode: 'payment',
            customer: customer.id,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: 'gbp',
                  unit_amount: price,
                  product_data: {
                    name: event.title,
                    description:
                      [event.venue_name, event.venue_city].filter(Boolean).join(' · ') || undefined,
                  },
                },
              },
            ],
            metadata,
            payment_intent_data: { metadata },
            expires_at: checkoutExpiresAt(),
            success_url,
            cancel_url,
          })
    } catch (e) {
      // Don't leave a reserved seat behind if Stripe refused the request.
      await admin
        .from('bookings')
        .update({ status: 'cancelled', charge_error: 'Checkout could not be opened.' })
        .eq('id', booking.id)
        .eq('status', 'pending')
      await admin
        .from('event_invitations')
        .update({ status: 'invited', booking_id: null, responded_at: null })
        .eq('booking_id', booking.id)
      console.error('events/checkout stripe error', e)
      return NextResponse.json(
        { error: 'Could not open checkout. Please try again.' },
        { status: 502 },
      )
    }

    if (!session.url) {
      return NextResponse.json({ error: 'Could not open checkout.' }, { status: 500 })
    }

    // The team is told once Checkout completes (/api/events/sync or the
    // stripe-webhook), not before payment.
    return NextResponse.json({ url: session.url, hold: holdOnly })
  } catch (err) {
    console.error('events/checkout error', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
