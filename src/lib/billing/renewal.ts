// Tiny helper for working out the next renewal date based on a
// purchase timestamp + billing cadence.
//
// Used by the membership-application approve flow and the Stripe
// webhook so the member's `renewal_date` lines up with what Stripe
// will charge next — monthly cadence renews 1 month after the
// purchase, annual renews 1 year after.
//
// Stripe is still the authoritative source for the date on each
// invoice.paid event (we update from `current_period_end` then). This
// helper just gives us a sensible value at signup time so the
// Subscription card on /dashboard/members/[id] doesn't show "—" while
// we wait for the first recurring invoice.

export type Cadence = 'monthly' | 'annual'

/**
 * @param paidAtIso  ISO timestamp of the initial payment. Falls back
 *                   to `new Date()` if missing.
 * @param cadence    'monthly' (default) or 'annual'.
 * @returns          ISO timestamp of the next renewal.
 */
export function computeNextRenewal(
  paidAtIso: string | null | undefined,
  cadence: Cadence | string | null | undefined,
): string {
  const base = paidAtIso ? new Date(paidAtIso) : new Date()
  // Guard against invalid date strings — fall back to now.
  if (isNaN(base.getTime())) {
    return computeNextRenewal(new Date().toISOString(), cadence)
  }
  const out = new Date(base)
  if (cadence === 'annual') {
    out.setFullYear(out.getFullYear() + 1)
  } else {
    // Default to monthly — matches Stripe's default subscription cadence.
    out.setMonth(out.getMonth() + 1)
  }
  return out.toISOString()
}
