// UK Direct Debit through Stripe (Bacs Direct Debit).
//
// The client asked for GoCardless; instead Direct Debit is offered as an
// ADDITIONAL Stripe payment method (`bacs_debit`) next to card. Nothing about
// the card / invoice flows changes. Stripe hosts the mandate confirmation
// page and sends the legally required Bacs emails (mandate confirmation +
// advance debit notices), so the app never has to.
//
// Storage (additive — see supabase/migrations/20261016_stripe_bacs_direct_debit.sql):
//   payments.payment_method stays 'stripe' (Stripe is still the processor);
//   the new payments.stripe_payment_method_type says 'card' | 'bacs_debit'.
//   members / membership_applications get stripe_payment_method_type,
//   stripe_mandate_id, direct_debit_status, direct_debit_reference.
//   The existing members.direct_debit_active boolean is kept in sync
//   (true only while the mandate is active). The GoCardless columns and the
//   `gocardless` enum value are left untouched.
//
// Feature flag: NEXT_PUBLIC_STRIPE_BACS_DEBIT_ENABLED=true turns the option on.
// Until it is set (i.e. until Bacs Debit is activated in the Stripe
// Dashboard) every flow behaves exactly as before and the option is hidden.
//
// NOTE: supabase/functions/stripe-webhook (Deno) cannot import this file, so
// it carries an inline copy of mandateToDirectDebitStatus — keep them in step.

export type StripePaymentMethodType = 'card' | 'bacs_debit'

/** Our view of a Bacs mandate. */
export type DirectDebitStatus = 'pending' | 'active' | 'failed' | 'inactive'

export const DIRECT_DEBIT_LABEL = 'Direct Debit (UK bank account)'
export const DIRECT_DEBIT_TIMING_COPY = 'Payments take 3–5 working days to process.'

/** Is the Direct Debit option switched on for this environment? */
export function isDirectDebitEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STRIPE_BACS_DEBIT_ENABLED === 'true'
}

/**
 * Spread into stripe.checkout.sessions.create() params for checkouts that
 * must stay instant (event tickets). Those sessions use Stripe's dynamic
 * payment methods, so once Bacs is activated in the Dashboard Stripe could
 * start offering it there. When Direct Debit is enabled this excludes ONLY
 * bacs_debit; every other method is untouched. When disabled it returns {}
 * so the params are byte-for-byte what they were before.
 */
export function excludeDirectDebitFromInstantCheckout(): {
  excluded_payment_method_types?: Array<'bacs_debit'>
} {
  return isDirectDebitEnabled() ? { excluded_payment_method_types: ['bacs_debit'] } : {}
}

/** Minimal shape of a Stripe Mandate we read (kept structural so tests can mock it). */
export interface MandateLike {
  status: 'active' | 'inactive' | 'pending'
  payment_method_details?: {
    bacs_debit?: {
      network_status?: 'accepted' | 'pending' | 'refused' | 'revoked'
      reference?: string | null
    } | null
  } | null
}

/**
 * Map a Stripe Bacs mandate to our status:
 *   network refused            → failed  (bank rejected the mandate)
 *   network revoked / inactive → inactive (cancelled by payer/bank later)
 *   active                     → active
 *   otherwise                  → pending (Bacs takes ~3 working days to confirm)
 */
export function mandateToDirectDebitStatus(m: MandateLike): DirectDebitStatus {
  const network = m.payment_method_details?.bacs_debit?.network_status
  if (network === 'refused') return 'failed'
  if (network === 'revoked') return 'inactive'
  if (m.status === 'active') return 'active'
  if (m.status === 'inactive') return 'inactive'
  return 'pending'
}

export function mandateReference(m: MandateLike): string | null {
  return m.payment_method_details?.bacs_debit?.reference ?? null
}

export const DIRECT_DEBIT_STATUS_LABEL: Record<DirectDebitStatus, string> = {
  pending: 'Direct Debit pending',
  active: 'Direct Debit active',
  failed: 'Direct Debit failed',
  inactive: 'Direct Debit cancelled',
}

export function isDirectDebitStatus(v: unknown): v is DirectDebitStatus {
  return v === 'pending' || v === 'active' || v === 'failed' || v === 'inactive'
}
