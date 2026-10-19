// UK Direct Debit through Stripe (Bacs Debit) — webhook handlers.
//
// Additive to index.ts: every function here only acts on Direct Debit
// objects (setup-mode sessions tagged metadata.kind = '*_bacs_mandate',
// Bacs mandates, async Checkout payments, or payment rows still `pending`),
// so card / invoice / event flows are untouched.
//
// Mirrors src/lib/billing/direct-debit.ts (Deno can't import from src/).
// Columns written here come from 20261016_stripe_bacs_direct_debit.sql; the
// new-column writes are separate statements and only log on error, so an
// unapplied migration never turns a webhook into a 500 / Stripe retry loop.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

export type DdStatus = 'pending' | 'active' | 'failed' | 'inactive'

export const BACS_SESSION_KINDS = ['application_bacs_mandate', 'member_bacs_mandate'] as const

export function mandateToDdStatus(m: Stripe.Mandate): DdStatus {
  const network = m.payment_method_details?.bacs_debit?.network_status
  if (network === 'refused') return 'failed'
  if (network === 'revoked') return 'inactive'
  if (m.status === 'active') return 'active'
  if (m.status === 'inactive') return 'inactive'
  return 'pending'
}

function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null
  return typeof v === 'string' ? v : v.id
}

async function writeMemberDd(
  db: SupabaseClient,
  memberId: string,
  dd: { status: DdStatus; mandateId: string | null; reference: string | null },
) {
  // Existing column first (always present)…
  await db
    .from('members')
    .update({ direct_debit_active: dd.status === 'active' })
    .eq('id', memberId)
  // …then the new columns.
  const { error } = await db
    .from('members')
    .update({
      stripe_payment_method_type: 'bacs_debit',
      direct_debit_status: dd.status,
      direct_debit_updated_at: new Date().toISOString(),
      ...(dd.mandateId ? { stripe_mandate_id: dd.mandateId } : {}),
      ...(dd.reference ? { direct_debit_reference: dd.reference } : {}),
    })
    .eq('id', memberId)
  if (error) console.warn('[dd] member columns not written:', error.message)
}

// checkout.session.completed, mode = 'setup', metadata.kind = *_bacs_mandate
export async function handleBacsSetupSessionCompleted(
  stripe: Stripe,
  db: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const kind = session.metadata?.kind
  const setupIntentId = idOf(session.setup_intent as string | { id: string } | null)
  const customerId = idOf(session.customer as string | { id: string } | null)
  if (!setupIntentId) {
    console.error('[dd] setup session without setup_intent:', session.id)
    return
  }
  const si = await stripe.setupIntents.retrieve(setupIntentId, { expand: ['mandate'] })
  const paymentMethodId = idOf(si.payment_method as string | { id: string } | null)
  const mandate = si.mandate && typeof si.mandate === 'object' ? (si.mandate as Stripe.Mandate) : null
  const dd = {
    status: mandate ? mandateToDdStatus(mandate) : ('pending' as DdStatus),
    mandateId: mandate?.id ?? (typeof si.mandate === 'string' ? si.mandate : null),
    reference: mandate?.payment_method_details?.bacs_debit?.reference ?? null,
  }
  if (!paymentMethodId) {
    console.error('[dd] setup intent without payment_method:', setupIntentId)
    return
  }

  // Default on the customer so off-session charges use the bank account.
  if (customerId) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })
  }

  if (kind === 'application_bacs_mandate') {
    // Applicant — no member yet. Same fields /api/membership-application/
    // confirm writes (both paths are idempotent; either alone suffices).
    const applicationId = session.metadata?.application_id
    if (!applicationId) return
    await db
      .from('membership_applications')
      .update({
        stripe_payment_method_id: paymentMethodId,
        ...(customerId ? { stripe_customer_id: customerId } : {}),
      })
      .eq('id', applicationId)
    const { error } = await db
      .from('membership_applications')
      .update({
        stripe_payment_method_type: 'bacs_debit',
        stripe_checkout_session_id: session.id,
        stripe_mandate_id: dd.mandateId,
        direct_debit_status: dd.status,
        direct_debit_reference: dd.reference,
      })
      .eq('id', applicationId)
    if (error) console.warn('[dd] application columns not written:', error.message)
    console.log('[dd] application mandate recorded:', applicationId, dd.status)
    return
  }

  if (kind === 'member_bacs_mandate') {
    // Existing member switching to Direct Debit: future renewals on their
    // subscription are collected from the bank account.
    const memberId = session.metadata?.member_id
    const subscriptionId = session.metadata?.subscription_id
    if (subscriptionId) {
      await stripe.subscriptions.update(subscriptionId, {
        default_payment_method: paymentMethodId,
      })
    }
    if (memberId) await writeMemberDd(db, memberId, dd)
    console.log('[dd] member switched to Direct Debit:', memberId, dd.status)
  }
}

