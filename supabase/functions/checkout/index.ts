import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify auth — JWT is sent automatically by supabase.functions.invoke
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create user-scoped client to get the calling user
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Admin client for cross-table validation
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Parse body. Optional guest + accommodation add-ons ride on the
    // member's single booking (no separate guest row): we add line items
    // for them and stamp the details into metadata for the webhook.
    const {
      event_id,
      bring_guest = false,
      guest_name = '',
      add_accommodation = false,
    } = await req.json()
    if (!event_id) {
      return new Response(
        JSON.stringify({ error: 'event_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get member record for this user
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('id, stripe_customer_id, profile_id')
      .eq('profile_id', user.id)
      .single()

    if (memberError || !member) {
      return new Response(
        JSON.stringify({ error: 'Member record not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get event
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select(
        'id, title, member_price_pence, guest_price_pence, accommodation_available, accommodation_price_pence, status, capacity, slug, bookings(count)',
      )
      .eq('id', event_id)
      .single()

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Must be published or live
    if (!['published', 'live'].includes(event.status)) {
      return new Response(
        JSON.stringify({ error: 'Event is not available for booking' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check capacity
    const bookingCount = (event.bookings as unknown as { count: number }[])?.[0]?.count ?? 0
    if (event.capacity && bookingCount >= event.capacity) {
      return new Response(
        JSON.stringify({ error: 'Event is fully booked' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check existing booking
    const { data: existingBooking } = await supabaseAdmin
      .from('bookings')
      .select('id, status')
      .eq('event_id', event_id)
      .eq('member_id', member.id)
      .in('status', ['confirmed', 'pending'])
      .maybeSingle()

    if (existingBooking) {
      return new Response(
        JSON.stringify({ error: 'You already have a booking for this event' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Stripe Checkout Session
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-12-18.acacia',
    })

    const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'

    // Build line items: member ticket, plus optional guest + accommodation.
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: 'gbp',
          unit_amount: event.member_price_pence,
          product_data: {
            name: event.title,
            description: `Booking for ${event.title}`,
          },
        },
        quantity: 1,
      },
    ]

    const wantsGuest = bring_guest === true && (event.guest_price_pence ?? 0) > 0
    if (wantsGuest) {
      lineItems.push({
        price_data: {
          currency: 'gbp',
          unit_amount: event.guest_price_pence,
          product_data: {
            name: `${event.title} — Guest`,
            description: guest_name ? `Guest: ${guest_name}` : 'Guest place',
          },
        },
        quantity: 1,
      })
    }

    const wantsAccommodation =
      add_accommodation === true &&
      event.accommodation_available === true &&
      (event.accommodation_price_pence ?? 0) > 0
    if (wantsAccommodation) {
      lineItems.push({
        price_data: {
          currency: 'gbp',
          unit_amount: event.accommodation_price_pence,
          product_data: {
            name: `${event.title} — Accommodation`,
            description: 'Overnight accommodation',
          },
        },
        quantity: 1,
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      metadata: {
        event_id: event.id,
        member_id: member.id,
        guests_invited: wantsGuest ? '1' : '0',
        guest_name: wantsGuest ? String(guest_name || '').slice(0, 120) : '',
        accommodation_booked: wantsAccommodation ? 'true' : 'false',
      },
      success_url: `${siteUrl}/portal/events/${event.id}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/portal/events/${event.id}`,
      ...(member.stripe_customer_id
        ? { customer: member.stripe_customer_id }
        : { customer_email: user.email }),
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Checkout error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
