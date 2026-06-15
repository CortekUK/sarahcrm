// POST /api/admin/campaigns/send
//
// Sends a campaign-type email template to either "all active
// subscribers" (when audience_id is null) or to a saved audience
// (subscribers + members combined). Records the send as an
// email_campaigns row regardless of delivery status, so the admin
// always has a history.
//
// Body: { template_id: string, audience_id: string | null }
//
// Delivery:
//   - If `RESEND_API_KEY` is set, hits Resend's batch endpoint.
//   - If it's not set, the campaign is saved as `draft` with a clear
//     `error_message`, and we return 200 + { delivered: false } so
//     the UI can tell the admin "draft saved, configure SMTP to send."
//
// Admin-only.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { replaceMergeTags } from '@/lib/utils-templates/merge-tags-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  template_id?: string
  audience_id?: string | null
}

interface Recipient {
  email: string
  first_name: string
  last_name: string
  unsubscribe_token: string | null
}

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

// Build the recipient list either from "all active subscribers" or
// from an audience (which may combine subscribers + members). We
// dedupe by email so a person who is both a subscriber and a member
// only receives one copy.
async function buildRecipients(
  admin: ReturnType<typeof getAdminDb>,
  audienceId: string | null,
): Promise<Recipient[]> {
  if (!audienceId) {
    const { data } = await admin
      .from('mailing_list')
      .select('email, first_name, last_name, unsubscribe_token')
      .is('unsubscribed_at', null)
    return (data ?? []) as Recipient[]
  }

  const { data: rows } = await admin
    .from('audience_members')
    .select('subscriber_id, member_id')
    .eq('audience_id', audienceId)
  const subscriberIds: string[] = []
  const memberIds: string[] = []
  for (const r of rows ?? []) {
    if (r.subscriber_id) subscriberIds.push(r.subscriber_id)
    if (r.member_id) memberIds.push(r.member_id)
  }

  const result: Recipient[] = []
  if (subscriberIds.length) {
    const { data } = await admin
      .from('mailing_list')
      .select('email, first_name, last_name, unsubscribe_token')
      .in('id', subscriberIds)
      .is('unsubscribed_at', null)
    for (const s of data ?? []) result.push(s as Recipient)
  }
  if (memberIds.length) {
    const { data } = await admin
      .from('members')
      .select('id, profiles(email, first_name, last_name)')
      .in('id', memberIds)
      .eq('membership_status', 'active')
      .is('deleted_at', null)
    for (const m of data ?? []) {
      const p = (m.profiles as unknown as {
        email: string | null
        first_name: string | null
        last_name: string | null
      } | null) ?? null
      if (!p?.email) continue
      result.push({
        email: p.email,
        first_name: p.first_name ?? '',
        last_name: p.last_name ?? '',
        unsubscribe_token: null,
      })
    }
  }

  // Dedupe by email (lowercased)
  const seen = new Set<string>()
  const deduped: Recipient[] = []
  for (const r of result) {
    const key = r.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(r)
  }
  return deduped
}

// Personalise + append unsubscribe footer to the body HTML.
interface CampaignSender {
  name: string
  email: string
  month: string
}

function buildBodyFor(
  recipient: Recipient,
  html: string,
  origin: string,
  sender: CampaignSender,
): string {
  // Full merge-tag resolution — handles {{first_name|there}} fallbacks,
  // {{#if ...}} blocks and {{sender_*}} fields. The naive two-field replace
  // this used to do left every other token raw in the inbox.
  const data = {
    first_name: recipient.first_name || undefined,
    last_name: recipient.last_name || undefined,
    email: recipient.email,
    // Sender name/title keep the template's own defaults (Sarah Restrick /
    // Founder); we supply the real sending email so its placeholder doesn't
    // leak, plus a booking link + month for any uses.
    sender_email: sender.email,
    booking_link: `${origin}/events`,
    month_name: sender.month,
  }
  const personalised = replaceMergeTags(html, data)

  if (!recipient.unsubscribe_token) {
    // Members don't have an unsubscribe token. Their list governance
    // sits in the dashboard, not a public one-click. Skip the footer.
    return personalised
  }
  const url = `${origin}/unsubscribe?token=${recipient.unsubscribe_token}`
  const footer = `
    <hr style="border:none;border-top:1px solid #2C313B;margin:32px 0 16px;" />
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#5C5953;text-align:center;">
      You're receiving this because you subscribed at The Club by Sarah Restrick.
      <br/>
      <a href="${url}" style="color:#A87B4F;text-decoration:underline;">Unsubscribe</a>
    </p>
  `
  return `${personalised}${footer}`
}

interface ResendSendItem {
  from: string
  to: string[]
  subject: string
  html: string
}

