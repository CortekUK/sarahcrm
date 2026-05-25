import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// POST /api/membership-application/checkout
//
// 1. Saves the membership application to `membership_applications`
//    using the service role (bypasses RLS so the public form can
//    write authentically).
// 2. Creates (or reuses) a Stripe customer for the applicant.
// 3. Opens a Stripe Checkout Session for the chosen tier + cadence,
//    using inline price_data so we don't need to maintain Price IDs in
//    the dashboard. Subscriptions use recurring intervals (month/year);
//    success/cancel URLs point back to /membership-application.
//
// The Stripe session's metadata.application_id links payment back to
// the saved application so the webhook can mark it 'paid pending
// review' (handled separately in the existing stripe-webhook function).

// Fallback pricing — used ONLY if the membership_plans table is empty
// or unreachable. The DB is the source of truth: an admin editing a
// plan in /dashboard/website/memberships updates this checkout flow
// without code changes. Numbers below mirror the seed data so they're
// safe to leave as a last-resort net.
const FALLBACK_PRICING = {
  individual: { annual: 250000, monthly: 20833, label: 'Individual Membership' },
  business: { annual: 1500000, monthly: 125000, label: 'Business Membership' },
  corporate: { annual: 3000000, monthly: 250000, label: 'Corporate Membership' },
} as const

const VAT_RATE = 0.2

type CadenceKey = 'annual' | 'monthly'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>

    const tier = body.preferred_tier as string
    const cadence = body.payment_preference as CadenceKey

    if (!tier) {
      return NextResponse.json({ error: 'Invalid membership tier.' }, { status: 400 })
    }
    if (cadence !== 'annual' && cadence !== 'monthly') {
      return NextResponse.json({ error: 'Invalid payment preference.' }, { status: 400 })
    }
    if (!body.email || !body.first_name || !body.last_name) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    // ── Save application (service role bypasses RLS) ─────────────────
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // ── Resolve the plan from the DB (source of truth) ──────────────
    // Admin edits in /dashboard/website/memberships update what's
    // charged here without a redeploy. Falls back to the hardcoded
    // table if the DB is empty / the plan was deleted but a stale tab
    // submitted with that slug.
    let priceAnnual: number
    let priceMonthly: number
    let tierLabel: string

    const { data: plan } = await admin
      .from('membership_plans')
      .select('annual_price_pence, monthly_price_pence, name, is_active')
      .eq('slug', tier)
      .maybeSingle()

    if (plan && plan.is_active) {
      priceAnnual = plan.annual_price_pence
      priceMonthly = plan.monthly_price_pence
      tierLabel = `${plan.name} Membership`
    } else {
      const fallback = FALLBACK_PRICING[tier as keyof typeof FALLBACK_PRICING]
      if (!fallback) {
        return NextResponse.json(
          { error: 'Invalid membership tier.' },
          { status: 400 },
        )
      }
      priceAnnual = fallback.annual
      priceMonthly = fallback.monthly
      tierLabel = fallback.label
    }

    const insertPayload = {
      first_name: body.first_name as string,
      last_name: body.last_name as string,
      email: body.email as string,
      phone: (body.phone as string) || null,
      address_line_1: (body.address_line_1 as string) || null,
      address_line_2: (body.address_line_2 as string) || null,
      city: (body.city as string) || null,
      postcode: (body.postcode as string) || null,
      preferred_location: (body.preferred_location as string) || null,
      interests: Array.isArray(body.interests) ? (body.interests as string[]) : null,
      photo_url: (body.photo_url as string) || null,
      nationality: (body.nationality as string) || null,
      identifies_as: (body.identifies_as as string) || null,
      pronouns: (body.pronouns as string) || null,
      bio: (body.bio as string) || null,
      linkedin_url: (body.linkedin_url as string) || null,
      instagram_url: (body.instagram_url as string) || null,
      x_url: (body.x_url as string) || null,
      youtube_url: (body.youtube_url as string) || null,
      tiktok_url: (body.tiktok_url as string) || null,
      website_url: (body.website_url as string) || null,
      company: (body.company as string) || null,
      industry: (body.industry as string) || null,
      position: (body.position as string) || null,
      work_email: (body.work_email as string) || null,
      annual_turnover: (body.annual_turnover as string) || null,
      employees: (body.employees as string) || null,
      referral_name: (body.referral_name as string) || null,
      preferred_tier: tier,
      payment_preference: cadence,
      status: 'pending',
    }

    const { data: inserted, error: insertErr } = await admin
      .from('membership_applications')
      .insert(insertPayload)
      .select('id')
      .single()

    if (insertErr || !inserted) {
      console.error('Failed to insert application', insertErr)
      return NextResponse.json(
        { error: 'Could not save your application. Please try again.' },
        { status: 500 },
      )
    }

    // ── Create Stripe checkout session ───────────────────────────────
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })

    const customer = await stripe.customers.create({
      email: body.email as string,
      name: `${body.first_name} ${body.last_name}`,
      phone: (body.phone as string) || undefined,
      metadata: {
        application_id: inserted.id,
        preferred_tier: tier,
        payment_preference: cadence,
      },
    })

    const net = cadence === 'annual' ? priceAnnual : priceMonthly
    const gross = net + Math.round(net * VAT_RATE)

    // Always create a subscription so the renewal is automatic.
    // - annual cadence  → interval: 'year'
    // - monthly cadence → interval: 'month'
    const interval = cadence === 'annual' ? 'year' : 'month'

    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: gross, // gross incl. VAT, integer pence
            product_data: {
              name: tierLabel,
              description: `${cadence === 'annual' ? 'Annual' : 'Monthly'} billing · includes 20% VAT`,
            },
            recurring: { interval },
          },
        },
      ],
      metadata: {
        application_id: inserted.id,
        tier,
        cadence,
      },
      subscription_data: {
        metadata: {
          application_id: inserted.id,
          tier,
          cadence,
        },
      },
      success_url: `${origin}/membership-application/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/membership-application?cancelled=1`,
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Could not open checkout.' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('checkout route error', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
