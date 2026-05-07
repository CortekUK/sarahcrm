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

      if (session.mode === 'subscription') {
        // ── Subscription checkout ──
        const { member_id } = session.metadata ?? {}
        if (!member_id) {
          console.error('Missing member_id on subscription checkout:', session.id)
          return new Response('Missing metadata', { status: 400 })
        }

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id ?? null

        // Save subscription ID + activate member
        const { error: updateError } = await supabaseAdmin
          .from('members')
          .update({
            stripe_subscription_id: subscriptionId,
            membership_status: 'active',
          })
          .eq('id', member_id)

        if (updateError) {
          console.error('Failed to update member subscription:', updateError)
          return new Response('Failed to update member', { status: 500 })
        }

        console.log('Subscription activated for member:', member_id, 'sub:', subscriptionId)
      } else {
        // ── Event booking checkout ──
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
        }

        console.log('Booking created:', booking.id, 'for event:', event_id)
      }
    }

    // ── invoice.paid — recurring subscription payment ──
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id ?? null

      if (subscriptionId && invoice.billing_reason !== 'subscription_create') {
        // Find member by subscription ID
        const { data: member } = await supabaseAdmin
          .from('members')
          .select('id')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle()

        if (member) {
          // Idempotency — check stripe_invoice_id
          const { data: existing } = await supabaseAdmin
            .from('payments')
            .select('id')
            .eq('stripe_invoice_id', invoice.id)
            .maybeSingle()

          if (!existing) {
            const amountPence = invoice.amount_paid ?? 0

            // Insert payment record
            await supabaseAdmin.from('payments').insert({
              member_id: member.id,
              amount_pence: amountPence,
              currency: 'GBP',
              payment_type: 'membership',
              payment_method: 'stripe',
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_invoice_id: invoice.id,
              description: 'Membership subscription payment',
            })

            // Update renewal date (current_period_end from the subscription)
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            const renewalDate = new Date(sub.current_period_end * 1000).toISOString()

            await supabaseAdmin
              .from('members')
              .update({ renewal_date: renewalDate })
              .eq('id', member.id)

            console.log('Subscription payment recorded for member:', member.id)
          }
        }
      }
    }

    // ── invoice.payment_failed ──
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id ?? null

      if (subscriptionId) {
        const { data: member } = await supabaseAdmin
          .from('members')
          .select('id')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle()

        if (member) {
          // Idempotency check
          const { data: existing } = await supabaseAdmin
            .from('payments')
            .select('id')
            .eq('stripe_invoice_id', invoice.id)
            .maybeSingle()

          if (!existing) {
            await supabaseAdmin.from('payments').insert({
              member_id: member.id,
              amount_pence: invoice.amount_due ?? 0,
              currency: 'GBP',
              payment_type: 'membership',
              payment_method: 'stripe',
              status: 'failed',
              stripe_invoice_id: invoice.id,
              description: 'Membership payment failed',
            })

            console.log('Failed payment recorded for member:', member.id)
          }
        }
      }
    }

    // ── customer.subscription.updated ──
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription
      const memberId = subscription.metadata?.member_id

      if (memberId) {
        const renewalDate = new Date(subscription.current_period_end * 1000).toISOString()
        await supabaseAdmin
          .from('members')
          .update({ renewal_date: renewalDate })
          .eq('id', memberId)

        console.log('Subscription updated for member:', memberId)
      }
    }

    // ── customer.subscription.deleted ──
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription
      const memberId = subscription.metadata?.member_id

      if (memberId) {
        await supabaseAdmin
          .from('members')
          .update({
            membership_status: 'cancelled',
            stripe_subscription_id: null,
          })
          .eq('id', memberId)

        console.log('Subscription cancelled for member:', memberId)
      }
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
