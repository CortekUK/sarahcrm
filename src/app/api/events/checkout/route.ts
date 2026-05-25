import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

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
        'id, slug, title, status, start_date, guest_price_pence, member_price_pence, capacity, guest_ticket_capacity, venue_name, venue_city',
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

    const price = event.guest_price_pence ?? 0
    if (price <= 0) {
      return NextResponse.json(
        { error: 'This event does not have a guest rate.' },
        { status: 400 },
      )
    }

    // ── Insert booking (pending — webhook flips to confirmed) ──────
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
        amount_pence: price,
        status: 'pending',
        payment_method: 'card',
      })
      .select('id')
      .single()

    if (bookErr || !booking) {
      console.error('booking insert failed', bookErr)
      return NextResponse.json(
        { error: 'Could not reserve your seat. Please try again.' },
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

    const session = await stripe.checkout.sessions.create({
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
      metadata: {
        booking_id: booking.id,
        event_id: event.id,
      },
      payment_intent_data: {
        metadata: {
          booking_id: booking.id,
          event_id: event.id,
        },
      },
      success_url: `${origin}/events/${event.slug}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/events/${event.slug}?cancelled=1`,
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Could not open checkout.' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('events/checkout error', err)
    const msg = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
