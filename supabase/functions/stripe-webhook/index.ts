import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { corsHeaders } from '../_shared/cors.ts'
import {
  BACS_SESSION_KINDS,
  handleAsyncCheckoutPayment,
  handleBacsSetupSessionCompleted,
  handleMandateUpdated,
  markMemberDirectDebitFromSubscriptionCheckout,
  settlePendingInvoicePayment,
  tagInvoicePaymentMethodType,
} from './direct-debit.ts'

// ─────────────────────────────────────────────────────────────────────
// Resend — transactional email
// ─────────────────────────────────────────────────────────────────────
// Lightweight helper so we don't need the Resend SDK on Deno (extra
// dependency, slower cold start). Posts directly to the REST API.
async function sendResendEmail(opts: {
  to: string
  from: string
  subject: string
  html: string
  text?: string
}): Promise<{ id: string | null; error: string | null }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping send')
    return { id: null, error: 'RESEND_API_KEY not configured' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(opts),
    })
    const json = await res.json()
    if (!res.ok) {
      console.error('[email] Resend rejected:', json)
      return { id: null, error: json?.message ?? `HTTP ${res.status}` }
    }
    return { id: json?.id ?? null, error: null }
  } catch (err) {
    console.error('[email] Resend fetch failed:', err)
    return { id: null, error: err instanceof Error ? err.message : 'send failed' }
  }
}

function formatGBP(pence: number): string {
  if (pence === 0) return 'Complimentary'
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
    }).format(pence / 100)
  } catch {
    return `£${(pence / 100).toFixed(2)}`
  }
}

