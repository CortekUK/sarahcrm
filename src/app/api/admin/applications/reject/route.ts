// POST /api/admin/applications/reject
//
// Reject a membership application. If the applicant paid via the public
// pay-then-apply flow, this also:
//   1. Cancels their Stripe subscription immediately (so no future
//      charges).
//   2. Refunds their initial payment via Stripe.
//   3. Records the refund on the application row (refunded_at,
//      refund_id, refund_amount_pence) so Finance can deduct it from
//      total revenue.
//   4. Attempts to email them a rejection-with-refund note via Resend
//      (no-op if Resend isn't configured yet — admin can re-send).
//
// Body: { application_id: string, reason?: string }
//
// Admin only. The application transitions to status='rejected' as the
// final step; if Stripe refund fails we still mark the application
// rejected but flag the failure in the response so the admin sees it.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  application_id?: string
  reason?: string
}

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only.', status: 403 as const }
  }
  return { admin: profile }
}

// Pull the latest paid invoice for the subscription and refund its
// payment_intent. Returns the Stripe refund ID + actual amount refunded
// (in pence). If anything Stripe-shaped fails we throw so the caller
// can decide whether to still mark rejected.
// Try to refund whatever the applicant actually paid. Walks through
// multiple Stripe shapes because the first charge on a mode:
// 'subscription' Checkout Session can land in any of:
//   • subscription.latest_invoice → payment_intent / charge
//   • invoices.list({ subscription }) → payment_intent / charge
//   • paymentIntents.list({ customer }) → most recent succeeded
// We try in that order so the most specific lookup wins, and fall
// through if a shape is missing/empty. Returns the first refund that
// succeeds, or null if every path comes up empty.
async function refundLatestSubscriptionPayment(
  stripe: Stripe,
  subscriptionId: string,
  customerId: string | null,
): Promise<{ refundId: string; amountPence: number } | null> {
  // Helper — pull a payment_intent or charge id off any invoice-shaped
  // object across API versions.
  function piFromInvoice(inv: unknown): string | null {
    const i = inv as {
      payment_intent?: string | { id?: string } | null
      charge?: string | { id?: string } | null
      payments?: { data?: Array<{ payment?: { payment_intent?: string | null } }> }
    }
    if (typeof i.payment_intent === 'string') return i.payment_intent
    if (i.payment_intent && typeof i.payment_intent === 'object' && i.payment_intent.id) {
      return i.payment_intent.id
    }
    // Newer Stripe API exposes invoice payments under `payments.data[]`.
    const fromPayments = i.payments?.data?.[0]?.payment?.payment_intent
    if (fromPayments) return fromPayments
    return null
  }
  function chargeFromInvoice(inv: unknown): string | null {
    const i = inv as { charge?: string | { id?: string } | null }
    if (typeof i.charge === 'string') return i.charge
    if (i.charge && typeof i.charge === 'object' && i.charge.id) return i.charge.id
    return null
  }

  // ─── Path 1: subscription.latest_invoice ──────────────────────────
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice'],
    })
    const inv = sub.latest_invoice
    if (inv && typeof inv === 'object') {
      const pi = piFromInvoice(inv)
      if (pi) {
        const refund = await stripe.refunds.create({ payment_intent: pi })
        return { refundId: refund.id, amountPence: refund.amount }
      }
      const charge = chargeFromInvoice(inv)
      if (charge) {
        const refund = await stripe.refunds.create({ charge })
        return { refundId: refund.id, amountPence: refund.amount }
      }
    }
  } catch (e) {
    console.warn('[reject] latest_invoice path failed:', e)
  }

  // ─── Path 2: invoices.list({ subscription }) ──────────────────────
  // Drop the status filter — we want the most recent invoice in any
  // post-charge state (paid / open with payment captured).
  try {
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 5,
    })
    for (const inv of invoices.data) {
      const pi = piFromInvoice(inv)
      if (pi) {
        const refund = await stripe.refunds.create({ payment_intent: pi })
        return { refundId: refund.id, amountPence: refund.amount }
      }
      const charge = chargeFromInvoice(inv)
      if (charge) {
        const refund = await stripe.refunds.create({ charge })
        return { refundId: refund.id, amountPence: refund.amount }
      }
    }
  } catch (e) {
    console.warn('[reject] invoices.list path failed:', e)
  }

  // ─── Path 3: paymentIntents.list({ customer }) ────────────────────
  // Last-resort fallback for edge cases where the subscription's
  // invoice doesn't surface a PI cleanly (rare but seen on some test-
  // mode flows). Find the most recent succeeded PI on this customer.
  if (customerId) {
    try {
      const pis = await stripe.paymentIntents.list({ customer: customerId, limit: 10 })
      const succeeded = pis.data.find((p) => p.status === 'succeeded')
      if (succeeded) {
        const refund = await stripe.refunds.create({ payment_intent: succeeded.id })
        return { refundId: refund.id, amountPence: refund.amount }
      }
    } catch (e) {
      console.warn('[reject] paymentIntents.list path failed:', e)
    }
  }

  return null
}

