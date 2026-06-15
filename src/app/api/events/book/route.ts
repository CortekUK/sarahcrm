// POST /api/events/book
//
// MEMBER event booking. Unlike guests, members already have a card on file
// (saved when they joined), so we never bounce them to Stripe to re-type it:
//
//   • auto-confirm ON  + card on file → charge the saved card off-session now,
//                                        booking = confirmed.
//   • auto-confirm OFF + card on file → booking = pending, NO charge; the team
//                                        charges the held card on approval.
//   • no usable card (or the saved card is declined/expired) → fall back to
//     Stripe Checkout to collect a card (charge if auto-confirm, else hold).
//
// The booking row is pre-created here with status pending; the off-session
// path flips it to confirmed, and the Checkout fallback is finalised by
// /api/events/sync on the confirmation page.
//
// Body: { event_id, bring_guest?, guest_name?, add_accommodation? }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BookBody {
  event_id?: string
  bring_guest?: boolean
  guest_name?: string
  add_accommodation?: boolean
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as BookBody
    if (!body.event_id) {
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
      .select('id, stripe_customer_id')
      .eq('profile_id', user.id)
      .maybeSingle()
    if (!member) {
      return NextResponse.json({ error: 'No member account found.' }, { status: 403 })
    }

    // Event.
    const { data: event } = await admin
      .from('events')
      .select(
        'id, slug, title, status, start_date, member_price_pence, guest_price_pence, accommodation_available, accommodation_price_pence, capacity, auto_confirm, bookings(count)',
      )
      .eq('id', body.event_id)
      .single()
    if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    if (!['published', 'live'].includes(event.status)) {
      return NextResponse.json({ error: 'This event is not open for bookings.' }, { status: 400 })
    }

    // Capacity + existing-booking guards.
    const bookingCount = (event.bookings as unknown as { count: number }[])?.[0]?.count ?? 0
    if (event.capacity && bookingCount >= event.capacity) {
      return NextResponse.json({ error: 'This event is fully booked.' }, { status: 400 })
    }
    const { data: existing } = await admin
      .from('bookings')
      .select('id, status')
      .eq('event_id', event.id)
      .eq('member_id', member.id)
      .in('status', ['confirmed', 'pending'])
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: 'You already have a booking for this event.' },
        { status: 409 },
      )
    }

    // Amount = member ticket + optional guest + optional accommodation.
    const wantsGuest = body.bring_guest === true && (event.guest_price_pence ?? 0) > 0
    const wantsAccommodation =
      body.add_accommodation === true &&
      event.accommodation_available === true &&
      (event.accommodation_price_pence ?? 0) > 0
    const amount =
      (event.member_price_pence ?? 0) +
      (wantsGuest ? (event.guest_price_pence ?? 0) : 0) +
      (wantsAccommodation ? (event.accommodation_price_pence ?? 0) : 0)

    const autoConfirm = event.auto_confirm !== false

    // Pre-create the booking (pending). The off-session path confirms it;
    // the Checkout fallback is finalised by /api/events/sync.
    const { data: booking, error: bookErr } = await admin
      .from('bookings')
      .insert({
        event_id: event.id,
        member_id: member.id,
        is_guest: false,
        status: 'pending',
        payment_method: 'stripe',
        amount_pence: amount,
        guests_invited: wantsGuest ? 1 : 0,
        guest_name: wantsGuest ? (body.guest_name?.trim() || null) : null,
        accommodation_booked: wantsAccommodation,
        stripe_customer_id: member.stripe_customer_id ?? null,
      })
      .select('id')
      .single()
    if (bookErr || !booking) {
      return NextResponse.json(
        { error: bookErr?.message ?? 'Could not create booking.' },
        { status: 500 },
      )
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
        return NextResponse.json({ ok: true, booking_id: booking.id, status: 'pending' })
      }
      // Auto-confirm: charge the saved card off-session right now.
      try {
        const pi = await stripe.paymentIntents.create({
          amount,
          currency: 'gbp',
          customer: member.stripe_customer_id,
          payment_method: defaultPm,
          off_session: true,
          confirm: true,
          metadata: { booking_id: booking.id, event_id: event.id, member_id: member.id },
        })
        if (pi.status === 'succeeded') {
          await admin
            .from('bookings')
            .update({ status: 'confirmed', stripe_payment_intent_id: pi.id, charge_error: null })
            .eq('id', booking.id)
          // Member-scoped payment row so Finance sees it.
          await admin.from('payments').insert({
            member_id: member.id,
            amount_pence: amount,
            currency: 'GBP',
            payment_type: 'event_booking',
            payment_method: 'stripe',
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: pi.id,
            reference_id: booking.id,
            description: `Event booking — ${event.title}`,
          })
          return NextResponse.json({ ok: true, booking_id: booking.id, status: 'confirmed' })
        }
        // Needs action / not succeeded → fall through to Checkout collection.
      } catch {
        // Card declined / expired (#6) → fall through to collect a fresh card.
        await admin
          .from('bookings')
          .update({ charge_error: 'Saved card could not be charged — card update needed.' })
          .eq('id', booking.id)
      }
    }

    // ── Fallback: collect a card via Stripe Checkout ────────────────
    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
    const success_url = `${origin}/portal/events/${event.id}/confirmation?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking.id}`
    const cancel_url = `${origin}/portal/events/${event.id}`
    const metadata = { booking_id: booking.id, event_id: event.id, member_id: member.id }

    const session = autoConfirm
      ? await stripe.checkout.sessions.create({
          mode: 'payment',
          ...(member.stripe_customer_id
            ? { customer: member.stripe_customer_id }
            : { customer_email: user.email }),
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
          success_url,
          cancel_url,
        })
      : await stripe.checkout.sessions.create({
          mode: 'setup',
          ...(member.stripe_customer_id
            ? { customer: member.stripe_customer_id }
            : { customer_email: user.email }),
          metadata,
          setup_intent_data: { metadata },
          success_url,
          cancel_url,
        })

    if (!session.url) {
      return NextResponse.json({ error: 'Could not open checkout.' }, { status: 500 })
    }
    return NextResponse.json({ url: session.url, hold: !autoConfirm })
  } catch (e) {
    console.error('[events/book] error', e)
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
