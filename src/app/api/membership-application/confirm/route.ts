import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

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

function buildPendingEmail(args: { firstName: string }): { subject: string; html: string } {
  const html = `
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0E1014;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0E1014;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#14171D;border:1px solid #2C313B;">
        <tr><td align="center" style="padding:40px 32px 24px 32px;border-bottom:1px solid #2C313B;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:0.02em;color:#F0EBE0;font-weight:600;">The Club</div>
          <div style="margin-top:10px;">
            <span style="display:inline-block;width:32px;height:1px;background:#A87B4F;vertical-align:middle;"></span>
            <span style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#A87B4F;padding:0 12px;font-weight:500;">by Sarah Restrick</span>
            <span style="display:inline-block;width:32px;height:1px;background:#A87B4F;vertical-align:middle;"></span>
          </div>
        </td></tr>
        <tr><td style="padding:40px 40px 16px 40px;">
          <p style="margin:0 0 24px 0;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;color:#C09870;font-weight:500;">Your application</p>
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;color:#F0EBE0;font-weight:500;letter-spacing:-0.01em;">
            We&apos;ve received your application.
          </h1>
        </td></tr>
        <tr><td style="padding:0 40px 8px 40px;">
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">Hello ${args.firstName || 'there'},</p>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">
            Thank you for applying to The Club. Your application is now with the team for review.
          </p>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">
            Your card has been securely saved, but <strong style="color:#F0EBE0;">nothing has been charged.</strong>
            We&apos;ll only take payment if your application is approved &mdash; and if it isn&apos;t,
            no payment is taken and your card details are removed.
          </p>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">
            You&apos;ll hear from us with a decision within seven days.
          </p>
        </td></tr>
        <tr><td style="padding:24px 40px 40px 40px;">
          <p style="margin:0 0 8px 0;font-style:italic;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#D6D0C2;">With warmth,</p>
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#F0EBE0;">Sarah Restrick &amp; the team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
  return { subject: "We've received your application — The Club", html }
}

async function sendPendingEmail(args: {
  toEmail: string
  firstName: string
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  // The reject route historically read RESEND_FROM_EMAIL, but .env.local
  // defines FROM_EMAIL — accept either so the email actually sends.
  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL
  if (!apiKey || !fromEmail) return { sent: false, error: 'Resend not configured' }

  const fromName = process.env.RESEND_FROM_NAME || 'The Club'
  const { subject, html } = buildPendingEmail({ firstName: args.firstName })

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [args.toEmail], subject, html }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      return { sent: false, error: `Resend ${res.status}: ${text}` }
    }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'Unknown send error' }
  }
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
