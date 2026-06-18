import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { renderClubEmail, sendClubEmail } from '@/lib/email/club-email'
import { notifyAdmins } from '@/lib/email/admin-notify'

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
// Body: { setup_intent?: string, application_id?: string }
// Public — the setup_intent client secret is single-purpose and tied to
// one application; we only write data Stripe confirms.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  setup_intent?: string
  application_id?: string
}

async function sendPendingEmail(args: {
  toEmail: string
  firstName: string
}): Promise<{ sent: boolean; error?: string }> {
  const html = renderClubEmail({
    eyebrow: 'Your application',
    heading: 'We’ve received your application.',
    paragraphs: [
      `Hello ${args.firstName || 'there'},`,
      `Thank you for applying to The Club. Your application is now with the team for review.`,
      `Your card has been securely saved, but <strong style="color:#2C2825;">nothing has been charged.</strong> We'll only take payment if your application is approved — and if it isn't, no payment is taken and your card details are removed.`,
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
    if (!body.setup_intent && !body.application_id) {
      return NextResponse.json(
        { error: 'setup_intent or application_id is required' },
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

    if (body.setup_intent) {
      const si = await stripe.setupIntents.retrieve(body.setup_intent)
      if (si.status !== 'succeeded') {
        return NextResponse.json(
          { ok: false, status: si.status, error: 'Card not yet saved.' },
          { status: 200 },
        )
      }
      paymentMethodId =
        typeof si.payment_method === 'string' ? si.payment_method : (si.payment_method?.id ?? null)
      customerId = typeof si.customer === 'string' ? si.customer : (si.customer?.id ?? null)
      applicationId = applicationId ?? (si.metadata?.application_id ?? null)
    }

    if (!applicationId) {
      return NextResponse.json({ error: 'Could not resolve application.' }, { status: 400 })
    }

    // Load the application (also tells us if the email already went out).
    const { data: app, error: appErr } = await admin
      .from('membership_applications')
      .select('id, email, first_name, stripe_customer_id, pending_email_sent_at')
      .eq('id', applicationId)
      .single()
    if (appErr || !app) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    }

    customerId = customerId ?? app.stripe_customer_id

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

    // Send the pending-received email exactly once.
    let emailSent = false
    let emailError: string | null = null
    if (!app.pending_email_sent_at && app.email) {
      const r = await sendPendingEmail({ toEmail: app.email, firstName: app.first_name ?? '' })
      emailSent = r.sent
      emailError = r.error ?? null
      if (r.sent) updatePatch.pending_email_sent_at = new Date().toISOString()
      // Tell the team a new application is waiting (once, gated by the same
      // pending-email flag).
      const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
      await notifyAdmins(admin, {
        subject: 'New membership application received',
        heading: 'A new application has come in.',
        paragraphs: [
          `<strong style="color:#2C2825;">${app.first_name ?? 'A new applicant'}</strong> has submitted a membership application and saved their card (not charged).`,
          `Review it in the dashboard to approve or decline.`,
        ],
        ctaUrl: `${origin}/dashboard/applications`,
        ctaLabel: 'Review applications',
      })
    }

    if (Object.keys(updatePatch).length > 0) {
      await admin.from('membership_applications').update(updatePatch).eq('id', applicationId)
    }

    return NextResponse.json({
      ok: true,
      application_id: applicationId,
      email_sent: emailSent,
      email_error: emailError,
    })
  } catch (e) {
    console.error('[confirm] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
