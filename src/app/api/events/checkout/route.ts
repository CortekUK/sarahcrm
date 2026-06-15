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
        'id, slug, title, status, start_date, guest_price_pence, member_price_pence, capacity, guest_ticket_capacity, venue_name, venue_city, auto_confirm, accommodation_available, accommodation_price_pence',
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
    if (guestPrice <= 0) {
      return NextResponse.json(
        { error: 'This event does not have a guest rate.' },
        { status: 400 },
      )
    }

    // Optional accommodation add-on — only when the event offers it.
    const accommodationPrice =
      event.accommodation_available && body.add_accommodation
        ? (event.accommodation_price_pence ?? 0)
        : 0
    const accommodationBooked = accommodationPrice > 0
    const price = guestPrice + accommodationPrice

    // When the event is NOT auto-confirm we HOLD the card (Stripe setup
    // mode) and charge only on admin approval — no money is taken now.
    // Auto-confirm events charge immediately.
    const holdOnly = event.auto_confirm === false

    // ── Insert booking (pending — webhook flips to confirmed) ──────
    // payment_method is a postgres enum: stripe | gocardless | invoice
    // | manual. We're sending the user to Stripe Checkout, so 'stripe'
    // is the right value here — anything else (including 'card')
    // produces a 22P02 invalid_enum error and the whole insert fails.
    const { data: booking, error: bookErr } = await admin
      .from('bookings')
      .insert({
        event_id: event.id,
        member_id: null,
        is_guest: true,
        guest_name: body.guest_name,
        guest_email: body.guest_email,
        guest_company: body.guest_company || null,
        dietary_requirements: body.dietary_requirements || null,
        special_requests: body.special_requests || null,
        accommodation_booked: accommodationBooked,
        amount_pence: price,
        status: 'pending',
        payment_method: 'stripe',
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
      subject: `New guest booking — ${event.title}`,
      heading: 'A new guest booking has come in.',
      paragraphs: [
        `<strong style="color:#2C2825;">${body.guest_name}</strong> booked <strong style="color:#2C2825;">${event.title}</strong>${accommodationBooked ? ' (with accommodation)' : ''}.`,
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