// mandate.updated — Bacs confirms (pending → active), refuses or the payer /
// bank later cancels the mandate.
export async function handleMandateUpdated(
  stripe: Stripe,
  db: SupabaseClient,
  mandate: Stripe.Mandate,
): Promise<void> {
  if (mandate.payment_method_details?.type !== 'bacs_debit') return
  const dd = {
    status: mandateToDdStatus(mandate),
    mandateId: mandate.id,
    reference: mandate.payment_method_details?.bacs_debit?.reference ?? null,
  }
  const paymentMethodId = idOf(mandate.payment_method as string | { id: string } | null)

  // Applications (pre-approval) — match on mandate id, else saved PM.
  const { error: appErr } = await db
    .from('membership_applications')
    .update({ direct_debit_status: dd.status, direct_debit_reference: dd.reference })
    .eq('stripe_mandate_id', mandate.id)
  if (appErr) console.warn('[dd] application mandate update failed:', appErr.message)
  if (paymentMethodId) {
    await db
      .from('membership_applications')
      .update({ stripe_mandate_id: mandate.id, direct_debit_status: dd.status })
      .eq('stripe_payment_method_id', paymentMethodId)
      .is('stripe_mandate_id', null)
  }

  // Members — match on mandate id; fall back to the payment method's
  // customer for members already marked as paying by Direct Debit.
  const memberIds = new Set<string>()
  const { data: byMandate } = await db
    .from('members')
    .select('id')
    .eq('stripe_mandate_id', mandate.id)
  for (const m of byMandate ?? []) memberIds.add(m.id as string)

  if (memberIds.size === 0 && paymentMethodId) {
    try {
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
      const customerId = idOf(pm.customer as string | { id: string } | null)
      if (customerId) {
        const { data: byCustomer } = await db
          .from('members')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .eq('stripe_payment_method_type', 'bacs_debit')
        for (const m of byCustomer ?? []) memberIds.add(m.id as string)
      }
    } catch (e) {
      console.warn('[dd] could not resolve mandate payment method:', e)
    }
  }

  for (const id of memberIds) await writeMemberDd(db, id, dd)
  console.log('[dd] mandate', mandate.id, '→', dd.status, 'members:', memberIds.size)
}

// checkout.session.async_payment_succeeded / _failed — a subscription-mode
// Checkout paid by Direct Debit (portal "Set up subscription" → Direct
// Debit). The initial payment row was written as `pending` on
// checkout.session.completed; settle it here.
export async function handleAsyncCheckoutPayment(
  db: SupabaseClient,
  session: Stripe.Checkout.Session,
  outcome: 'paid' | 'failed',
): Promise<void> {
  const { error } = await db
    .from('payments')
    .update(
      outcome === 'paid'
        ? { status: 'paid', paid_at: new Date().toISOString() }
        : { status: 'failed' },
    )
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
  if (error) console.error('[dd] async payment settle failed:', error.message)
  console.log('[dd] async checkout payment', outcome, session.id)
}

// invoice.paid / invoice.payment_failed — settle any `pending` row tied to
// this invoice (the first Direct Debit payment written by the approve flow).
// Only touches rows still `pending`, which card payments never are, and
// runs BEFORE the existing invoice handlers so their idempotency checks then
// see the (now settled) row and don't insert a duplicate.
export async function settlePendingInvoicePayment(
  db: SupabaseClient,
  invoice: Stripe.Invoice,
  outcome: 'paid' | 'failed',
): Promise<void> {
  if (!invoice.id) return
  const { error } = await db
    .from('payments')
    .update(
      outcome === 'paid'
        ? { status: 'paid', paid_at: new Date().toISOString(), amount_pence: invoice.amount_paid ?? undefined }
        : { status: 'failed' },
    )
    .eq('stripe_invoice_id', invoice.id)
    .eq('status', 'pending')
  if (error) console.error('[dd] pending invoice settle failed:', error.message)
}

// After the existing invoice handlers: tag the payment row with the Stripe
// method type when the invoice was collected by Direct Debit. Best-effort.
export async function tagInvoicePaymentMethodType(
  stripe: Stripe,
  db: SupabaseClient,
  invoice: Stripe.Invoice,
): Promise<void> {
  try {
    const piId = idOf(
      (invoice as unknown as { payment_intent?: string | { id: string } | null }).payment_intent,
    )
    if (!piId || !invoice.id) return
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['payment_method'] })
    const pm = pi.payment_method && typeof pi.payment_method === 'object' ? pi.payment_method : null
    if (pm?.type !== 'bacs_debit') return
    const { error } = await db
      .from('payments')
      .update({ stripe_payment_method_type: 'bacs_debit' })
      .eq('stripe_invoice_id', invoice.id)
    if (error) console.warn('[dd] payment method type not tagged:', error.message)
  } catch (e) {
    console.warn('[dd] could not tag invoice payment method type:', e)
  }
}

// checkout.session.completed, mode = 'subscription', paid by Direct Debit
// (metadata.payment_method_type = 'bacs_debit'): mark the member as paying
// by Direct Debit. The mandate id/status follow via mandate.updated (matched
// on customer).
export async function markMemberDirectDebitFromSubscriptionCheckout(
  db: SupabaseClient,
  memberId: string,
): Promise<void> {
  await writeMemberDd(db, memberId, { status: 'pending', mandateId: null, reference: null })
}