async function sendViaResend(items: ResendSendItem[], apiKey: string) {
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(items),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Resend ${res.status}: ${text}`)
  }
  return res.json().catch(() => ({}))
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return Response.json({ error: auth.error }, { status: auth.status })
    }

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.template_id) {
      return Response.json({ error: 'template_id required' }, { status: 400 })
    }

    const admin = getAdminDb()

    // Load template
    const { data: tpl, error: tplErr } = await admin
      .from('email_templates')
      .select('id, name, subject, body_html, fixed_from_name, fixed_from_email')
      .eq('id', body.template_id)
      .single()
    if (tplErr || !tpl) {
      return Response.json({ error: 'Template not found' }, { status: 404 })
    }

    const audienceId = body.audience_id ?? null
    let audienceLabel = 'All active subscribers'
    if (audienceId) {
      const { data: aud } = await admin
        .from('audiences')
        .select('name')
        .eq('id', audienceId)
        .single()
      audienceLabel = aud?.name ?? 'List'
    }

    const recipients = await buildRecipients(admin, audienceId)
    const recipientCount = recipients.length

    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`

    // Insert campaign row up-front so even drafts/failures show up
    // in the history table.
    const { data: campaign, error: campErr } = await admin
      .from('email_campaigns')
      .insert({
        template_id: tpl.id,
        audience_id: audienceId,
        audience_label: audienceLabel,
        name: tpl.name,
        subject: tpl.subject,
        body_html: tpl.body_html,
        recipient_count: recipientCount,
        status: 'draft',
        created_by: auth.admin.id,
      })
      .select()
      .single()
    if (campErr || !campaign) {
      return Response.json(
        { error: campErr?.message ?? 'Could not save campaign' },
        { status: 500 },
      )
    }

    // ── Deferred-send branch ─────────────────────────────────────
    // No Resend key yet → leave as draft + tell the admin in the
    // response, so the UI can show "saved, configure SMTP to send."
    const resendKey = process.env.RESEND_API_KEY
    const fromEmail = tpl.fixed_from_email || process.env.RESEND_FROM_EMAIL
    const fromName = tpl.fixed_from_name || process.env.RESEND_FROM_NAME || 'The Club'

    if (!resendKey || !fromEmail) {
      await admin
        .from('email_campaigns')
        .update({
          status: 'draft',
          error_message:
            'Saved as draft — set RESEND_API_KEY (and a verified RESEND_FROM_EMAIL or template fixed_from_email) to enable sending.',
        })
        .eq('id', campaign.id)
      return Response.json({
        ok: true,
        delivered: false,
        campaign_id: campaign.id,
        recipient_count: recipientCount,
        sent_count: 0,
        reason: 'smtp_not_configured',
      })
    }

    if (recipientCount === 0) {
      await admin
        .from('email_campaigns')
        .update({
          status: 'failed',
          error_message: 'Audience contains no active recipients.',
        })
        .eq('id', campaign.id)
      return Response.json(
        { error: 'Audience is empty', campaign_id: campaign.id },
        { status: 400 },
      )
    }

    // Mark sending
    await admin.from('email_campaigns').update({ status: 'sending' }).eq('id', campaign.id)

    // Resend's batch endpoint accepts up to 100 items per request.
    // Chunk recipients into batches of 90 to leave headroom.
    const CHUNK = 90
    let sent = 0
    let failed = 0
    let lastError: string | null = null

    const fromHeader = `${fromName} <${fromEmail}>`
    const sender: CampaignSender = {
      name: fromName,
      email: fromEmail as string,
      month: new Date().toLocaleDateString('en-GB', { month: 'long' }),
    }

    for (let i = 0; i < recipients.length; i += CHUNK) {
      const slice = recipients.slice(i, i + CHUNK)
      const items: ResendSendItem[] = slice.map((r) => ({
        from: fromHeader,
        to: [r.email],
        subject: replaceMergeTags(tpl.subject, {
          first_name: r.first_name || undefined,
          last_name: r.last_name || undefined,
        }),
        html: buildBodyFor(r, tpl.body_html, origin, sender),
      }))
      try {
        await sendViaResend(items, resendKey)
        sent += slice.length
      } catch (e) {
        failed += slice.length
        lastError = e instanceof Error ? e.message : 'Unknown send error'
      }
    }

    const finalStatus = failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'sent'
    await admin
      .from('email_campaigns')
      .update({
        status: finalStatus,
        sent_count: sent,
        failed_count: failed,
        error_message: lastError,
        sent_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)

    return Response.json({
      ok: true,
      delivered: sent > 0,
      campaign_id: campaign.id,
      recipient_count: recipientCount,
      sent_count: sent,
      failed_count: failed,
      error: lastError,
    })
  } catch (e) {
    console.error('[campaigns/send] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
