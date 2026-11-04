import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { renderClubEmail, sendClubEmail } from '@/lib/email/club-email'
import { notifyAdmins } from '@/lib/email/admin-notify'
import {
  mandateReference,
  mandateToDirectDebitStatus,
  type DirectDebitStatus,
} from '@/lib/billing/direct-debit'
import { escapeHtml, getSiteUrl } from '@/lib/stripe/server-helpers'

// POST /api/membership-application/confirm
//
// Second half of the pending-charge flow. Stripe redirects the applicant
// back to /membership-application/success after they confirm the
// SetupIntent (save their card). The success page calls this route with
// the setup_intent id. We:
//   1. Retrieve the SetupIntent and read the saved payment_method.
//   2. Record it on the application + set it as the customer's default
//      so approval can charge it off-session.
//   3. Email the applicant a "pending application received" note — the
//      replacement for the old "payment received" confirmation, since no
//      payment has been taken yet.
//
// Idempotent: guarded by `pending_email_sent_at` so a re-run (the success
// page can fire more than once) won't double-send the email.
//
// Body: { setup_intent?: string, session_id?: string, application_id?: string }
// (setup_intent or session_id is required; application_id alone is refused)
//
// Direct Debit (Stripe Bacs) variant: the applicant set up a Bacs mandate
// on a Stripe-hosted Checkout Session (setup mode) instead of saving a card.
// Stripe returns them with `session_id`; we resolve the SetupIntent from the
// session and record the bank-account payment method + mandate the same way.
// The stripe-webhook edge function records the same data from
// checkout.session.completed, so either path alone is sufficient.
// Public — so an application_id alone is NEVER trusted. A SetupIntent (card)
// or Checkout Session (Direct Debit) is required, and it must belong to the
// application: same Stripe customer the /setup route created for it, and
// (when present) the same application_id in its metadata / the same
// SetupIntent id recorded on the row. We only write data Stripe confirms.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  setup_intent?: string
  /** Checkout Session id — Direct Debit (Bacs) mandate set-up only. */
  session_id?: string
  application_id?: string
}

async function sendPendingEmail(args: {
  toEmail: string
  firstName: string
  directDebit?: boolean
}): Promise<{ sent: boolean; error?: string }> {
  const savedLine = args.directDebit
    ? `Your Direct Debit has been set up, but <strong style="color:#2C2825;">nothing has been collected.</strong> We'll only collect payment if your application is approved — and if it isn't, nothing is taken and your Direct Debit is cancelled. Direct Debit payments take 3–5 working days to process.`
    : `Your card has been securely saved, but <strong style="color:#2C2825;">nothing has been charged.</strong> We'll only take payment if your application is approved — and if it isn't, no payment is taken and your card details are removed.`
  const html = renderClubEmail({
    eyebrow: 'Your application',
    heading: 'We’ve received your application.',
    paragraphs: [
      `Hello ${escapeHtml(args.firstName) || 'there'},`,
      `Thank you for applying to The Club. Your application is now with the team for review.`,
      savedLine,
      `You'll hear from us with a decision within 14 working days.`,
    ],
  })
  const r = await sendClubEmail({
    to: args.toEmail,
    subject: "We've received your application — The Club",
    html,
  })
  return { sent: r.sent, error: r.error }
}

