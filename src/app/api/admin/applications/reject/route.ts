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
//
// An APPROVED application (already a provisioned, active member) can't be
// rejected here — that used to refund the payment while leaving the member
// active and still billing. Cancel the membership from Members instead.
// An application mid-approval ('processing') is also refused, and the
// application is claimed (status → 'processing') before any Stripe call so
// two reject clicks can't both refund. Refunds carry an idempotency key.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { renderClubEmail, sendClubEmail } from '@/lib/email/club-email'
import { escapeHtml } from '@/lib/stripe/server-helpers'

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
  // One refund per payment, ever — a repeated reject gets the same refund
  // back from Stripe instead of an error / second refund attempt.
  const refundKey = (id: string) => ({ idempotencyKey: `app-reject-refund-${id}` })
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
        const refund = await stripe.refunds.create({ payment_intent: pi }, refundKey(pi))
        return { refundId: refund.id, amountPence: refund.amount }
      }
      const charge = chargeFromInvoice(inv)
      if (charge) {
        const refund = await stripe.refunds.create({ charge }, refundKey(charge))
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
        const refund = await stripe.refunds.create({ payment_intent: pi }, refundKey(pi))
        return { refundId: refund.id, amountPence: refund.amount }
      }
      const charge = chargeFromInvoice(inv)
      if (charge) {
        const refund = await stripe.refunds.create({ charge }, refundKey(charge))
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
        const refund = await stripe.refunds.create(
          { payment_intent: succeeded.id },
          refundKey(succeeded.id),
        )
        return { refundId: refund.id, amountPence: refund.amount }
      }
    } catch (e) {
      console.warn('[reject] paymentIntents.list path failed:', e)
    }
  }

  return null
}

// Rejection email — built on the shared branded shell so it matches every
// other Club email. Refund line only appears when there's an actual refund.
async function sendRejectionEmailViaResend(args: {
  toEmail: string
  toName: string
  refundAmountPence: number
  reason?: string | null
}): Promise<{ sent: boolean; error?: string }> {
  const paragraphs = [
    `Hello ${escapeHtml(args.toName) || 'there'},`,
    `Thank you for the care you put into your application to The Club. After review, we won't be moving forward at this stage.`,
  ]
  if (args.reason) {
    paragraphs.push(
      `<span style="font-style:italic;font-family:Georgia,'Times New Roman',serif;color:#8A6D3B;">${escapeHtml(args.reason)}</span>`,
    )
  }
  if (args.refundAmountPence) {
    paragraphs.push(
      `We've refunded your application payment of <strong style="color:#2C2825;">£${(args.refundAmountPence / 100).toFixed(2)}</strong> to the card you used to apply. It typically appears on your statement within 5–10 working days.`,
    )
  }
  paragraphs.push(
    `You're welcome to apply again in the future if your circumstances change. With our thanks for your time.`,
  )

  const html = renderClubEmail({
    eyebrow: 'Your application',
    heading: 'Not the right fit at this time.',
    paragraphs,
  })
  const r = await sendClubEmail({
    to: args.toEmail,
    subject: 'Your application to The Club',
    html,
  })
  return { sent: r.sent, error: r.error }
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
      .maybeSingle()
    if (appErr || !app) {
      return Response.json({ error: 'Application not found' }, { status: 404 })
    }

    const prevStatus: string = app.status ?? 'pending'
    if (prevStatus === 'approved') {
      return Response.json(
        {
          error:
            'This applicant has already been approved and is a member. Rejecting would refund them while leaving the membership active — cancel the membership from Members instead.',
        },
        { status: 409 },
      )
    }
    if (prevStatus === 'processing') {
      return Response.json(
        { error: 'This application is being processed right now. Refresh and try again.' },
        { status: 409 },
      )
    }
    // Atomic claim so two reject clicks (or a reject racing an approve)
    // can't both act.
    const claimQuery = admin
      .from('membership_applications')
      .update({ status: 'processing', reviewed_at: new Date().toISOString() })
      .eq('id', app.id)
    const { data: claim, error: claimErr } = await (app.status == null
      ? claimQuery.is('status', null)
      : claimQuery.eq('status', prevStatus)
    )
      .select('id')
      .maybeSingle()
    // If the live DB ever restricts status values (check constraint →
    // 23514), degrade to the old unlocked behaviour rather than block every
    // decision; the Stripe idempotency keys still guard the charge.
    if (claimErr && claimErr.code !== '23514') {
      return Response.json({ error: `Could not lock application: ${claimErr.message}` }, { status: 500 })
    }
    if (claimErr) console.warn('[applications] status claim unavailable:', claimErr.message)
    if (!claim && !claimErr) {
      return Response.json(
        { error: 'This application is already being processed. Refresh to see its current status.' },
        { status: 409 },
      )
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
      await admin
        .from('membership_applications')
        .update({ status: prevStatus })
        .eq('id', app.id)
        .eq('status', 'processing')
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
