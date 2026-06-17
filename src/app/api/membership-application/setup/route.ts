import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// POST /api/membership-application/setup
//
// First half of the pending-charge application flow. Unlike the old
// /checkout route (which created a subscription and charged immediately),
// this:
//   1. Saves the membership application as `status='pending'` (service
//      role bypasses RLS so the public form can write).
//   2. Creates a Stripe customer for the applicant.
//   3. Creates a Stripe SetupIntent — this CAPTURES (saves) the card
//      without charging it. The card is only charged later, when an admin
//      approves the application (see /api/admin/applications/approve).
//   4. Records the quoted gross amount (incl. VAT) on the application so
//      approval charges exactly what the applicant agreed to, even if the
//      plan price is edited afterwards.
//
// Returns { clientSecret, applicationId } so the form can mount Stripe
// Elements (PaymentElement in setup mode) and confirm the SetupIntent.
//
// Idempotent-ish: pass `application_id` on a repeat call (e.g. the
// applicant changed cadence and re-submitted) to update the existing row
// + customer instead of inserting a duplicate.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mirrors /checkout — DB is source of truth, this is the last-resort net.
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
    const existingApplicationId = (body.application_id as string) || null

    if (!tier) {
      return NextResponse.json({ error: 'Invalid membership tier.' }, { status: 400 })
    }
    if (cadence !== 'annual' && cadence !== 'monthly') {
      return NextResponse.json({ error: 'Invalid payment preference.' }, { status: 400 })
    }
    if (!body.email || !body.first_name || !body.last_name) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // ── Resolve the plan price (DB → fallback) ───────────────────────
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
        return NextResponse.json({ error: 'Invalid membership tier.' }, { status: 400 })
      }
      priceAnnual = fallback.annual
      priceMonthly = fallback.monthly
      tierLabel = fallback.label
    }

    const net = cadence === 'annual' ? priceAnnual : priceMonthly
    const quotedGross = net + Math.round(net * VAT_RATE)

    // All the applicant-supplied fields, shared by insert + update.
    const appFields = {
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
      referral_source: (body.referral_source as string) || null,
      referral_name: (body.referral_name as string) || null,
      applicant_stage: (body.applicant_stage as string) || null,
      looking_for: (body.looking_for as string) || null,
      what_they_can_offer: (body.what_they_can_offer as string) || null,
      // PITCH routing: early-stage applicants seeking investment go to the
      // PITCH track; everyone else to standard membership. Admins can
      // override later.
      track: /early-stage|investment/i.test((body.applicant_stage as string) || '')
        ? 'pitch'
        : 'membership',
      preferred_tier: tier,
      payment_preference: cadence,
      quoted_amount_pence: quotedGross,
      status: 'pending',
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })

    // ── Upsert the application row + ensure a Stripe customer ────────
    let applicationId: string
    let customerId: string | null = null

    if (existingApplicationId) {
      // Repeat call — reuse the existing row + customer if present.
      const { data: existing } = await admin
        .from('membership_applications')
        .select('id, stripe_customer_id')
        .eq('id', existingApplicationId)
        .maybeSingle()
      if (existing) {
        applicationId = existing.id
        customerId = existing.stripe_customer_id ?? null
        await admin
          .from('membership_applications')
          .update(appFields)
          .eq('id', applicationId)
      } else {
        const { data: inserted, error: insErr } = await admin
          .from('membership_applications')
          .insert(appFields)
          .select('id')
          .single()
        if (insErr || !inserted) {
          console.error('[setup] insert failed', insErr)
          return NextResponse.json({ error: 'Could not save your application.' }, { status: 500 })
        }
        applicationId = inserted.id
      }
    } else {
      const { data: inserted, error: insErr } = await admin
        .from('membership_applications')
        .insert(appFields)
        .select('id')
        .single()
      if (insErr || !inserted) {
        console.error('[setup] insert failed', insErr)
        return NextResponse.json({ error: 'Could not save your application.' }, { status: 500 })
      }
      applicationId = inserted.id
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: body.email as string,
        name: `${body.first_name} ${body.last_name}`,
        phone: (body.phone as string) || undefined,
        metadata: {
          application_id: applicationId,
          preferred_tier: tier,
          payment_preference: cadence,
        },
      })
      customerId = customer.id
    }

    // ── Create the SetupIntent — saves the card, charges nothing ─────
    // usage: 'off_session' so the saved card can be charged later, at
    // approval time, without the applicant being present.
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
      metadata: {
        application_id: applicationId,
        tier,
        cadence,
        quoted_amount_pence: String(quotedGross),
        tier_label: tierLabel,
      },
    })

    await admin
      .from('membership_applications')
      .update({
        stripe_customer_id: customerId,
        stripe_setup_intent_id: setupIntent.id,
      })
      .eq('id', applicationId)

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      applicationId,
    })
  } catch (err) {
    console.error('[setup] route error', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
