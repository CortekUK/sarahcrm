import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Get member record
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('id, membership_tier, membership_type, stripe_customer_id, stripe_subscription_id')
      .eq('profile_id', user.id)
      .single()

    if (memberError || !member) {
      return new Response(
        JSON.stringify({ error: 'Member record not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (member.stripe_subscription_id) {
      return new Response(
        JSON.stringify({ error: 'You already have an active subscription. Use the billing portal to manage it.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up the plan for this member's tier. membership_plans is the
    // single source of truth for pricing — the plan IS the tier, matched on
    // tier_classification. (The old membership_tiers table is gone.)
    const { data: plan, error: planError } = await supabaseAdmin
      .from('membership_plans')
      .select('id, name, monthly_price_pence, is_active')
      .eq('tier_classification', member.membership_tier)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: 'No active plan found for your membership tier' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!plan.monthly_price_pence || plan.monthly_price_pence <= 0) {
      return new Response(
        JSON.stringify({ error: 'Monthly pricing not configured for this plan. Please contact support.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-12-18.acacia',
    })

    // Create the recurring price on the fly from the plan's live monthly
    // amount, so checkout always charges what membership_plans says (no
    // stale pre-stored price IDs to drift out of sync).
    const price = await stripe.prices.create({
      currency: 'gbp',
      unit_amount: plan.monthly_price_pence,
      recurring: { interval: 'month' },
      product_data: { name: `${plan.name} Membership` },
    })

    // Create or reuse Stripe Customer
    let customerId = member.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { member_id: member.id, supabase_user_id: user.id },
      })
      customerId = customer.id

      await supabaseAdmin
        .from('members')
        .update({ stripe_customer_id: customerId })
        .eq('id', member.id)
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        member_id: member.id,
        plan_id: plan.id,
      },
      subscription_data: {
        metadata: {
          member_id: member.id,
          plan_id: plan.id,
        },
      },
      success_url: `${siteUrl}/portal/billing?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${siteUrl}/portal/billing?status=cancelled`,
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Subscription checkout error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
