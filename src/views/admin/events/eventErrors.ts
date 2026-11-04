// Shared helpers for the admin events screens: readable database errors and
// UK-time conversion for the date pickers.

import { UK_TIME_ZONE } from '@/lib/utils'

// Constraint / index names → what the admin should be told.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  events_dates_order_check: 'The end date & time must be after the start.',
  events_guest_capacity_check: 'Guest spots can’t be more than the total capacity.',
  events_non_negative_check: 'Prices and capacity can’t be negative.',
  events_slug_format_check:
    'The web address (slug) may only use lower-case letters, numbers and single hyphens, e.g. summer-party-2026.',
  events_title_present_check: 'The title must be between 1 and 300 characters.',
  events_slug_key: 'This web address (slug) is already used by another event — choose a different one.',
}

// Rule tokens raised by database triggers ("EVENT_HAS_PAYMENTS: …").
const TOKEN_MESSAGES: Record<string, string> = {
  EVENT_HAS_PAYMENTS:
    'This event has paid bookings, so it can’t be deleted. Cancel the event instead (and handle any refunds in Stripe).',
  CHECKIN_NOT_CONFIRMED: 'Only confirmed bookings can be checked in.',
  DUPLICATE_BOOKING: 'This guest already has a booking for this event.',
  EVENT_FULL: 'This event is fully booked.',
}

type DbErr = { message?: string; code?: string; details?: string } | null | undefined

export function eventErrorMessage(err: unknown, fallback = 'Something went wrong — please try again.'): string {
  const e = (err && typeof err === 'object' ? err : { message: typeof err === 'string' ? err : '' }) as DbErr
  const msg = (e?.message ?? '').trim()
  const haystack = `${msg} ${e?.details ?? ''}`

  const token = /^\s*([A-Z][A-Z0-9_]{2,}):\s*(.*)$/s.exec(msg)
  if (token) {
    if (TOKEN_MESSAGES[token[1]]) {
      // Keep the database's own detail for check-in ("this one is cancelled").
      if (token[1] === 'CHECKIN_NOT_CONFIRMED') {
        const rest = token[2].trim()
        return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : TOKEN_MESSAGES[token[1]]
      }
      return TOKEN_MESSAGES[token[1]]
    }
    const rest = token[2].trim()
    if (rest) return rest.charAt(0).toUpperCase() + rest.slice(1)
  }

  for (const [name, text] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (haystack.includes(name)) return text
  }
  if (e?.code === '23505') return 'This already exists — something with the same details is already saved.'
  if (e?.code === '23514') return 'One of the values isn’t allowed — please check the form.'
  return msg || fallback
}

// ── UK time ────────────────────────────────────────────────────────────
// The date pickers work in "YYYY-MM-DDTHH:mm" strings. Those are UK wall-clock
// times whatever time zone the admin's laptop is in.

function ukParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') }
}

// ISO instant → "YYYY-MM-DDTHH:mm" in UK time ('' when empty/invalid).
export function isoToUkLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = ukParts(d)
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.min}`
}

// "YYYY-MM-DDTHH:mm" typed as UK time → ISO instant (null when empty/invalid).
export function ukLocalToIso(local: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local ?? '')
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  // Offset of London at (roughly) that moment; re-check once for DST edges.
  let guess = asUtc
  for (let i = 0; i < 2; i++) {
    const p = ukParts(new Date(guess))
    const shown = Date.UTC(+p.y, +p.m - 1, +p.d, +p.h, +p.min)
    guess = guess + (asUtc - shown)
  }
  return new Date(guess).toISOString()
}
