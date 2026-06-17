// POST /api/admin/sponsors/invite
//
// Send a sponsor their personalised event-booking invite. Sarah picks a saved
// email template (any template — she drops {{sponsor_booking_link}} wherever
// she wants the link) and we:
//   1. Resolve the sponsor's unique link  /events/<slug>?s=<booking_token>
//   2. Substitute the sponsor + event merge tags into subject + body
//   3. Send via Resend to the sponsor's email
//   4. Log to email_log and stamp sponsorships.invite_sent_at
//
// Admin only.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { replaceMergeTags, type MergeTagData } from '@/lib/utils-templates/merge-tags-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  sponsorship_id?: string
  template_id?: string
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(pence / 100)
}

function formatEventDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatEventTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  try {
    // ── Admin gate ────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, first_name, last_name, email, phone, job_title')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role !== 'admin') {
      return Response.json({ error: 'Admin only.' }, { status: 403 })
    }

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.sponsorship_id || !body.template_id) {
      return Response.json({ error: 'sponsorship_id and template_id are required' }, { status: 400 })
    }

    const adminDb = getAdmin()

    // ── Load sponsorship + its event ──────────────────────────────
    const { data: sponsorship, error: spErr } = await adminDb
      .from('sponsorships')
      .select(
        'id, booking_token, package_name, event_price_pence, sponsor_name, sponsor_email, sponsor_company, member_id, events(slug, title, start_date, venue_name, sponsor_price_pence)',
      )
      .eq('id', body.sponsorship_id)
      .single()

    if (spErr || !sponsorship) {
      return Response.json({ error: 'Sponsor not found' }, { status: 404 })
    }

    const event = (sponsorship.events ?? null) as unknown as {
      slug: string
      title: string
      start_date: string
      venue_name: string | null
      sponsor_price_pence: number | null
    } | null
    if (!event) {
      return Response.json({ error: 'Event not found for this sponsor' }, { status: 404 })
    }

    // Resolve the recipient email — fall back to the linked member's profile
    // email when the sponsor row has no direct contact email.
    let toEmail = sponsorship.sponsor_email ?? ''
    if (!toEmail && sponsorship.member_id) {
      const { data: m } = await adminDb
        .from('members')
        .select('profile:profiles!members_profile_id_fkey(email)')
        .eq('id', sponsorship.member_id)
        .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toEmail = ((m?.profile as any)?.email as string) ?? ''
    }
    if (!toEmail) {
      return Response.json(
        { error: 'This sponsor has no email address. Add one before sending the invite.' },
        { status: 400 },
      )
    }

    // ── Load template ─────────────────────────────────────────────
    const { data: template, error: tErr } = await adminDb
      .from('email_templates')
      .select('id, name, subject, body_html')
      .eq('id', body.template_id)
      .single()
    if (tErr || !template) {
      return Response.json({ error: 'Template not found' }, { status: 404 })
    }

    // ── Build the personalised link + merge data ──────────────────
    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
    const sponsorLink = `${origin}/events/${event.slug}?s=${sponsorship.booking_token}`
    const sponsorPrice = sponsorship.event_price_pence ?? event.sponsor_price_pence ?? 0

    const senderName =
      `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Sarah Restrick'

    const data: MergeTagData = {
      sponsor_booking_link: sponsorLink,
      booking_link: sponsorLink, // alias, in case a template reuses the generic tag
      event_name: event.title,
      event_date: formatEventDate(event.start_date),
      event_time: formatEventTime(event.start_date),
      sender_name: senderName,
      sender_title: profile.job_title ?? 'The Club',
      sender_email: profile.email ?? '',
      month_name: MONTH_NAMES[new Date().getMonth()],
    }
    if (sponsorship.sponsor_name) data.sponsor_name = sponsorship.sponsor_name
    if (sponsorship.sponsor_company) data.sponsor_company = sponsorship.sponsor_company
    if (event.venue_name) data.venue_name = event.venue_name
    if (sponsorPrice > 0) data.sponsor_price = formatGBP(sponsorPrice)
    if (profile.phone) data.sender_phone = profile.phone

    const subject = replaceMergeTags(template.subject || '', data) || `An invitation — ${event.title}`
    const html = replaceMergeTags(template.body_html || '', data)

    // ── Send ──────────────────────────────────────────────────────
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }
    const fromEmail =
      process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || 'onboarding@resend.dev'
    const resend = new Resend(apiKey)

    let status: 'sent' | 'failed' = 'sent'
    let errorMsg: string | null = null
    let messageId: string | null = null
    try {
      const result = await resend.emails.send({
        from: `${senderName} <${fromEmail}>`,
        to: [toEmail],
        subject,
        html,
      })
      if (result.error) {
        status = 'failed'
        errorMsg =
          typeof result.error === 'object' && result.error && 'message' in result.error
            ? String((result.error as { message: unknown }).message)
            : 'Resend error'
      } else {
        messageId = result.data?.id ?? null
      }
    } catch (err) {
      status = 'failed'
      errorMsg = err instanceof Error ? err.message : 'Unknown send error'
    }

    // ── Log + stamp ───────────────────────────────────────────────
    await adminDb.from('email_log').insert({
      to_email: toEmail,
      subject,
      html,
      category: `sponsor_invite:${event.title}`,
      status,
      error: errorMsg,
      resend_message_id: messageId,
      member_id: sponsorship.member_id ?? null,
    })

    if (status === 'sent') {
      await adminDb
        .from('sponsorships')
        .update({ invite_sent_at: new Date().toISOString() })
        .eq('id', sponsorship.id)
      return Response.json({ ok: true, to: toEmail })
    }

    return Response.json({ error: errorMsg ?? 'Send failed' }, { status: 502 })
  } catch (e) {
    console.error('[sponsors/invite] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
