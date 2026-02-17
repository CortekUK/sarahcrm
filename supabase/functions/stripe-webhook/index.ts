import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-12-18.acacia',
    })

    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return new Response('Missing stripe-signature header', { status: 400 })
    }

    const body = await req.text()
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      )
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return new Response('Invalid signature', { status: 400 })
    }

    // Admin client — no user context needed
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const { event_id, member_id } = session.metadata ?? {}

      if (!event_id || !member_id) {
        console.error('Missing metadata on checkout session:', session.id)
        return new Response('Missing metadata', { status: 400 })
      }

      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null

      // Idempotency check — skip if we already processed this payment intent
      if (paymentIntentId) {
        const { data: existingBooking } = await supabaseAdmin
          .from('bookings')
          .select('id')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .maybeSingle()

        if (existingBooking) {
          console.log('Already processed payment intent:', paymentIntentId)
          return new Response('Already processed', { status: 200 })
        }
      }

      const amountPence = session.amount_total ?? 0

      // Create booking
      const { data: booking, error: bookingError } = await supabaseAdmin
        .from('bookings')
        .insert({
          event_id,
          member_id,
          status: 'confirmed',
          payment_method: 'stripe',
          amount_pence: amountPence,
          stripe_payment_intent_id: paymentIntentId,
        })
        .select('id')
        .single()

      if (bookingError) {
        console.error('Failed to create booking:', bookingError)
        return new Response('Failed to create booking', { status: 500 })
      }

      // Create payment record
      const { error: paymentError } = await supabaseAdmin
        .from('payments')
        .insert({
          member_id,
          amount_pence: amountPence,
          currency: 'GBP',
          payment_type: 'event_booking',
          payment_method: 'stripe',
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: paymentIntentId,
          reference_id: booking.id,
          description: `Event booking ${booking.id}`,
        })

      if (paymentError) {
        console.error('Failed to create payment:', paymentError)
        // Booking was created — don't fail the webhook; payment can be reconciled later
      }

      console.log('Booking created:', booking.id, 'for event:', event_id)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('Internal server error', { status: 500 })
  }
})
