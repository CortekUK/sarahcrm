import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { isDirectDebitEnabled } from '@/lib/billing/direct-debit'
import { cleanText, getSiteUrl, isValidEmail } from '@/lib/stripe/server-helpers'
import { canonicalPlanSlug } from '@/lib/membership/plans'

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
// + customer instead of inserting a duplicate. This route is public, so an
// application_id alone is never trusted: the row is only reused while it is
// still an unfinished draft (status pending, no card saved yet) AND its
// email matches the submitted one. Anything else gets a fresh row, so a
// stranger can't overwrite (or reset the status of) someone else's
// application.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mirrors /checkout — DB is source of truth, this is the last-resort net.
// Prices are NET (VAT added below). Keyed by canonical slug — legacy
// slugs ('individual', 'corporate') are mapped by canonicalPlanSlug first.
const FALLBACK_PRICING = {
  access: { annual: 250000, monthly: 20833, label: 'Access Membership' },
  'the-club-membership': { annual: 600000, monthly: 50000, label: 'The Club Membership' },
  business: { annual: 1500000, monthly: 125000, label: 'The Club Business Membership' },
} as const

const VAT_RATE = 0.2

type CadenceKey = 'annual' | 'monthly'

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    // Bound + clean every free-text field (NUL / control chars or huge
    // values would otherwise surface as a 500).
    const LONG_FIELDS = new Set(['bio', 'looking_for', 'what_they_can_offer', 'goals'])
    const body: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') body[k] = cleanText(v, LONG_FIELDS.has(k) ? 5000 : 500) ?? ''
      else if (Array.isArray(v))
        body[k] = v
          .map((x) => cleanText(x, 200))
          .filter((x): x is string => !!x)
          .slice(0, 50)
      else body[k] = v
    }
    if (typeof body.email === 'string') body.email = body.email.toLowerCase()

    // Canonical slug: old links / drafts may still carry 'individual' or
    // 'corporate' from before the Nov 2026 tier rename.
    const tier = canonicalPlanSlug(
      typeof body.preferred_tier === 'string' ? body.preferred_tier : '',
    )
    const cadence = body.payment_preference as CadenceKey
    const existingApplicationId =
      typeof body.application_id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.application_id)
        ? body.application_id
        : null

    if (!tier) {
      return NextResponse.json({ error: 'Invalid membership tier.' }, { status: 400 })
    }
    if (cadence !== 'annual' && cadence !== 'monthly') {
      return NextResponse.json({ error: 'Invalid payment preference.' }, { status: 400 })
    }
    if (!body.email || !body.first_name || !body.last_name) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }
    if (!isValidEmail(body.email as string)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
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
      tierLabel = `${plan.name.replace(/\s*membership$/i, '')} Membership`
    } else {
      const fallback = FALLBACK_PRICING[tier as keyof typeof FALLBACK_PRICING]
      if (!fallback) {
        return NextResponse.json({ error: 'Invalid membership tier.' }, { status: 400 })
      }
      priceAnnual = fallback.annual
      priceMonthly = fallback.monthly
      tierLabel = fallback.label
    }

    // ── Duplicate guards ─────────────────────────────────────────────
    // An existing member must sign in rather than apply again, and an
    // application that is already complete (card saved) and under review
    // can't be duplicated.
    {
      const email = body.email as string
      const { data: prof } = await admin
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .limit(1)
      if (prof?.[0]) {
        const { data: mem } = await admin
          .from('members')
          .select('id, membership_status')
          .eq('profile_id', prof[0].id)
          .is('deleted_at', null)
          .limit(1)
        if (mem?.[0] && mem[0].membership_status !== 'cancelled' && mem[0].membership_status !== 'expired') {
          return NextResponse.json(
            { error: 'This email already belongs to a member. Please sign in instead.' },
            { status: 409 },
          )
        }
      }
      const { data: openApps } = await admin
        .from('membership_applications')
        .select('id')
        .ilike('email', email)
        .in('status', ['pending', 'shortlisted', 'processing'])
        .not('stripe_payment_method_id', 'is', null)
        .limit(1)
      if (openApps?.[0]) {
        return NextResponse.json(
          { error: 'An application with this email is already under review. We will be in touch soon.' },
          { status: 409 },
        )
      }
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
      personal_interests: Array.isArray(body.personal_interests)
        ? (body.personal_interests as string[])
        : null,
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
      // "Goals" (brief Nov 2026). Column added in 20261106_b_memberships;
      // only sent when filled, and dropped on retry if the column is missing.
      ...(typeof body.goals === 'string' && body.goals ? { goals: body.goals } : {}),
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

    // If 20261106_b_memberships hasn't been applied yet the `goals` column
    // doesn't exist — retry without it rather than lose the application.
    const missingGoals = (err: { code?: string; message?: string } | null) =>
      !!err && 'goals' in appFields && /goals/i.test(err.message ?? '')
    const withoutGoals = () => {
      const rest: Record<string, unknown> = { ...appFields }
      delete rest.goals
      return rest
    }
    async function insertApp() {
      let res = await admin.from('membership_applications').insert(appFields).select('id').single()
      if (missingGoals(res.error)) {
        res = await admin.from('membership_applications').insert(withoutGoals()).select('id').single()
      }
      return res
    }
    async function updateApp(id: string) {
      const res = await admin.from('membership_applications').update(appFields).eq('id', id)
      if (missingGoals(res.error)) {
        await admin.from('membership_applications').update(withoutGoals()).eq('id', id)
      }
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
        .select('id, email, status, stripe_customer_id, stripe_payment_method_id')
        .eq('id', existingApplicationId)
        .maybeSingle()
      const reusable =
        existing &&
        existing.status === 'pending' &&
        !existing.stripe_payment_method_id &&
        (existing.email ?? '').toLowerCase() === (body.email as string)
      if (existing && reusable) {
        applicationId = existing.id
        customerId = existing.stripe_customer_id ?? null
        await updateApp(applicationId)
      } else {
        const { data: inserted, error: insErr } = await insertApp()
        if (insErr || !inserted) {
          console.error('[setup] insert failed', insErr)
          return NextResponse.json({ error: 'Could not save your application.' }, { status: 500 })
        }
        applicationId = inserted.id
      }
    } else {
      const { data: inserted, error: insErr } = await insertApp()
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

    // ── Direct Debit (Stripe Bacs) branch — additive ─────────────────
    // When the applicant picks Direct Debit we don't mount card Elements.
    // Instead we open a Stripe-hosted Checkout Session in `setup` mode for
    // `bacs_debit`: Stripe collects the UK bank details, shows the Bacs
    // mandate confirmation and emails the mandate. Like the card flow,
    // NOTHING is collected now — the subscription (and first debit) is
    // created when an admin approves. The card branch below is untouched.
    if (body.payment_method_type === 'bacs_debit') {
      if (!isDirectDebitEnabled()) {
        return NextResponse.json(
          { error: 'Direct Debit is not available yet. Please pay by card.' },
          { status: 400 },
        )
      }
      // Fixed site URL — never the request's Origin / Host headers.
      const origin = getSiteUrl()
      const ddMetadata = {
        kind: 'application_bacs_mandate',
        application_id: applicationId,
        tier,
        cadence,
        quoted_amount_pence: String(quotedGross),
        tier_label: tierLabel,
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'setup',
        currency: 'gbp',
        payment_method_types: ['bacs_debit'],
        customer: customerId,
        metadata: ddMetadata,
        setup_intent_data: { metadata: ddMetadata },
        success_url: `${origin}/membership-application/success?session_id={CHECKOUT_SESSION_ID}&application_id=${applicationId}&method=bacs_debit`,
        cancel_url: `${origin}/membership-application?direct_debit=cancelled`,
      })
      const setupIntentId =
        typeof session.setup_intent === 'string'
          ? session.setup_intent
          : (session.setup_intent?.id ?? null)

      await admin
        .from('membership_applications')
        .update({
          stripe_customer_id: customerId,
          ...(setupIntentId ? { stripe_setup_intent_id: setupIntentId } : {}),
        })
        .eq('id', applicationId)
      // New DD columns written separately so a not-yet-applied migration
      // can't block the core write above.
      const { error: ddColErr } = await admin
        .from('membership_applications')
        .update({
          stripe_payment_method_type: 'bacs_debit',
          stripe_checkout_session_id: session.id,
          direct_debit_status: null,
        })
        .eq('id', applicationId)
      if (ddColErr) console.warn('[setup] direct-debit columns not written:', ddColErr.message)

      if (!session.url) {
        return NextResponse.json({ error: 'Could not open Direct Debit set-up.' }, { status: 500 })
      }
      return NextResponse.json({ checkoutUrl: session.url, applicationId })
    }

    // Applicant switched back from Direct Debit to card on a repeat call:
    // clear the stale method marker (best-effort, separate statement).
    if (existingApplicationId && isDirectDebitEnabled()) {
      await admin
        .from('membership_applications')
        .update({ stripe_payment_method_type: 'card' })
        .eq('id', applicationId)
        .then(({ error }) => {
          if (error) console.warn('[setup] could not reset payment method type:', error.message)
        })
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
    return NextResponse.json(
      { error: 'Could not start payment setup. Please try again.' },
      { status: 500 },
    )
  }
}
