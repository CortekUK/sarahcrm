// POST /api/admin/bookings/decision  { booking_id, action: 'approve' | 'reject' }
//
// Approve or reject a PENDING event booking whose card was held (Stripe
// setup) rather than charged. Approve charges the held card off-session and
// confirms the booking; reject cancels it and releases the saved card so
// nothing is taken. Used for non-auto-confirm events (guest + member).

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { renderClubEmail, sendClubEmail } from '@/lib/email/club-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only.', status: 403 as const }
  }
  return { admin: profile }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    const body = (await req.json().catch(() => ({}))) as {
      booking_id?: string
      action?: 'approve' | 'reject'
    }
    if (!body.booking_id || !body.action) {
      return Response.json({ error: 'booking_id and action are required.' }, { status: 400 })
    }

    const admin = getAdminDb()
    const { data: booking } = await admin
      .from('bookings')
      .select(
        'id, status, amount_pence, member_id, is_guest, guest_name, guest_email, stripe_customer_id, stripe_payment_method_id, event_id, events(title), members(id, stripe_customer_id, profiles(first_name, email))',
      )
      .eq('id', body.booking_id)
      .single()
    if (!booking) return Response.json({ error: 'Booking not found.' }, { status: 404 })
    if (booking.status !== 'pending') {
      return Response.json({ error: 'Only pending bookings can be decided.' }, { status: 400 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })

    // Resolve recipient + event title.
    const ev = booking.events as unknown as { title: string | null } | null
    const memberRel = booking.members as unknown as {
      stripe_customer_id: string | null
      profiles: { first_name: string | null; email: string | null } | null
    } | null
    const recipientEmail = booking.is_guest
      ? booking.guest_email
      : memberRel?.profiles?.email ?? null
    const firstName = booking.is_guest
      ? booking.guest_name || 'there'
      : memberRel?.profiles?.first_name || 'there'
    const eventTitle = ev?.title || 'the event'

    // ── REJECT ──────────────────────────────────────────────────────
    if (body.action === 'reject') {
      // Release the held card so nothing can be taken.
      if (booking.stripe_payment_method_id) {
        try {
          await stripe.paymentMethods.detach(booking.stripe_payment_method_id)
        } catch {
          /* already detached / not critical */
        }
      }
      await admin.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)

      if (recipientEmail) {
        const html = renderClubEmail({
          eyebrow: 'Your booking',
          heading: `An update on ${eventTitle}`,
          paragraphs: [
            `Hello ${firstName},`,
            `Thank you for your interest in <strong style="color:#2C2825;">${eventTitle}</strong>. On this occasion we're unable to confirm your place, and <strong style="color:#2C2825;">no payment has been taken</strong> — the card you provided has been removed.`,
            `We hope to welcome you to a future gathering.`,
          ],
        })
        await sendClubEmail({ to: recipientEmail, subject: `An update on ${eventTitle}`, html })
      }
      return Response.json({ ok: true, status: 'cancelled' })
    }

    // ── APPROVE (charge the held card) ──────────────────────────────
    const amount = booking.amount_pence ?? 0
    const customerId = booking.stripe_customer_id || memberRel?.stripe_customer_id || null

    // Free booking — confirm without charging.
    if (amount <= 0) {
      await admin
        .from('bookings')
        .update({ status: 'confirmed', charge_error: null })
        .eq('id', booking.id)
      return Response.json({ ok: true, status: 'confirmed', charged: false })
    }

    if (!customerId) {
      return Response.json(
        { error: 'No saved card on this booking to charge.' },
        { status: 400 },
      )
    }

    // Prefer the card saved on the booking; otherwise the customer's default.
    let paymentMethodId = booking.stripe_payment_method_id
    if (!paymentMethodId) {
      try {
        const customer = await stripe.customers.retrieve(customerId)
        if (customer && !customer.deleted) {
          const dpm = customer.invoice_settings?.default_payment_method
          paymentMethodId = typeof dpm === 'string' ? dpm : (dpm?.id ?? null)
        }
      } catch {
        paymentMethodId = null
      }
    }
    if (!paymentMethodId) {
      return Response.json(
        { error: 'No usable saved card — ask them to add a card and try again.' },
        { status: 400 },
      )
    }

    try {
      const pi = await stripe.paymentIntents.create({
        amount,
        currency: 'gbp',
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { booking_id: booking.id, event_id: booking.event_id },
      })
      if (pi.status !== 'succeeded') {
        await admin
          .from('bookings')
          .update({ charge_error: `Charge not completed (${pi.status}).` })
          .eq('id', booking.id)
        return Response.json(
          { error: `Charge could not be completed (${pi.status}).` },
          { status: 402 },
        )
      }

      await admin
        .from('bookings')
        .update({ status: 'confirmed', stripe_payment_intent_id: pi.id, charge_error: null })
        .eq('id', booking.id)

      // Ledger payment row — members AND guests (payments.member_id is
      // nullable; guest rows are admin-only under RLS). Idempotent on the
      // payment intent.
      {
        const { data: existingPay } = await admin
          .from('payments')
          .select('id')
          .eq('stripe_payment_intent_id', pi.id)
          .maybeSingle()
        if (!existingPay) {
          await admin.from('payments').insert({
            member_id: booking.member_id ?? null,
            amount_pence: amount,
            currency: 'GBP',
            payment_type: 'event_booking',
            payment_method: 'stripe',
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: pi.id,
            reference_id: booking.id,
            description: booking.member_id
              ? `Event booking — ${eventTitle}`
              : `Event booking — ${eventTitle} (guest${booking.guest_name ? `: ${booking.guest_name}` : ''})`,
          })
        }
      }

      if (recipientEmail) {
        const html = renderClubEmail({
          eyebrow: 'Booking confirmed',
          heading: `You're confirmed for ${eventTitle}`,
          paragraphs: [
            `Hello ${firstName},`,
            `Wonderful news — your place at <strong style="color:#2C2825;">${eventTitle}</strong> is confirmed and your card has now been charged.`,
            `We'll be in touch with the practicalities closer to the date.`,
          ],
        })
        await sendClubEmail({ to: recipientEmail, subject: `You're confirmed for ${eventTitle}`, html })
      }

      return Response.json({ ok: true, status: 'confirmed', charged: true })
    } catch (e) {
      // Expired / declined held card — surface so the team can ask for a
      // fresh card.
      const msg = e instanceof Error ? e.message : 'Card could not be charged.'
      await admin.from('bookings').update({ charge_error: msg }).eq('id', booking.id)
      return Response.json(
        { error: `Card declined — ${msg}. Ask the guest/member to update their card.` },
        { status: 402 },
      )
    }
  } catch (e) {
    console.error('[bookings/decision] error', e)
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return Response.json({ error: msg }, { status: 500 })
  }
}