function formatEventDate(iso: string | null): string {
  if (!iso) return 'TBC'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatEventTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

// Branded confirmation email — kept inline because the webhook is the
// only consumer. When sarahcrm grows a "transactional templates" system,
// migrate this to render from email_templates with merge tags.
function renderBookingConfirmationHtml(opts: {
  firstName: string
  eventTitle: string
  eventDate: string
  eventTime: string
  venueName: string
  amount: string
  bookingId: string
  portalUrl: string
  /** Card saved but not charged (approval-required event). */
  held?: boolean
  /** Guests have no portal — omit the button. */
  hidePortalButton?: boolean
}): string {
  const { firstName, eventTitle, eventDate, eventTime, venueName, amount, bookingId, portalUrl } = opts
  const held = opts.held === true
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Georgia,'Playfair Display',serif;background:#F7F5F0;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F7F5F0;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#fff;margin:32px auto;">
        <tr><td style="background:#FAFAF7;padding:32px 24px 20px;text-align:center;border-bottom:1px solid #E5E0D8;">
          <div style="font-size:26px;font-weight:600;color:#2C2825;letter-spacing:0.5px;">The Club</div>
          <div style="font-family:'Montserrat',Arial,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.25em;color:#6B6560;margin-top:4px;">by Sarah Restrick</div>
        </td></tr>
        <tr><td style="padding:32px 28px 8px;">
          <p style="margin:0 0 16px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#B8975A;">${held ? 'Request Received' : 'Booking Confirmed'}</p>
          <h1 style="margin:0 0 16px;font-size:26px;font-weight:400;color:#2C2825;line-height:1.2;">${held ? `Thank you, ${escapeHtml(firstName)}.` : `Your spot is secured, ${escapeHtml(firstName)}.`}</h1>
          <p style="margin:0 0 24px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.7;color:#2C2825;">
            ${held
              ? `We've received your request for <strong>${escapeHtml(eventTitle)}</strong>. Your card is saved but <strong>nothing has been charged</strong> — we'll only charge it if your place is confirmed.`
              : `Thank you for booking your place at <strong>${escapeHtml(eventTitle)}</strong>. We're looking forward to having you with us.`}
          </p>
        </td></tr>
        <tr><td style="padding:0 28px 28px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F7F5F0;border-radius:8px;">
            <tr><td style="padding:18px 22px;">
              <p style="margin:0 0 4px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#A09A93;">Event</p>
              <p style="margin:0;font-size:18px;color:#2C2825;">${escapeHtml(eventTitle)}</p>
            </td></tr>
            <tr><td style="padding:0 22px 18px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="50%" valign="top" style="padding-right:8px;">
                    <p style="margin:0 0 4px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#A09A93;">Date</p>
                    <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#2C2825;">${escapeHtml(eventDate)}${eventTime ? ` · ${escapeHtml(eventTime)}` : ''}</p>
                  </td>
                  <td width="50%" valign="top" style="padding-left:8px;">
                    <p style="margin:0 0 4px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#A09A93;">Venue</p>
                    <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#2C2825;">${escapeHtml(venueName || 'TBC')}</p>
                  </td>
                </tr>
              </table>
            </td></tr>
            <tr><td style="padding:0 22px 18px;border-top:1px solid #E5E0D8;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding-top:14px;">
                    <p style="margin:0 0 4px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#A09A93;">${held ? 'Amount (not yet charged)' : 'Amount Paid'}</p>
                    <p style="margin:0;font-size:18px;color:#B8975A;font-weight:600;">${escapeHtml(amount)}</p>
                  </td>
                  <td align="right" style="padding-top:14px;">
                    <p style="margin:0 0 4px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#A09A93;">Reference</p>
                    <p style="margin:0;font-family:'JetBrains Mono','Courier New',monospace;font-size:12px;color:#6B6560;">${escapeHtml(bookingId.slice(0, 8))}</p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        ${opts.hidePortalButton ? '' : `<tr><td align="center" style="padding:8px 28px 32px;">
          <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#B8975A;color:#fff;text-decoration:none;padding:14px 32px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;letter-spacing:0.15em;text-transform:uppercase;">View in your portal</a>
        </td></tr>`}
        <tr><td style="padding:0 28px 32px;">
          <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;line-height:1.7;color:#6B6560;">
            If you need to make a change to your booking or have any questions, please reply to this email — we'll be in touch personally.
          </p>
          <p style="margin:20px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;line-height:1.7;color:#2C2825;">
            Warm regards,<br/>
            <span style="color:#B8975A;font-family:Georgia,'Playfair Display',serif;font-size:18px;">Sarah Restrick</span><br/>
            <span style="font-size:12px;color:#6B6560;">Founder, The Club</span>
          </p>
        </td></tr>
        <tr><td style="background:#F3F0EA;padding:18px 28px;text-align:center;">
          <p style="margin:0;font-family:Georgia,'Playfair Display',serif;font-size:13px;color:#6B6560;">The Club by Sarah Restrick</p>
          <p style="margin:6px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:#A09A93;">A private membership community</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function escapeHtml(s: string): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Subscription / membership welcome email — sent on the first
// subscription.completed event. Kept lighter than the booking one
// because it's an introductory note, not a transactional confirmation.
function renderMembershipWelcomeHtml(firstName: string, portalUrl: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Georgia,serif;background:#F7F5F0;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F7F5F0;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#fff;margin:32px auto;">
        <tr><td style="background:#FAFAF7;padding:32px 24px 20px;text-align:center;border-bottom:1px solid #E5E0D8;">
          <div style="font-size:26px;font-weight:600;color:#2C2825;">The Club</div>
          <div style="font-family:'Montserrat',Arial,sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.25em;color:#6B6560;margin-top:4px;">by Sarah Restrick</div>
        </td></tr>
        <tr><td style="padding:32px 28px;">
          <p style="margin:0 0 16px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#B8975A;">Welcome</p>
          <h1 style="margin:0 0 16px;font-size:28px;font-weight:400;color:#2C2825;">${escapeHtml(firstName)}, welcome to The Club.</h1>
          <p style="margin:0 0 16px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.7;color:#2C2825;">
            Your membership is active. You can now browse upcoming events, accept introductions, and book your place at any of our gatherings — all from your member portal.
          </p>
          <p style="margin:24px 0 0;text-align:center;">
            <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#B8975A;color:#fff;text-decoration:none;padding:14px 32px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;letter-spacing:0.15em;text-transform:uppercase;">Enter your portal</a>
          </p>
          <p style="margin:32px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;line-height:1.7;color:#6B6560;">
            I'll be in touch shortly to find out a little more about you and start matching you with members worth meeting.
          </p>
          <p style="margin:20px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;line-height:1.7;color:#2C2825;">
            Warm regards,<br/>
            <span style="color:#B8975A;font-family:Georgia,serif;font-size:18px;">Sarah Restrick</span>
          </p>
        </td></tr>
        <tr><td style="background:#F3F0EA;padding:18px 28px;text-align:center;">
          <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:#6B6560;">The Club by Sarah Restrick</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function fromAddress(): string {
  // Prefer the verified RESEND_FROM_EMAIL; fall back to FROM_EMAIL.
  const fromEmail =
    Deno.env.get('RESEND_FROM_EMAIL') ?? Deno.env.get('FROM_EMAIL') ?? 'onboarding@resend.dev'
  const fromName = Deno.env.get('RESEND_FROM_NAME') ?? 'The Club'
  return `${fromName} <${fromEmail}>`
}

// Fixed site URL setting (never request headers) for every emailed link.
function siteUrl(): string {
  return (Deno.env.get('SITE_URL') ?? 'http://localhost:3001').replace(/\/+$/, '')
}

// Internal alert to every admin profile. Best-effort — never fails the
// webhook. All interpolated values must already be escaped by the caller.
// deno-lint-ignore no-explicit-any
async function notifyAdminsWebhook(db: any, subject: string, lines: string[]): Promise<void> {
  try {
    const { data } = await db.from('profiles').select('email').eq('role', 'admin')
    const emails = ((data ?? []) as { email: string | null }[])
      .map((p) => p.email)
      .filter((e): e is string => !!e)
    if (emails.length === 0) return
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;font-family:'DM Sans',Arial,sans-serif;background:#F7F5F0;color:#2C2825;">
<div style="max-width:600px;margin:0 auto;background:#fff;padding:28px;">
<p style="margin:0 0 16px;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#B8975A;">The Club · admin</p>
${lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;">${l}</p>`).join('\n')}
<p style="margin:20px 0 0;"><a href="${escapeHtml(siteUrl())}/dashboard/bookings" style="display:inline-block;background:#B8975A;color:#fff;text-decoration:none;padding:12px 26px;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;">Open dashboard</a></p>
</div></body></html>`
    await Promise.all(
      emails.map((to) => sendResendEmail({ from: fromAddress(), to, subject, html })),
    )
  } catch (e) {
    console.error('[notifyAdminsWebhook] failed:', e)
  }
}

// Booking row shape used by the event-booking branch.
const BOOKING_SELECT =
  'id, status, amount_pence, member_id, is_guest, guest_name, guest_email, guests_invited, accommodation_booked, stripe_payment_intent_id, events(id, title, venue_name, start_date), members(profiles:profile_id(first_name, email))'
type BookingRow = {
  id: string
  status: string
  amount_pence: number | null
  member_id: string | null
  is_guest: boolean
  guest_name: string | null
  guest_email: string | null
  guests_invited: number | null
  accommodation_booked: boolean | null
  stripe_payment_intent_id: string | null
  events: { id: string; title: string; venue_name: string | null; start_date: string | null } | null
  members: { profiles: { first_name: string | null; email: string | null } | null } | null
}
// Must match AWAITING_CHECKOUT in src/lib/stripe/server-helpers.ts.
const AWAITING_CHECKOUT = 'Awaiting Stripe Checkout'

// deno-lint-ignore no-explicit-any
function one<T>(v: any): T | null {
  return (Array.isArray(v) ? v[0] : v) ?? null
}

// Confirmation (or "request received" for a held card) to the booker, plus
// an admin alert. Called only by whoever won the booking state transition.
// deno-lint-ignore no-explicit-any
async function sendBookingEmails(db: any, b: BookingRow, amountPence: number, held: boolean) {
  const ev = one<BookingRow['events']>(b.events)
  const prof = one<{ first_name: string | null; email: string | null }>(one<{ profiles: unknown }>(b.members)?.profiles)
  const to = b.is_guest ? b.guest_email : (prof?.email ?? b.guest_email)
  const firstName = (b.is_guest ? b.guest_name : prof?.first_name) || 'there'
  const title = ev?.title ?? 'the event'

  await notifyAdminsWebhook(db, `${b.is_guest ? 'New guest booking' : 'New member booking'} — ${title}`, [
    `<strong>${escapeHtml(b.is_guest ? (b.guest_name || 'A guest') : 'A member')}</strong> booked <strong>${escapeHtml(title)}</strong>${b.accommodation_booked ? ' (with accommodation)' : ''}${(b.guests_invited ?? 0) > 0 ? ' and is bringing a guest' : ''}.`,
    held
      ? 'Their card is held — approve the booking in the dashboard to charge it.'
      : `Payment of ${escapeHtml(formatGBP(amountPence))} has been received and the booking is confirmed.`,
  ])

  if (!to || !ev) return
  try {
    const html = renderBookingConfirmationHtml({
      firstName: firstName.split(' ')[0],
      eventTitle: ev.title,
      eventDate: formatEventDate(ev.start_date),
      eventTime: formatEventTime(ev.start_date),
      venueName: ev.venue_name ?? 'TBC',
      amount: formatGBP(amountPence),
      bookingId: b.id,
      portalUrl: `${siteUrl()}/portal/events/${ev.id}/confirmation?booking_id=${b.id}`,
      held,
      hidePortalButton: b.is_guest,
    })
    const subject = held ? `Request received for ${ev.title}` : `Your spot at ${ev.title} is confirmed`
    const { id: resendId, error: emailErr } = await sendResendEmail({ from: fromAddress(), to, subject, html })
    if (emailErr) console.error('[email] booking confirmation send failed:', emailErr)
    if (b.member_id) {
      await db.from('communications').insert({
        member_id: b.member_id,
        template_name: 'booking_confirmation',
        channel: 'email',
        subject,
        body_preview: `Your booking at ${ev.title} on ${formatEventDate(ev.start_date)} is ${held ? 'received' : 'confirmed'}.`,
        status: emailErr ? 'failed' : 'sent',
        sent_at: emailErr ? null : new Date().toISOString(),
        resend_message_id: resendId,
      })
    }
    await db.from('email_log').insert({
      to_email: to,
      subject,
      html,
      category: 'booking_confirmation',
      status: emailErr ? 'failed' : 'sent',
      error: emailErr ?? null,
      resend_message_id: resendId,
      member_id: b.member_id,
    })
  } catch (e) {
    console.error('[email] booking confirmation pipeline error:', e)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-12-18.acacia',
    })

    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return new Response('Missing stripe-signature header', { status: 400 })
    }

    const body = await req.text()
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      )
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return new Response('Invalid signature', { status: 400 })
    }

    // Admin client — no user context needed
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ── Direct Debit (Stripe Bacs) — additive, see ./direct-debit.ts ──
    // Only Direct Debit objects are handled here; everything else falls
    // through to the existing handlers below unchanged.
    if (event.type === 'checkout.session.completed') {
      const ddSession = event.data.object as Stripe.Checkout.Session
      const ddKind = ddSession.metadata?.kind ?? ''
      if (
        ddSession.mode === 'setup' &&
        (BACS_SESSION_KINDS as readonly string[]).includes(ddKind)
      ) {
        await handleBacsSetupSessionCompleted(stripe, supabaseAdmin, ddSession)
        return new Response(JSON.stringify({ received: true, direct_debit: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    if (event.type === 'mandate.updated') {
      await handleMandateUpdated(stripe, supabaseAdmin, event.data.object as Stripe.Mandate)
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (
      event.type === 'checkout.session.async_payment_succeeded' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      await handleAsyncCheckoutPayment(
        supabaseAdmin,
        event.data.object as Stripe.Checkout.Session,
        event.type === 'checkout.session.async_payment_succeeded' ? 'paid' : 'failed',
      )
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (event.type === 'invoice.paid') {
      await settlePendingInvoicePayment(supabaseAdmin, event.data.object as Stripe.Invoice, 'paid')
    }
    if (event.type === 'invoice.payment_failed') {
      await settlePendingInvoicePayment(supabaseAdmin, event.data.object as Stripe.Invoice, 'failed')
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      if (session.mode === 'subscription') {
        // ── Subscription checkout ──
        // Two flows hit this branch:
        //   A) Existing member upgrades / re-subscribes → metadata.member_id
        //   B) Public application + pay flow → metadata.application_id
        //      (no member exists yet — they're still under admin review).
        // We handle both: A links the sub to the member directly; B saves
        // the sub IDs onto the application row so the approve flow can
        // copy them to the new member when admin clicks Approve.
        const { member_id, application_id, cadence } = session.metadata ?? {}
        if (!member_id && !application_id) {
          console.error(
            'Missing member_id and application_id on subscription checkout:',
            session.id,
          )
          return new Response('Missing metadata', { status: 400 })
        }

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id ?? null
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id ?? null
        const amountPence = session.amount_total ?? 0
        const paidAt = new Date().toISOString()
        // Direct Debit (Bacs) checkouts complete with payment_status
        // 'unpaid' — the debit clears days later
        // (checkout.session.async_payment_succeeded / _failed settle it).
        // Cards complete as 'paid', so for them this is exactly 'paid'.
        const initialPaymentStatus = session.payment_status === 'unpaid' ? 'pending' : 'paid'
        const initialPaidAt = initialPaymentStatus === 'paid' ? paidAt : null

        // Compute the next renewal date from cadence so the Subscription
        // card has a sensible value immediately. The next invoice.paid
        // event will refresh this from Stripe's authoritative
        // current_period_end. Done inline (not via shared helper) because
        // the webhook is a Deno edge function and imports differ.
        function nextRenewal(iso: string, cad: string | undefined): string {
          const d = new Date(iso)
          if (cad === 'annual') d.setFullYear(d.getFullYear() + 1)
          else d.setMonth(d.getMonth() + 1)
          return d.toISOString()
        }
        const renewalDate = nextRenewal(paidAt, cadence)

        // Flow B — application paid before member exists. Persist the
        // Stripe ids on the app row so the eventual approve flow can
        // attach them to the provisioned member.
        if (application_id && !member_id) {
          const { error: appUpdErr } = await supabaseAdmin
            .from('membership_applications')
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              paid_at: paidAt,
              amount_paid_pence: amountPence,
            })
            .eq('id', application_id)
          if (appUpdErr) {
            console.error('Failed to update application after payment:', appUpdErr)
            return new Response('Failed to update application', { status: 500 })
          }

          // If a member ALREADY exists for this email (e.g. admin
          // pre-provisioned, or re-application), link the sub to them
          // and record the payment now.
          const { data: app } = await supabaseAdmin
            .from('membership_applications')
            .select('email')
            .eq('id', application_id)
            .single()
          if (app?.email) {
            const { data: existingMember } = await supabaseAdmin
              .from('members')
              .select('id')
              .eq(
                'profile_id',
                (
                  await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('email', app.email)
                    .maybeSingle()
                ).data?.id ?? '__none__',
              )
              .maybeSingle()

            if (existingMember) {
              await supabaseAdmin
                .from('members')
                .update({
                  stripe_customer_id: customerId,
                  stripe_subscription_id: subscriptionId,
                  membership_status: 'active',
                  renewal_date: renewalDate,
                })
                .eq('id', existingMember.id)

              // Initial subscription payment — idempotent on
              // checkout-session id so we don't double-insert if Stripe
              // retries the webhook.
              const { data: existingPayment } = await supabaseAdmin
                .from('payments')
                .select('id')
                .eq('stripe_checkout_session_id', session.id)
                .maybeSingle()
              if (!existingPayment) {
                await supabaseAdmin.from('payments').insert({
                  member_id: existingMember.id,
                  amount_pence: amountPence,
                  currency: 'GBP',
                  payment_type: 'membership',
                  payment_method: 'stripe',
                  status: initialPaymentStatus,
                  paid_at: initialPaidAt,
                  stripe_checkout_session_id: session.id,
                  description: 'Membership — initial subscription payment',
                })
              }
            }
          }

          console.log(
            'Application payment recorded:',
            application_id,
            'sub:',
            subscriptionId,
          )
          // Done — welcome email waits until admin approves & member
          // exists. Avoid sending welcome to someone who hasn't been
          // approved yet.
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Flow A — existing member subscription
        // (proceeds to original code below)
        if (!member_id) {
          // Already handled flow B above; this is a safety net.
          return new Response(JSON.stringify({ received: true }), { status: 200 })
        }

        // Save subscription ID + activate member
        const { error: updateError } = await supabaseAdmin
          .from('members')
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            membership_status: 'active',
            renewal_date: renewalDate,
          })
          .eq('id', member_id)

        if (updateError) {
          console.error('Failed to update member subscription:', updateError)
          return new Response('Failed to update member', { status: 500 })
        }

        // Direct Debit subscription checkout → mark the member as paying by
        // Direct Debit (mandate status follows via mandate.updated).
        if (session.metadata?.payment_method_type === 'bacs_debit') {
          await markMemberDirectDebitFromSubscriptionCheckout(supabaseAdmin, member_id)
        }

        // Initial subscription payment — Flow A also needs this so the
        // dashboard Revenue MTD and Finance page reflect it. Idempotent
        // on session id.
        const { data: existingPayment } = await supabaseAdmin
          .from('payments')
          .select('id')
          .eq('stripe_checkout_session_id', session.id)
          .maybeSingle()
        if (!existingPayment) {
          await supabaseAdmin.from('payments').insert({
            member_id,
            amount_pence: amountPence,
            currency: 'GBP',
            payment_type: 'membership',
            payment_method: 'stripe',
            status: initialPaymentStatus,
            paid_at: initialPaidAt,
            stripe_checkout_session_id: session.id,
            description: 'Membership — initial subscription payment',
          })
        }

        // ── Send membership welcome email ──
        // Once per member: Stripe re-delivers checkout.session.completed
        // whenever the endpoint was slow or errored, so skip if a welcome
        // has already been sent.
        const { data: priorWelcome } = await supabaseAdmin
          .from('email_log')
          .select('id')
          .eq('member_id', member_id)
          .eq('category', 'membership_welcome')
          .eq('status', 'sent')
          .limit(1)
        if (priorWelcome?.length) {
          console.log('[email] welcome already sent for member:', member_id)
        } else try {
          const { data: memberRow } = await supabaseAdmin
            .from('members')
            .select('id, profiles:profile_id(first_name, email)')
            .eq('id', member_id)
            .single()
          const profileRaw = memberRow?.profiles as
            | { first_name: string | null; email: string | null }
            | { first_name: string | null; email: string | null }[]
            | null
          const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
          const recipientEmail = profile?.email ?? null
          if (recipientEmail) {
            const firstName = profile?.first_name ?? 'there'
            // Prefer the verified RESEND_FROM_EMAIL; fall back to FROM_EMAIL.
            const fromEmail =
              Deno.env.get('RESEND_FROM_EMAIL') ?? Deno.env.get('FROM_EMAIL') ?? 'onboarding@resend.dev'
            const fromName = Deno.env.get('RESEND_FROM_NAME') ?? 'The Club'
            const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:3001'
            const html = renderMembershipWelcomeHtml(firstName, `${siteUrl}/portal`)
            const subject = `Welcome to The Club, ${firstName}`
            const { id: resendId, error: emailErr } = await sendResendEmail({
              from: `${fromName} <${fromEmail}>`,
              to: recipientEmail,
              subject,
              html,
            })
            if (emailErr) {
              console.error('[email] welcome send failed:', emailErr)
            } else {
              console.log('[email] welcome sent:', resendId)
            }
            await supabaseAdmin.from('communications').insert({
              member_id,
              template_name: 'membership_welcome',
              channel: 'email',
              subject,
              body_preview: `Welcome to The Club, ${firstName}. Your membership is active.`,
              status: emailErr ? 'failed' : 'sent',
              sent_at: emailErr ? null : new Date().toISOString(),
              resend_message_id: resendId,
            })
            await supabaseAdmin.from('email_log').insert({
              to_email: recipientEmail,
              subject,
              html,
              category: 'membership_welcome',
              status: emailErr ? 'failed' : 'sent',
              error: emailErr ?? null,
              resend_message_id: resendId,
              member_id,
            })
          }
        } catch (emailErr) {
          console.error('[email] welcome pipeline error:', emailErr)
        }

        console.log('Subscription activated for member:', member_id, 'sub:', subscriptionId)
      } else {
        // ── Event booking checkout ──
        // Members (/api/events/book) AND guests (/api/events/checkout) land
        // here. Guest sessions carry only booking_id + event_id, so
        // booking_id is the key; member_id is only required for the legacy
        // path that has no pre-created booking. Every transition is
        // conditional (pending → confirmed / held), shared with
        // /api/events/sync, so only one of them sends emails.
        const {
          booking_id,
          event_id,
          member_id,
          guests_invited,
          guest_name,
          accommodation_booked,
        } = session.metadata ?? {}

        // Card-HOLD checkouts (setup mode, non-auto-confirm events): save the
        // card on the booking (it stays pending for approval). Nothing is
        // charged. Also covers a booker who closes the tab before the
        // confirmation page runs /api/events/sync.
        if (session.mode === 'setup') {
          if (booking_id) {
            const siId =
              typeof session.setup_intent === 'string'
                ? session.setup_intent
                : session.setup_intent?.id ?? null
            const si = siId ? await stripe.setupIntents.retrieve(siId) : null
            if (si && si.status === 'succeeded') {
              const pmId =
                typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id ?? null
              const custId = typeof si.customer === 'string' ? si.customer : si.customer?.id ?? null
              const { data: current } = await supabaseAdmin
                .from('bookings')
                .select('id, status')
                .eq('id', booking_id)
                .maybeSingle()
              if (current && current.status === 'pending') {
                if (pmId && custId) {
                  await stripe.customers.update(custId, {
                    invoice_settings: { default_payment_method: pmId },
                  })
                }
                const { data: claimed } = await supabaseAdmin
                  .from('bookings')
                  .update({ charge_error: null })
                  .eq('id', booking_id)
                  .eq('status', 'pending')
                  .eq('charge_error', AWAITING_CHECKOUT)
                  .select(BOOKING_SELECT)
                  .maybeSingle()
                await supabaseAdmin
                  .from('bookings')
                  .update({
                    stripe_setup_intent_id: si.id,
                    stripe_payment_method_id: pmId,
                    stripe_customer_id: custId,
                  })
                  .eq('id', booking_id)
                  .eq('status', 'pending')
                if (claimed) {
                  const held = claimed as unknown as BookingRow
                  await sendBookingEmails(supabaseAdmin, held, held.amount_pence ?? 0, true)
                }
              }
            }
          }
          return new Response(JSON.stringify({ received: true, hold: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (!booking_id && (!event_id || !member_id)) {
          console.error('Missing metadata on checkout session:', session.id)
          return new Response('Missing metadata', { status: 400 })
        }

        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null
        const amountPence = session.amount_total ?? 0

        // Idempotency check — skip if we already processed this payment intent
        // (e.g. /api/events/sync ran first on the confirmation page).
        if (paymentIntentId) {
          const { data: existingBooking } = await supabaseAdmin
            .from('bookings')
            .select('id')
            .eq('stripe_payment_intent_id', paymentIntentId)
            .limit(1)

          if (existingBooking?.length) {
            console.log('Already processed payment intent:', paymentIntentId)
            return new Response('Already processed', { status: 200 })
          }
        }

        // Ledger row, idempotent on the payment intent.
        async function recordPayment(memberId: string | null, referenceId: string | null, description: string) {
          const { data: existingPay } = paymentIntentId
            ? await supabaseAdmin
                .from('payments')
                .select('id')
                .eq('stripe_payment_intent_id', paymentIntentId)
                .limit(1)
            : { data: null }
          if (existingPay?.length) return false
          const { error: paymentError } = await supabaseAdmin.from('payments').insert({
            member_id: memberId,
            amount_pence: amountPence,
            currency: 'GBP',
            payment_type: 'event_booking',
            payment_method: 'stripe',
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: paymentIntentId,
            reference_id: referenceId,
            description,
          })
          if (paymentError) {
            console.error('Failed to create payment:', paymentError)
            return false
          }
          return true
        }

        // The booking is usually PRE-CREATED by /api/events/book (member) or
        // /api/events/checkout (guest), with booking_id in the metadata —
        // confirm it in place (ONLY from pending, so an old / replayed event
        // can't resurrect a cancelled booking). Only insert a fresh row for
        // the legacy path with no booking_id.
        if (booking_id) {
          const { data: claimedRow, error: updErr } = await supabaseAdmin
            .from('bookings')
            .update({
              status: 'confirmed',
              payment_method: 'stripe',
              amount_pence: amountPence,
              stripe_payment_intent_id: paymentIntentId,
              charge_error: null,
            })
            .eq('id', booking_id)
            .eq('status', 'pending')
            .select(BOOKING_SELECT)
            .maybeSingle()
          if (updErr) {
            console.error('Failed to confirm booking:', updErr)
            return new Response('Failed to confirm booking', { status: 500 })
          }

          if (!claimedRow) {
            // Booking removed / cancelled / paid by another payment. Keep the
            // money on record and flag it for refund — don't 400 (Stripe
            // would retry for days and the payment would be lost).
            const { data: current } = await supabaseAdmin
              .from('bookings')
              .select('id, status, member_id, events(title)')
              .eq('id', booking_id)
              .maybeSingle()
            const title = one<{ title: string }>(current?.events)?.title ?? 'event'
            const inserted = await recordPayment(
              current?.member_id ?? member_id ?? null,
              booking_id,
              `REFUND NEEDED — payment for booking ${booking_id} which is ${current ? current.status : 'no longer on file'} (${title})`,
            )
            if (inserted) {
              await notifyAdminsWebhook(supabaseAdmin, 'Payment received for an inactive booking — refund needed', [
                `Stripe payment <strong>${escapeHtml(paymentIntentId ?? '')}</strong> (${escapeHtml(formatGBP(amountPence))}) was made for booking ${escapeHtml(booking_id)}, which is ${escapeHtml(current ? current.status : 'no longer on file')}.`,
                'The booking was not reinstated. Please refund the payment in Stripe or rebook the attendee.',
              ])
            }
            console.warn('Payment for inactive booking recorded for refund:', booking_id, paymentIntentId)
            return new Response(JSON.stringify({ received: true, orphan: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          const b = claimedRow as unknown as BookingRow
          const title = one<{ title: string }>(b.events)?.title ?? 'event'
          await recordPayment(
            b.member_id,
            b.id,
            b.member_id
              ? `Event booking — ${title}`
              : `Event booking — ${title} (guest${b.guest_name ? `: ${b.guest_name}` : ''})`,
          )
          await sendBookingEmails(supabaseAdmin, b, amountPence, false)
          console.log('Booking confirmed:', b.id, 'for event:', event_id)
        } else {
          const guestsInvited = parseInt(guests_invited ?? '0', 10) || 0
          const { data: ins, error: bookingError } = await supabaseAdmin
            .from('bookings')
            .insert({
              event_id,
              member_id,
              status: 'confirmed',
              payment_method: 'stripe',
              amount_pence: amountPence,
              stripe_payment_intent_id: paymentIntentId,
              guests_invited: guestsInvited,
              guest_name: guestsInvited > 0 && guest_name ? guest_name : null,
              accommodation_booked: accommodation_booked === 'true',
            })
            .select(BOOKING_SELECT)
            .single()
          if (bookingError || !ins) {
            console.error('Failed to create booking:', bookingError)
            // Still record the money so it can be refunded / reconciled.
            await recordPayment(member_id ?? null, null, `REFUND NEEDED — legacy booking insert failed (event ${event_id})`)
            return new Response('Failed to create booking', { status: 500 })
          }
          const b = ins as unknown as BookingRow
          await recordPayment(member_id ?? null, b.id, `Event booking ${b.id}`)
          await sendBookingEmails(supabaseAdmin, b, amountPence, false)
          console.log('Booking created:', b.id, 'for event:', event_id)
        }
      }
    }

    // ── invoice.paid — recurring subscription payment ──
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id ?? null

      if (subscriptionId && invoice.billing_reason !== 'subscription_create') {
        // Find member by subscription ID, falling back to the subscription's
        // member_id metadata. A renewal that arrives before the subscription
        // is linked to a member is NOT silently dropped: if the subscription
        // is one of ours we answer 500 so Stripe retries later.
        let { data: member } = await supabaseAdmin
          .from('members')
          .select('id')
          .eq('stripe_subscription_id', subscriptionId)
          .limit(1)
          .maybeSingle()
        if (!member) {
          const subForLookup = await stripe.subscriptions.retrieve(subscriptionId)
          const metaMemberId = subForLookup.metadata?.member_id
          if (metaMemberId) {
            const { data: byMeta } = await supabaseAdmin
              .from('members')
              .select('id')
              .eq('id', metaMemberId)
              .maybeSingle()
            member = byMeta
          }
          if (!member && (subForLookup.metadata?.member_id || subForLookup.metadata?.application_id)) {
            console.warn('invoice.paid for an unlinked subscription — asking Stripe to retry:', subscriptionId)
            return new Response('Subscription not linked to a member yet', { status: 500 })
          }
        }

        if (member) {
          // Idempotency — check stripe_invoice_id
          const { data: existing } = await supabaseAdmin
            .from('payments')
            .select('id')
            .eq('stripe_invoice_id', invoice.id)
            .maybeSingle()

          if (!existing) {
            const amountPence = invoice.amount_paid ?? 0

            // Insert payment record
            await supabaseAdmin.from('payments').insert({
              member_id: member.id,
              amount_pence: amountPence,
              currency: 'GBP',
              payment_type: 'membership',
              payment_method: 'stripe',
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_invoice_id: invoice.id,
              description: 'Membership subscription payment',
            })

            // Update renewal date (current_period_end from the subscription)
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            const renewalDate = new Date(sub.current_period_end * 1000).toISOString()

            await supabaseAdmin
              .from('members')
              .update({ renewal_date: renewalDate })
              .eq('id', member.id)

            console.log('Subscription payment recorded for member:', member.id)
          }
        }
      }
    }

    // ── invoice.payment_failed ──
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id ?? null

      if (subscriptionId) {
        const { data: member } = await supabaseAdmin
          .from('members')
          .select('id')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle()

        if (member) {
          // Idempotency check
          const { data: existing } = await supabaseAdmin
            .from('payments')
            .select('id')
            .eq('stripe_invoice_id', invoice.id)
            .maybeSingle()

          if (!existing) {
            await supabaseAdmin.from('payments').insert({
              member_id: member.id,
              amount_pence: invoice.amount_due ?? 0,
              currency: 'GBP',
              payment_type: 'membership',
              payment_method: 'stripe',
              status: 'failed',
              stripe_invoice_id: invoice.id,
              description: 'Membership payment failed',
            })

            console.log('Failed payment recorded for member:', member.id)
          }
        }
      }
    }

    // ── customer.subscription.updated ──
    // Members are matched on metadata.member_id OR on the subscription id
    // stored on the member (approval-created subscriptions had no member_id
    // metadata). Status changes only apply to the member's CURRENT
    // subscription, so cancelling a duplicate/old subscription never
    // cancels the member.
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription
      const metaMemberId = subscription.metadata?.member_id ?? null
      const { data: linked } = await supabaseAdmin
        .from('members')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .limit(1)
        .maybeSingle()
      const memberId = linked?.id ?? metaMemberId

      if (memberId) {
        const renewalDate = new Date(subscription.current_period_end * 1000).toISOString()
        await supabaseAdmin
          .from('members')
          .update({ renewal_date: renewalDate })
          .eq('id', memberId)

        // Ended for good (unpaid after retries / expired) → cancelled.
        // past_due stays active (Stripe is still retrying) — see report.
        if (
          linked &&
          (subscription.status === 'canceled' ||
            subscription.status === 'unpaid' ||
            subscription.status === 'incomplete_expired')
        ) {
          await supabaseAdmin
            .from('members')
            .update({ membership_status: 'cancelled' })
            .eq('id', linked.id)
            .eq('stripe_subscription_id', subscription.id)
        }
        if (subscription.status === 'past_due' || subscription.cancel_at_period_end) {
          console.log('Subscription', subscription.id, 'is', subscription.status, 'cancel_at_period_end:', subscription.cancel_at_period_end)
        }

        console.log('Subscription updated for member:', memberId)
      }
    }

    // ── customer.subscription.deleted ──
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription
      // Only the member whose current subscription this is.
      const { data: cancelled } = await supabaseAdmin
        .from('members')
        .update({
          membership_status: 'cancelled',
          stripe_subscription_id: null,
        })
        .eq('stripe_subscription_id', subscription.id)
        .select('id')

      if (cancelled?.length) {
        console.log('Subscription cancelled for member(s):', cancelled.map((m: { id: string }) => m.id).join(','))
      } else {
        console.log('Deleted subscription not current for any member:', subscription.id)
      }
    }

    // ── charge.refunded — refund made in Stripe (dashboard or API) ──
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge
      const piId =
        typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
      const invoiceId =
        // deno-lint-ignore no-explicit-any
        typeof (charge as any).invoice === 'string' ? (charge as any).invoice : (charge as any).invoice?.id ?? null
      const fullyRefunded = charge.refunded === true || (charge.amount_refunded ?? 0) >= charge.amount
      if (fullyRefunded) {
        if (piId) {
          await supabaseAdmin.from('payments').update({ status: 'refunded' }).eq('stripe_payment_intent_id', piId)
          await supabaseAdmin
            .from('bookings')
            .update({ status: 'refunded' })
            .eq('stripe_payment_intent_id', piId)
            .in('status', ['confirmed', 'pending'])
        }
        if (invoiceId) {
          await supabaseAdmin.from('payments').update({ status: 'refunded' }).eq('stripe_invoice_id', invoiceId)
        }
      }
      await notifyAdminsWebhook(supabaseAdmin, fullyRefunded ? 'Payment refunded in Stripe' : 'Partial refund made in Stripe', [
        `Stripe charge <strong>${escapeHtml(charge.id)}</strong>: ${escapeHtml(formatGBP(charge.amount_refunded ?? 0))} of ${escapeHtml(formatGBP(charge.amount))} refunded.`,
        fullyRefunded
          ? 'The matching payment (and any event booking) has been marked refunded.'
          : 'This is a partial refund — the CRM records were left unchanged; adjust them manually if needed.',
      ])
    }

    // ── charge.dispute.created — chargeback opened ──
    if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object as Stripe.Dispute
      const piId =
        typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null
      if (piId) {
        await supabaseAdmin
          .from('bookings')
          .update({ charge_error: `Disputed (chargeback ${dispute.id}, reason: ${dispute.reason})` })
          .eq('stripe_payment_intent_id', piId)
      }
      await notifyAdminsWebhook(supabaseAdmin, 'URGENT: card payment disputed (chargeback)', [
        `A cardholder has disputed a payment of <strong>${escapeHtml(formatGBP(dispute.amount))}</strong> (reason: ${escapeHtml(dispute.reason)}).`,
        `Dispute <strong>${escapeHtml(dispute.id)}</strong>${piId ? ` on payment ${escapeHtml(piId)}` : ''}. Respond with evidence in the Stripe Dashboard before the deadline${dispute.evidence_details?.due_by ? ` (${escapeHtml(new Date(dispute.evidence_details.due_by * 1000).toUTCString())})` : ''}.`,
      ])
    }

    // Direct Debit: tag membership payment rows collected by Bacs.
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      await tagInvoicePaymentMethodType(stripe, supabaseAdmin, event.data.object as Stripe.Invoice)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('Internal server error', { status: 500 })
  }
})