// Build the rejection email body. Plain HTML — the same look-and-feel
// vocabulary as the invite email so the applicant doesn't get a jarring
// shift in voice. Refund amount is only mentioned when there's an
// actual refund.
function buildRejectionEmail(args: {
  firstName: string
  refundAmountPence: number
  reason?: string | null
}): { subject: string; html: string } {
  const refundLine = args.refundAmountPence
    ? `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">
         We've refunded your application payment of
         <strong style="color:#F0EBE0;">£${(args.refundAmountPence / 100).toFixed(2)}</strong>
         to the card you used to apply. It typically appears on your statement within 5–10
         working days.
       </p>`
    : ''
  const reasonLine = args.reason
    ? `<p style="margin:0 0 16px 0;font-style:italic;font-family:Georgia,'Times New Roman',serif;font-size:14.5px;line-height:1.7;color:#C09870;">
         ${args.reason}
       </p>`
    : ''
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
            Not the right fit at this time.
          </h1>
        </td></tr>
        <tr><td style="padding:0 40px 8px 40px;">
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">Hello ${args.firstName || 'there'},</p>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">
            Thank you for the care you put into your application to The Club. After review,
            we won't be moving forward at this stage.
          </p>
          ${reasonLine}
          ${refundLine}
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">
            You're welcome to apply again in the future if your circumstances change. With our thanks for your time.
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
  return { subject: 'Your application to The Club', html }
}

