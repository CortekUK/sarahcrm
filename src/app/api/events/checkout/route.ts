import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { notifyAdmins } from '@/lib/email/admin-notify'

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
    const body = (await req.json()) as CheckoutBody

    if (!body.event_id || !body.guest_name || !body.guest_email) {
      return NextResponse.json(
        { error: 'Missing required fields (event, name, email).' },
        { status: 400 },
      )
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
        'id, slug, title, status, start_date, guest_price_pence, member_price_pence, sponsor_price_pence, capacity, guest_ticket_capacity, venue_name, venue_city, auto_confirm, accommodation_available, accommodation_price_pence',
      )
      .eq('id', body.event_id)
      .single()

    if (eventErr || !event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }

    if (!['published', 'live'].includes(event.status)) {
      return NextResponse.json({ error: 'This event is not open for bookings.' }, { status: 400 })
    }

    if (new Date(event.start_date) < new Date()) {
      return NextResponse.json({ error: 'This event has already taken place.' }, { status: 400 })
    }

    const guestPrice = event.guest_price_pence ?? 0

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
      sponsorship = { id: sp.id, package_name: sp.package_name, member_id: sp.member_id ?? null }
      basePrice = sponsorPrice
    } else if (guestPrice <= 0) {
      return NextResponse.json(
        { error: 'This event does not have a guest rate.' },
        { status: 400 },
      )
    }

    // ── Capacity enforcement ───────────────────────────────────────
    // "Taken" = bookings with status confirmed/pending (cancelled and
    // refunded free their seat up). Same rule lives in /api/events/book.
    if (event.capacity != null) {
      const { count: takenCount } = await admin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .in('status', ['confirmed', 'pending'])
      if ((takenCount ?? 0) >= event.capacity) {
        return NextResponse.json({ error: 'This event is fully booked.' }, { status: 400 })
      }
    }
    // Guests have their own sub-cap (guest_ticket_capacity) on top of the
    // overall capacity — enforce it separately for the guest path. Sponsor
    // invites bypass this sub-cap (they're invited, not walk-up guests).
    if (!sponsorship && event.guest_ticket_capacity != null) {
      const { count: guestCount } = await admin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('is_guest', true)
        .in('status', ['confirmed', 'pending'])
      if ((guestCount ?? 0) >= event.guest_ticket_capacity) {
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
    const price = basePrice + accommodationPrice

    // If this is a sponsor booking AND the sponsor is (or matches) a member,
    // attribute the booking to that member so it appears in their portal. The
    // sponsorship is linked directly when the sponsor is a member; otherwise
    // we match the booking email to a member's profile.
    let linkedMemberId: string | null = null
    if (sponsorship) {
      if (sponsorship.member_id) {
        linkedMemberId = sponsorship.member_id
      } else if (body.guest_email) {
        const { data: prof } = await admin
          .from('profiles')
          .select('id')
          .ilike('email', body.guest_email)
          .maybeSingle()
        if (prof) {
          const { data: m } = await admin
            .from('members')
            .select('id')
            .eq('profile_id', prof.id)
            .is('deleted_at', null)
            .maybeSingle()
          linkedMemberId = m?.id ?? null
        }
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
    let dupQuery = admin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .in('status', ['confirmed', 'pending'])
    dupQuery = linkedMemberId
      ? dupQuery.or(`guest_email.ilike.${body.guest_email},member_id.eq.${linkedMemberId}`)
      : dupQuery.ilike('guest_email', body.guest_email)
    const { count: dupCount } = await dupQuery
    if ((dupCount ?? 0) > 0) {
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
    const { data: booking, error: bookErr } = await admin
      .from('bookings')
      .insert({
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
        status: 'pending',
        payment_method: 'stripe',
        sponsorship_id: sponsorship?.id ?? null,
        sponsor_package: sponsorship?.package_name ?? null,
      })
      .select('id')
      .single()

    if (bookErr || !booking) {
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

    // ── Stripe Checkout Session ────────────────────────────────────
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })

    const customer = await stripe.customers.create({
      email: body.guest_email,
      name: body.guest_name,
      metadata: {
        booking_id: booking.id,
        event_id: event.id,
        booking_type: 'guest',
      },
    })

    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
    const success_url = `${origin}/events/${event.slug}/success?session_id={CHECKOUT_SESSION_ID}`
    const cancel_url = `${origin}/events/${event.slug}?cancelled=1`
    const metadata = { booking_id: booking.id, event_id: event.id }

    // Save the customer on the booking so approval can charge the held
    // card later (hold flow) or reconcile (charge flow).
    await admin
      .from('bookings')
      .update({ stripe_customer_id: customer.id })
      .eq('id', booking.id)

    // Tell the team a new guest booking has come in.
    await notifyAdmins(admin, {
      subject: sponsorship
        ? `New sponsor booking — ${event.title}`
        : `New guest booking — ${event.title}`,
      heading: sponsorship
        ? 'A sponsor has booked through their invite link.'
        : 'A new guest booking has come in.',
      paragraphs: [
        `<strong style="color:#2C2825;">${body.guest_name}</strong> booked <strong style="color:#2C2825;">${event.title}</strong>${sponsorship ? ` (sponsor — ${sponsorship.package_name})` : ''}${accommodationBooked ? ' (with accommodation)' : ''}.`,
        holdOnly
          ? `Their card is held — approve the booking in the dashboard to charge it.`
          : `Payment is being taken now.`,
      ],
      ctaUrl: `${origin}/dashboard/bookings`,
      ctaLabel: 'View bookings',
    })

    const session = holdOnly
      ? // HOLD: save the card now, charge on approval. No charge today.
        await stripe.checkout.sessions.create({
          mode: 'setup',
          customer: customer.id,
          metadata,
          setup_intent_data: { metadata },
          success_url,
          cancel_url,
        })
      : // CHARGE: take payment immediately.
        await stripe.checkout.sessions.create({
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
                  description: [event.venue_name, event.venue_city].filter(Boolean).join(' · '),
                },
              },
            },
          ],
          metadata,
          payment_intent_data: { metadata },
          success_url,
          cancel_url,
        })

    if (!session.url) {
      return NextResponse.json({ error: 'Could not open checkout.' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url, hold: holdOnly })
  } catch (err) {
    console.error('events/checkout error', err)
    const msg = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
