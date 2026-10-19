// POST /api/portal/billing/direct-debit
//
// Lets an existing member who already has a Stripe subscription switch
// their membership payments to UK Direct Debit (Stripe Bacs Debit).
//
// Opens a Stripe-hosted Checkout Session in `setup` mode for `bacs_debit`
// (Stripe collects the bank details, shows the Bacs mandate and sends the
// mandate confirmation email). Nothing is collected now. When the session
// completes, the stripe-webhook edge function (checkout.session.completed,
// metadata.kind = 'member_bacs_mandate') makes the new bank-account payment
// method the default on the customer AND the subscription, so the next
// renewal is collected by Direct Debit, and records the mandate status on
// the member. Card stays available via "Manage billing" as before.
//
// Members WITHOUT a subscription use the existing "Set up subscription"
// flow (subscription-checkout edge function), which now accepts
// { payment_method: 'bacs_debit' }.
//
// Returns { url } — the Stripe page to redirect to.

import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isDirectDebitEnabled } from '@/lib/billing/direct-debit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  try {
    if (!isDirectDebitEnabled()) {
      return Response.json({ error: 'Direct Debit is not available yet.' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = getAdminDb()
    const { data: member } = await admin
      .from('members')
      .select('id, stripe_customer_id, stripe_subscription_id, parent_member_id')
      .eq('profile_id', user.id)
      .maybeSingle()
    if (!member) return Response.json({ error: 'Member record not found.' }, { status: 404 })

    // Reps are billed through their organisation's primary account.
    if (member.parent_member_id) {
      return Response.json(
        { error: 'Billing is handled by your organisation’s primary account.' },
        { status: 403 },
      )
    }
    if (!member.stripe_customer_id || !member.stripe_subscription_id) {
      return Response.json(
        {
          error:
            'You don’t have a subscription yet. Use “Set up subscription” and choose Direct Debit.',
        },
        { status: 409 },
      )
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })

    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
    const metadata = {
      kind: 'member_bacs_mandate',
      member_id: member.id,
      subscription_id: member.stripe_subscription_id,
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      currency: 'gbp',
      payment_method_types: ['bacs_debit'],
      customer: member.stripe_customer_id,
      metadata,
      setup_intent_data: { metadata },
      success_url: `${origin}/portal/billing?direct_debit=success`,
      cancel_url: `${origin}/portal/billing?direct_debit=cancelled`,
    })

    if (!session.url) {
      return Response.json({ error: 'Could not open Direct Debit set-up.' }, { status: 500 })
    }
    return Response.json({ url: session.url })
  } catch (e) {
    console.error('[portal/direct-debit] error:', e)
    const message = e instanceof Error ? e.message : 'Unexpected error'
    return Response.json({ error: message }, { status: 500 })
  }
}