async function sendRejectionEmailViaResend(args: {
  toEmail: string
  toName: string
  refundAmountPence: number
  reason?: string | null
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  // .env.local defines FROM_EMAIL; accept RESEND_FROM_EMAIL too so the
  // email actually sends (previously this only read RESEND_FROM_EMAIL,
  // which is unset — so rejection emails silently no-op'd).
  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL
  if (!apiKey || !fromEmail) return { sent: false, error: 'Resend not configured' }

  const fromName = process.env.RESEND_FROM_NAME || 'The Club'
  const { subject, html } = buildRejectionEmail({
    firstName: args.toName,
    refundAmountPence: args.refundAmountPence,
    reason: args.reason,
  })

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [args.toEmail],
        subject,
        html,
      }),
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
    const auth = await requireAdmin()
    if ('error' in auth) {
      return Response.json({ error: auth.error }, { status: auth.status })
    }

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.application_id) {
      return Response.json({ error: 'application_id required' }, { status: 400 })
    }

    const admin = getAdminDb()

    const { data: app, error: appErr } = await admin
      .from('membership_applications')
      .select('*')
      .eq('id', body.application_id)
      .single()
    if (appErr || !app) {
      return Response.json({ error: 'Application not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appAny = app as any
    const subscriptionId: string | null = appAny.stripe_subscription_id ?? null
    const customerId: string | null = appAny.stripe_customer_id ?? null
    const amountPaidPence: number | null = appAny.amount_paid_pence ?? null
    const alreadyRefunded = Boolean(appAny.refunded_at)

    let refundId: string | null = null
    let refundedAmountPence = 0
    let refundError: string | null = null
    let subscriptionCancelled = false

    // Refund only if we have a subscription + a paid amount + haven't
    // already refunded. Otherwise this is just a "mark rejected" call.
    const shouldRefund =
      Boolean(subscriptionId) &&
      typeof amountPaidPence === 'number' &&
      amountPaidPence > 0 &&
      !alreadyRefunded

    if (shouldRefund && subscriptionId) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2026-02-25.clover',
      })

      // 1. Cancel the subscription immediately (not at period end —
      //    they were rejected, no further service period). We catch
      //    "no such subscription" so a manual-rejection re-run works.
      try {
        await stripe.subscriptions.cancel(subscriptionId)
        subscriptionCancelled = true
      } catch (e) {
        // Already cancelled is fine; anything else we surface as a
        // soft warning in the response.
        const msg = e instanceof Error ? e.message : 'cancel failed'
        if (!/already canceled|no such subscription/i.test(msg)) {
          refundError = `Cancel: ${msg}`
        }
      }

      // 2. Refund whatever the applicant paid. The refund helper walks
      //    three Stripe shapes (subscription.latest_invoice →
      //    invoices.list → customer's payment intents) so it works
      //    whether the first charge landed on an invoice, a charge,
      //    or a standalone PaymentIntent.
      try {
        const r = await refundLatestSubscriptionPayment(
          stripe,
          subscriptionId,
          customerId,
        )
        if (r) {
          refundId = r.refundId
          refundedAmountPence = r.amountPence
        } else {
          refundError =
            'Stripe found no refundable charge on this subscription or customer. Refund manually in the Stripe Dashboard and re-run reject.'
        }
      } catch (e) {
        refundError = e instanceof Error ? e.message : 'Refund failed'
      }
    }

    // 2b. Pending-charge cleanup: if the applicant saved a card but was
    //     never charged (no subscription), detach the saved payment method
    //     so we don't retain card details for a rejected applicant. The
    //     refund path above only runs for already-charged applications, so
    //     this is the no-charge counterpart.
    const savedPaymentMethodId: string | null = appAny.stripe_payment_method_id ?? null
    if (savedPaymentMethodId && !subscriptionId) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: '2026-02-25.clover',
        })
        await stripe.paymentMethods.detach(savedPaymentMethodId)
      } catch (e) {
        // Already detached / not found is fine — this is best-effort
        // cleanup and must not block the rejection.
        console.warn('[reject] could not detach saved card:', e)
      }
    }

    // 3. Update the application row.
    const updatePatch: Record<string, unknown> = {
      status: 'rejected',
      reviewed_by: auth.admin.id,
      reviewed_at: new Date().toISOString(),
    }
    if (refundId) {
      updatePatch.refunded_at = new Date().toISOString()
      updatePatch.refund_id = refundId
      updatePatch.refund_amount_pence = refundedAmountPence
    }

    const { error: updErr } = await admin
      .from('membership_applications')
      .update(updatePatch)
      .eq('id', app.id)
    if (updErr) {
      return Response.json(
        {
          error: `Application update failed: ${updErr.message}`,
          // Refund (if attempted) already succeeded — surface details
          // so admin can manually reconcile.
          refund_id: refundId,
          refund_amount_pence: refundedAmountPence,
        },
        { status: 500 },
      )
    }

    // 4. Send rejection email — non-fatal if it fails (admin can resend
    //    manually). Skips when applicant has no email on file.
    let emailSent = false
    let emailError: string | null = null
    if (app.email) {
      const r = await sendRejectionEmailViaResend({
        toEmail: app.email,
        toName: app.first_name ?? '',
        refundAmountPence: refundedAmountPence,
        reason: body.reason ?? null,
      })
      emailSent = r.sent
      emailError = r.error ?? null
    }

    return Response.json({
      ok: true,
      application_id: app.id,
      refund_id: refundId,
      refund_amount_pence: refundedAmountPence,
      refund_attempted: shouldRefund,
      subscription_cancelled: subscriptionCancelled,
      refund_error: refundError,
      email_sent: emailSent,
      email_error: emailError,
    })
  } catch (e) {
    console.error('[applications/reject] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
