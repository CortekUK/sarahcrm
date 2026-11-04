// Server-only helpers shared by the payment / booking / application routes
// (/api/events/*, /api/admin/bookings/decision, /api/membership-application/*,
// /api/admin/applications/*). Not imported by any browser code.

import type { SupabaseClient } from '@supabase/supabase-js'

// Fixed public site URL for every link we put in an email or hand to Stripe
// as a success/cancel URL. NEVER derive these from the request's Origin /
// Host headers — they are attacker-controlled, so a forged Origin would put
// a phishing link inside an email sent from the Club's own domain.
export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL || 'https://sarahcrm.vercel.app'
  return raw.trim().replace(/\/+$/, '')
}

// Escape user-supplied text before interpolating it into email HTML
// (renderClubEmail paragraphs are raw HTML).
export function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Unpaid Checkout holds ────────────────────────────────────────────
// A booking sent to Stripe Checkout is pre-created as `pending` and tagged
// with this charge_error marker. If Checkout is abandoned the row would
// otherwise hold a seat forever (and block the person from rebooking), so:
//   • the Checkout Session is created with expires_at = now + 30 min, and
//   • any booking still carrying the marker after CHECKOUT_HOLD_MINUTES is
//     released (cancelled) before capacity / duplicate checks run.
// The hold window is longer than the session lifetime, so a session can
// never be paid after its seat was released. sync / webhook clear the
// marker once Stripe confirms payment or the card is saved.
export const AWAITING_CHECKOUT = 'Awaiting Stripe Checkout'
export const CHECKOUT_SESSION_MINUTES = 30 // Stripe minimum for expires_at
export const CHECKOUT_HOLD_MINUTES = 35

export function checkoutExpiresAt(): number {
  return Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_MINUTES * 60 + 30
}

export async function releaseAbandonedCheckouts(
  admin: SupabaseClient,
  eventId: string,
): Promise<void> {
  const cutoff = new Date(Date.now() - CHECKOUT_HOLD_MINUTES * 60 * 1000).toISOString()
  const { data: released, error } = await admin
    .from('bookings')
    .update({ status: 'cancelled', charge_error: 'Checkout not completed — seat released.' })
    .eq('event_id', eventId)
    .eq('status', 'pending')
    .eq('charge_error', AWAITING_CHECKOUT)
    .lt('updated_at', cutoff)
    .select('id')
  if (error) {
    console.warn('[bookings] could not release abandoned checkouts:', error.message)
    return
  }
  // Put any invitation that was flipped to confirmed by the abandoned
  // booking back to 'invited'.
  const ids = (released ?? []).map((b: { id: string }) => b.id)
  if (ids.length > 0) {
    await admin
      .from('event_invitations')
      .update({ status: 'invited', booking_id: null, responded_at: null })
      .in('booking_id', ids)
      .eq('status', 'confirmed')
  }
}

// Seats taken = sum of (1 + guests_invited) over active bookings — the same
// rule the bookings BEFORE INSERT trigger enforces atomically.
export async function seatsTaken(
  admin: SupabaseClient,
  eventId: string,
  opts: { guestOnly?: boolean; excludeBookingId?: string; statuses?: string[] } = {},
): Promise<number> {
  let q = admin
    .from('bookings')
    .select('id, guests_invited')
    .eq('event_id', eventId)
    .in('status', opts.statuses ?? ['confirmed', 'pending'])
  if (opts.guestOnly) q = q.eq('is_guest', true)
  if (opts.excludeBookingId) q = q.neq('id', opts.excludeBookingId)
  const { data } = await q
  return (data ?? []).reduce(
    (n: number, b: { guests_invited: number | null }) => n + 1 + (b.guests_invited ?? 0),
    0,
  )
}

// Map the bookings-trigger errors (P0001, message prefixed with a token) to
// clean 409 responses. Returns null for any other error.
export function bookingDbError(
  err: { code?: string; message?: string } | null | undefined,
): { status: number; error: string } | null {
  if (!err) return null
  const msg = err.message ?? ''
  if (msg.startsWith('DUPLICATE_BOOKING') || err.code === '23505') {
    return { status: 409, error: 'There is already a booking for this event.' }
  }
  if (msg.startsWith('EVENT_FULL')) {
    return { status: 409, error: 'This event is fully booked.' }
  }
  if (err.code === 'P0001') {
    return { status: 409, error: 'This booking is not allowed.' }
  }
  return null
}

// Plain email shape check (one @, a dot in the domain, and none of the
// characters that would break a PostgREST filter: spaces , ; ( ) * % \ < > ").
export function isValidEmail(email: string): boolean {
  return (
    email.length <= 254 &&
    /^[^\s@,;()*%\\<>"]+@[^\s@,;()*%\\<>"]+\.[^\s@,;()*%\\<>"]+$/.test(email)
  )
}

// Strip control characters (incl. NUL, which Postgres text rejects → 500)
// and cap the length of free-text input.
export function cleanText(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  return s ? s.slice(0, max) : null
}
