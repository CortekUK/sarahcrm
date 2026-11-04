// Shared, server-safe formatting for event cards and pages (UK time).
import { UK_TIME_ZONE } from '@/lib/utils'

export function formatDateLongUk(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: UK_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatTimeUk(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: UK_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ukDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: UK_TIME_ZONE })
}

/** "4 – 7 December 2026" for multi-day events, else the single date. */
export function formatDateRange(start: string, end: string | null) {
  if (!end || ukDay(start) === ukDay(end)) return formatDateLongUk(start)
  return `${formatDateLongUk(start)} – ${formatDateLongUk(end)}`
}

export function gbp(pence: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(pence / 100)
}

/**
 * "Members included · Guests £500 + VAT" / "Members · Guests by invitation".
 * Prices are net; "+ VAT" whenever the event adds VAT at checkout.
 */
export function eventPriceLine(ev: {
  member_price_pence: number | null
  guest_price_pence: number | null
  booking_status?: string | null
  vat_mode?: string | null
}) {
  const vat = ev.vat_mode === 'added' ? ' + VAT' : ''
  const member = ev.member_price_pence ?? 0
  const guest = ev.guest_price_pence ?? 0
  const m = member > 0 ? `Members ${gbp(member)}${vat}` : 'Members included'
  const g =
    ev.booking_status === 'invitation_only'
      ? 'Guests by invitation'
      : guest > 0
        ? `Guests ${gbp(guest)}${vat}`
        : null
  return [m, g].filter(Boolean).join(' · ')
}

