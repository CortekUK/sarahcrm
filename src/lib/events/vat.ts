// Per-event VAT (events.vat_mode / vat_rate). 'included': the stored prices
// are what people pay. 'added': vat_rate % goes on top at checkout. Shared by
// the booking routes (what is charged), the event pages (what is shown) and
// the confirmation email, so all three always agree.

export type EventVatMode = 'included' | 'added'

export interface EventVatFields {
  vat_mode?: string | null
  vat_rate?: number | string | null
}

export function eventVat(e: EventVatFields | null | undefined): { mode: EventVatMode; rate: number } {
  const rate = Number(e?.vat_rate ?? 20)
  return {
    mode: e?.vat_mode === 'added' ? 'added' : 'included',
    rate: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 20,
  }
}

/** VAT to add on top of a net amount (0 when prices include VAT). */
export function vatOnTop(netPence: number, e: EventVatFields | null | undefined): number {
  const { mode, rate } = eventVat(e)
  if (mode !== 'added' || netPence <= 0) return 0
  return Math.round((netPence * rate) / 100)
}

/** What is actually charged for a net amount. */
export function withEventVat(netPence: number, e: EventVatFields | null | undefined): number {
  return netPence + vatOnTop(netPence, e)
}

/** Short label next to a price, e.g. "+ VAT (20%)", or '' when VAT is included. */
export function vatSuffix(e: EventVatFields | null | undefined): string {
  const { mode, rate } = eventVat(e)
  return mode === 'added' ? `+ VAT (${rate % 1 === 0 ? rate.toFixed(0) : rate}%)` : ''
}
