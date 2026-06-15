import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { corsHeaders } from '../_shared/cors.ts'

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
}): string {
  const { firstName, eventTitle, eventDate, eventTime, venueName, amount, bookingId, portalUrl } = opts
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
          <p style="margin:0 0 16px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#B8975A;">Booking Confirmed</p>
          <h1 style="margin:0 0 16px;font-size:26px;font-weight:400;color:#2C2825;line-height:1.2;">Your spot is secured, ${escapeHtml(firstName)}.</h1>
          <p style="margin:0 0 24px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.7;color:#2C2825;">
            Thank you for booking your place at <strong>${escapeHtml(eventTitle)}</strong>. We're looking forward to having you with us.
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
                    <p style="margin:0 0 4px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#A09A93;">Amount Paid</p>
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
        <tr><td align="center" style="padding:8px 28px 32px;">
          <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#B8975A;color:#fff;text-decoration:none;padding:14px 32px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;letter-spacing:0.15em;text-transform:uppercase;">View in your portal</a>
        </td></tr>
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
                  status: 'paid',
                  paid_at: paidAt,
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
            status: 'paid',
            paid_at: paidAt,
            stripe_checkout_session_id: session.id,
            description: 'Membership — initial subscription payment',
          })
        }

        // ── Send membership welcome email ──
        try {
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
          }
        } catch (emailErr) {
          console.error('[email] welcome pipeline error:', emailErr)
        }

        console.log('Subscription activated for member:', member_id, 'sub:', subscriptionId)
      } else {
        // ── Event booking checkout ──
        // Card-HOLD checkouts (setup mode, non-auto-confirm events) are
        // finalised by /api/events/sync on the confirmation page — the card
        // is saved and the booking stays pending. Nothing to charge here.
        if (session.mode === 'setup') {
          return new Response(JSON.stringify({ received: true, hold: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const {
          booking_id,
          event_id,
          member_id,
          guests_invited,
          guest_name,
          accommodation_booked,
        } = session.metadata ?? {}

        if (!event_id || !member_id) {
          console.error('Missing metadata on checkout session:', session.id)
          return new Response('Missing metadata', { status: 400 })
        }

        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null

        // Idempotency check — skip if we already processed this payment intent
        // (e.g. /api/events/sync ran first on the confirmation page).
        if (paymentIntentId) {
          const { data: existingBooking } = await supabaseAdmin
            .from('bookings')
            .select('id')
            .eq('stripe_payment_intent_id', paymentIntentId)
            .maybeSingle()

          if (existingBooking) {
            console.log('Already processed payment intent:', paymentIntentId)
            return new Response('Already processed', { status: 200 })
          }
        }

        const amountPence = session.amount_total ?? 0
        const guestsInvited = parseInt(guests_invited ?? '0', 10) || 0

        // The booking is usually PRE-CREATED by /api/events/book (member) or
        // /api/events/checkout (guest), with booking_id in the metadata —
        // confirm it in place so we never create a duplicate. Only insert a
        // fresh row for the legacy path with no booking_id.
        let booking: { id: string } | null = null
        if (booking_id) {
          const { data: upd, error: updErr } = await supabaseAdmin
            .from('bookings')
            .update({
              status: 'confirmed',
              payment_method: 'stripe',
              amount_pence: amountPence,
              stripe_payment_intent_id: paymentIntentId,
            })
            .eq('id', booking_id)
            .select('id')
            .single()
          if (updErr) {
            console.error('Failed to confirm booking:', updErr)
            return new Response('Failed to confirm booking', { status: 500 })
          }
          booking = upd
        } else {
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
            .select('id')
            .single()
          if (bookingError) {
            console.error('Failed to create booking:', bookingError)
            return new Response('Failed to create booking', { status: 500 })
          }
          booking = ins
        }

        // Create payment record — idempotent on the payment intent so we
        // don't double-record if /api/events/sync already inserted it.
        const { data: existingPay } = paymentIntentId
          ? await supabaseAdmin
              .from('payments')
              .select('id')
              .eq('stripe_payment_intent_id', paymentIntentId)
              .maybeSingle()
          : { data: null }
        if (!existingPay) {
          const { error: paymentError } = await supabaseAdmin
            .from('payments')
            .insert({
              member_id,
              amount_pence: amountPence,
              currency: 'GBP',
              payment_type: 'event_booking',
              payment_method: 'stripe',
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: paymentIntentId,
              reference_id: booking.id,
              description: `Event booking ${booking.id}`,
            })
          if (paymentError) {
            console.error('Failed to create payment:', paymentError)
          }
        }

        // ── Send branded booking confirmation email ──
        // Fetches member email + event details in one round-trip, renders
        // the HTML template inline, ships via Resend, then logs the send
        // to the communications table so it shows up in the comms feed.
        // Failures here are logged but don't fail the webhook — the
        // booking itself is the source of truth, email is secondary.
        try {
          const [memberRes, eventRes] = await Promise.all([
            supabaseAdmin
              .from('members')
              .select(
                'id, profiles:profile_id(first_name, last_name, email)',
              )
              .eq('id', member_id)
              .single(),
            supabaseAdmin
              .from('events')
              .select('id, title, venue_name, start_date')
              .eq('id', event_id)
              .single(),
          ])

          // Supabase returns the joined relation either as an object or a
          // single-element array depending on FK shape — normalise.
          const profileRaw = memberRes.data?.profiles as
            | { first_name: string | null; last_name: string | null; email: string | null }
            | { first_name: string | null; last_name: string | null; email: string | null }[]
            | null
          const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
          const recipientEmail = profile?.email ?? null

          if (recipientEmail && eventRes.data) {
            const firstName = profile?.first_name ?? 'there'
            const ev = eventRes.data
            // Prefer the verified RESEND_FROM_EMAIL; fall back to FROM_EMAIL.
            const fromEmail =
              Deno.env.get('RESEND_FROM_EMAIL') ?? Deno.env.get('FROM_EMAIL') ?? 'onboarding@resend.dev'
            const fromName = Deno.env.get('RESEND_FROM_NAME') ?? 'The Club'
            const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:3001'
            const html = renderBookingConfirmationHtml({
              firstName,
              eventTitle: ev.title,
              eventDate: formatEventDate(ev.start_date),
              eventTime: formatEventTime(ev.start_date),
              venueName: ev.venue_name ?? 'TBC',
              amount: formatGBP(amountPence),
              bookingId: booking.id,
              portalUrl: `${siteUrl}/portal/events/${ev.id}/confirmation?session_id=${session.id}`,
            })
            const subject = `Your spot at ${ev.title} is confirmed`
            const { id: resendId, error: emailErr } = await sendResendEmail({
              from: `${fromName} <${fromEmail}>`,
              to: recipientEmail,
              subject,
              html,
            })
            if (emailErr) {
              console.error('[email] booking confirmation send failed:', emailErr)
            } else {
              console.log('[email] booking confirmation sent:', resendId)
            }
            // Log to communications so the admin feed reflects the send.
            // Status reflects whether Resend accepted it; failures are
            // visible in /dashboard/bookings via the communications log.
            await supabaseAdmin.from('communications').insert({
              member_id,
              template_name: 'booking_confirmation',
              channel: 'email',
              subject,
              body_preview: `Your booking at ${ev.title} on ${formatEventDate(ev.start_date)} is confirmed.`,
              status: emailErr ? 'failed' : 'sent',
              sent_at: emailErr ? null : new Date().toISOString(),
              resend_message_id: resendId,
            })
          } else {
            console.warn(
              '[email] skipping confirmation — missing email or event:',
              { hasEmail: !!recipientEmail, hasEvent: !!eventRes.data },
            )
          }
        } catch (emailErr) {
          console.error('[email] booking confirmation pipeline error:', emailErr)
        }

        console.log('Booking created:', booking.id, 'for event:', event_id)
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
        // Find member by subscription ID
        const { data: member } = await supabaseAdmin
          .from('members')
          .select('id')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle()

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
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription
      const memberId = subscription.metadata?.member_id

      if (memberId) {
        const renewalDate = new Date(subscription.current_period_end * 1000).toISOString()
        await supabaseAdmin
          .from('members')
          .update({ renewal_date: renewalDate })
          .eq('id', memberId)

        console.log('Subscription updated for member:', memberId)
      }
    }

    // ── customer.subscription.deleted ──
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription
      const memberId = subscription.metadata?.member_id

      if (memberId) {
        await supabaseAdmin
          .from('members')
          .update({
            membership_status: 'cancelled',
            stripe_subscription_id: null,
          })
          .eq('id', memberId)

        console.log('Subscription cancelled for member:', memberId)
      }
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