export async function POST(req: NextRequest) {
  try {
    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const setupIntentParam =
      typeof body.setup_intent === 'string' && /^seti_[A-Za-z0-9_]{1,250}$/.test(body.setup_intent)
        ? body.setup_intent
        : null
    const sessionParam =
      typeof body.session_id === 'string' && /^cs_[A-Za-z0-9_]{1,250}$/.test(body.session_id)
        ? body.session_id
        : null
    if (body.application_id != null && typeof body.application_id !== 'string') {
      return NextResponse.json({ error: 'Invalid application_id' }, { status: 400 })
    }
    if (!setupIntentParam && !sessionParam) {
      return NextResponse.json(
        { error: 'setup_intent or session_id is required' },
        { status: 400 },
      )
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Resolve the SetupIntent → payment method + application id.
    let paymentMethodId: string | null = null
    let customerId: string | null = null
    let applicationId = body.application_id ?? null

    // application_id recorded in Stripe metadata — must match the request.
    let stripeAppId: string | null = null
    let setupIntentId: string | null = null

    if (setupIntentParam) {
      let si: Stripe.SetupIntent
      try {
        si = await stripe.setupIntents.retrieve(setupIntentParam)
      } catch {
        return NextResponse.json({ error: 'Card set-up not found.' }, { status: 404 })
      }
      if (si.status !== 'succeeded') {
        return NextResponse.json(
          { ok: false, status: si.status, error: 'Card not yet saved.' },
          { status: 200 },
        )
      }
      paymentMethodId =
        typeof si.payment_method === 'string' ? si.payment_method : (si.payment_method?.id ?? null)
      customerId = typeof si.customer === 'string' ? si.customer : (si.customer?.id ?? null)
      stripeAppId = si.metadata?.application_id ?? null
      setupIntentId = si.id
      applicationId = applicationId ?? stripeAppId
    }

    // Direct Debit (Bacs) — resolve the SetupIntent + mandate via the
    // Checkout Session. Only runs when session_id is passed, so the card
    // path above is unaffected.
    let isDirectDebit = false
    let ddStatus: DirectDebitStatus | null = null
    let ddMandateId: string | null = null
    let ddReference: string | null = null
    if (sessionParam && !setupIntentParam) {
      let session: Stripe.Checkout.Session
      try {
        session = await stripe.checkout.sessions.retrieve(sessionParam, {
          expand: ['setup_intent', 'setup_intent.mandate'],
        })
      } catch {
        return NextResponse.json({ error: 'Direct Debit set-up not found.' }, { status: 404 })
      }
      if (session.mode !== 'setup' || session.metadata?.kind !== 'application_bacs_mandate') {
        return NextResponse.json({ error: 'Not a Direct Debit set-up session.' }, { status: 400 })
      }
      const si = typeof session.setup_intent === 'object' ? session.setup_intent : null
      if (!si || si.status !== 'succeeded') {
        return NextResponse.json(
          { ok: false, status: si?.status ?? 'unknown', error: 'Direct Debit not yet set up.' },
          { status: 200 },
        )
      }
      isDirectDebit = true
      paymentMethodId =
        typeof si.payment_method === 'string' ? si.payment_method : (si.payment_method?.id ?? null)
      customerId =
        typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null)
      stripeAppId = session.metadata?.application_id ?? null
      setupIntentId = si.id
      applicationId = applicationId ?? stripeAppId
      if (si.mandate && typeof si.mandate === 'object') {
        ddMandateId = si.mandate.id
        ddStatus = mandateToDirectDebitStatus(si.mandate)
        ddReference = mandateReference(si.mandate)
      } else if (typeof si.mandate === 'string') {
        ddMandateId = si.mandate
        ddStatus = 'pending'
      }
    }

    if (!applicationId || !/^[0-9a-f-]{36}$/i.test(applicationId)) {
      return NextResponse.json({ error: 'Could not resolve application.' }, { status: 400 })
    }
    if (stripeAppId && stripeAppId !== applicationId) {
      return NextResponse.json(
        { error: 'This card set-up does not belong to that application.' },
        { status: 403 },
      )
    }

    // Load the application (also tells us if the email already went out).
    const { data: app, error: appErr } = await admin
      .from('membership_applications')
      .select('id, email, first_name, status, stripe_customer_id, stripe_setup_intent_id, pending_email_sent_at')
      .eq('id', applicationId)
      .maybeSingle()
    if (appErr || !app) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    }

    // Ownership: the SetupIntent / session must be on the Stripe customer
    // that /setup created for THIS application (and, for cards, be the
    // SetupIntent recorded on it). Stops someone attaching their own card /
    // customer to another applicant's application.
    const customerMatches = !!customerId && !!app.stripe_customer_id && customerId === app.stripe_customer_id
    const intentMatches =
      !isDirectDebit && setupIntentId && app.stripe_setup_intent_id
        ? setupIntentId === app.stripe_setup_intent_id
        : true
    if (!customerMatches || !intentMatches) {
      return NextResponse.json(
        { error: 'This card set-up does not belong to that application.' },
        { status: 403 },
      )
    }
    // Only an application still awaiting review can have its card recorded.
    if (!['pending', 'shortlisted'].includes(app.status ?? 'pending')) {
      return NextResponse.json(
        { ok: false, error: 'This application has already been decided.' },
        { status: 409 },
      )
    }

    // Persist the saved card + make it the customer's default so approval
    // can charge it off-session without choosing a payment method.
    if (paymentMethodId && customerId) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      })
    }

    const updatePatch: Record<string, unknown> = {}
    if (paymentMethodId) updatePatch.stripe_payment_method_id = paymentMethodId
    if (customerId) updatePatch.stripe_customer_id = customerId

    // Send the pending-received email exactly once. The flag is CLAIMED with
    // a conditional update first, so two overlapping calls (the success page
    // can fire more than once) can't both send; it is released again if the
    // send fails so a later call can retry.
    let emailSent = false
    let emailError: string | null = null
    const { data: emailClaim } =
      !app.pending_email_sent_at && app.email
        ? await admin
            .from('membership_applications')
            .update({ pending_email_sent_at: new Date().toISOString() })
            .eq('id', applicationId)
            .is('pending_email_sent_at', null)
            .select('id')
            .maybeSingle()
        : { data: null }
    if (emailClaim && app.email) {
      const r = await sendPendingEmail({
        toEmail: app.email,
        firstName: app.first_name ?? '',
        directDebit: isDirectDebit,
      })
      emailSent = r.sent
      emailError = r.error ?? null
      if (!r.sent) {
        await admin
          .from('membership_applications')
          .update({ pending_email_sent_at: null })
          .eq('id', applicationId)
      }
      // Tell the team a new application is waiting (once, gated by the same
      // pending-email flag).
      // Fixed site URL (never request headers) + escaped applicant name —
      // this email goes to staff from the Club's own domain.
      const origin = getSiteUrl()
      const applicantName = escapeHtml(app.first_name) || 'A new applicant'
      await notifyAdmins(admin, {
        subject: 'New membership application received',
        heading: 'A new application has come in.',
        paragraphs: [
          isDirectDebit
            ? `<strong style="color:#2C2825;">${applicantName}</strong> has submitted a membership application and set up a Direct Debit (nothing collected).`
            : `<strong style="color:#2C2825;">${applicantName}</strong> has submitted a membership application and saved their card (not charged).`,
          `Review it in the dashboard to approve or decline.`,
        ],
        ctaUrl: `${origin}/dashboard/applications`,
        ctaLabel: 'Review applications',
      })
    }

    if (Object.keys(updatePatch).length > 0) {
      await admin.from('membership_applications').update(updatePatch).eq('id', applicationId)
    }

    // Direct Debit columns (new migration) in their own statement so they
    // can never block the core write above.
    if (isDirectDebit) {
      const { error: ddErr } = await admin
        .from('membership_applications')
        .update({
          stripe_payment_method_type: 'bacs_debit',
          stripe_mandate_id: ddMandateId,
          direct_debit_status: ddStatus,
          direct_debit_reference: ddReference,
        })
        .eq('id', applicationId)
      if (ddErr) console.warn('[confirm] direct-debit columns not written:', ddErr.message)
    }

    return NextResponse.json({
      ok: true,
      application_id: applicationId,
      email_sent: emailSent,
      email_error: emailError,
    })
  } catch (e) {
    console.error('[confirm] unhandled error:', e)
    return NextResponse.json({ error: 'Could not confirm your application.' }, { status: 500 })
  }
}
