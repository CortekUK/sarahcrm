// Booking confirmation / receipt email for event bookings confirmed by the
// Next.js routes (member off-session charge, free booking, admin approval,
// Checkout sync). Built on the shared branded shell; every user-supplied
// value is escaped here because renderClubEmail paragraphs are raw HTML.
// Links use the fixed site URL, never request headers.

import { renderClubEmail, sendClubEmail } from '@/lib/email/club-email'
import { escapeHtml, getSiteUrl } from './server-helpers'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { eventVat } from '@/lib/events/vat'

const UK_TZ = 'Europe/London'

// The VAT inside a charged amount, when the event adds VAT on top
// (events.vat_mode = 'added'). Looked up here so every caller's receipt
// shows it without threading the event's VAT setting through each route.
async function vatInside(eventId: string, grossPence: number): Promise<{ rate: number; pence: number } | null> {
  if (grossPence <= 0) return null
  try {
    const db = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data } = await db.from('events').select('vat_mode, vat_rate').eq('id', eventId).maybeSingle()
    const { mode, rate } = eventVat(data)
    if (mode !== 'added' || rate <= 0) return null
    return { rate, pence: grossPence - Math.round(grossPence / (1 + rate / 100)) }
  } catch {
    return null
  }
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: UK_TZ,
    }).format(new Date(iso)) + ' (UK time)'
  } catch {
    return null
  }
}

export async function sendBookingConfirmationEmail(args: {
  to: string
  firstName: string | null | undefined
  eventId: string
  eventTitle: string | null | undefined
  startDate?: string | null
  venueName?: string | null
  amountPence: number
  /** 'charged' = paid now; 'held' = request received, card saved, not charged; 'free' = complimentary. */
  kind: 'charged' | 'held' | 'free' | 'free_pending'
  isGuest?: boolean
  memberId?: string | null
}): Promise<void> {
  try {
    const title = escapeHtml(args.eventTitle || 'the event')
    const first = escapeHtml((args.firstName || 'there').split(' ')[0])
    const when = formatDate(args.startDate)
    const vat = args.kind === 'charged' || args.kind === 'held' ? await vatInside(args.eventId, args.amountPence) : null
    const amount =
      `£${(args.amountPence / 100).toFixed(2)}` +
      (vat ? ` (includes VAT at ${vat.rate}%: £${(vat.pence / 100).toFixed(2)})` : '')
    const details: string[] = []
    if (when) details.push(`<strong style="color:#2C2825;">When:</strong> ${escapeHtml(when)}`)
    if (args.venueName) details.push(`<strong style="color:#2C2825;">Where:</strong> ${escapeHtml(args.venueName)}`)
    if (args.kind === 'charged') details.push(`<strong style="color:#2C2825;">Amount paid:</strong> ${amount}`)
    if (args.kind === 'held') details.push(`<strong style="color:#2C2825;">Amount (not yet charged):</strong> ${amount}`)

    const pending = args.kind === 'held' || args.kind === 'free_pending'
    const lead =
      args.kind === 'charged'
        ? `Your place at <strong style="color:#2C2825;">${title}</strong> is confirmed and your payment has been received.`
        : args.kind === 'held'
          ? `We've received your request for <strong style="color:#2C2825;">${title}</strong>. Your card is saved but <strong style="color:#2C2825;">nothing has been charged</strong> — we'll only charge it if your place is confirmed.`
          : args.kind === 'free_pending'
            ? `We've received your request for <strong style="color:#2C2825;">${title}</strong>. We'll confirm your place shortly.`
            : `Your complimentary place at <strong style="color:#2C2825;">${title}</strong> is confirmed.`

    const site = getSiteUrl()
    const html = renderClubEmail({
      eyebrow: pending ? 'Booking request' : 'Booking confirmed',
      heading: pending ? `Request received for ${title}` : `You're confirmed for ${title}`,
      paragraphs: [
        `Hello ${first},`,
        lead,
        ...(details.length ? [details.join('<br/>')] : []),
        `We'll be in touch with the practicalities closer to the date.`,
      ],
      cta: args.isGuest
        ? undefined
        : { url: `${site}/portal/events/${args.eventId}`, label: 'View in your portal' },
    })
    const plainTitle = args.eventTitle || 'the event'
    await sendClubEmail({
      to: args.to,
      subject: pending ? `Request received for ${plainTitle}` : `You're confirmed for ${plainTitle}`,
      html,
      category: 'booking_confirmation',
      memberId: args.memberId ?? null,
    })
  } catch (e) {
    console.error('[booking-email] failed:', e)
  }
}
