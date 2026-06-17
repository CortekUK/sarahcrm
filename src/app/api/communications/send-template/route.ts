// POST /api/communications/send-template
//
// Send a saved email template to a list of members. Resolves merge tags per
// recipient, ships via Resend, and logs one row to `communications` per
// recipient (whether sent, failed, or skipped).
//
// Body:
//   {
//     template_id: string,
//     recipients:
//       | { kind: 'all_active' }
//       | { kind: 'member_ids', ids: string[] }
//       | { kind: 'event_attendees', event_id: string },
//     event_id?: string,       // optional event context for {{event_*}} tags
//     introduction_id?: string,// optional intro context for {{other_member_*}}
//     dry_run?: boolean,       // when true, resolve+log but don't send
//   }
//
// Response:
//   {
//     sent: number,
//     failed: number,
//     skipped: number,
//     errors: Array<{ member_id, error }>,
//     preview: Array<{ member_id, email, subject, body_preview }>,
//   }
//
// Admin only.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { replaceMergeTags } from '@/lib/utils-templates/merge-tags-core'
import { buildMergeData, type MemberRow, type EventRow, type IntroductionRow } from '@/lib/communications/merge-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  template_id?: string
  recipients?:
    | { kind: 'all_active' }
    | { kind: 'member_ids'; ids: string[] }
    | { kind: 'event_attendees'; event_id: string }
  event_id?: string | null
  introduction_id?: string | null
  dry_run?: boolean
}

function getAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function requireAdminUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, first_name, last_name, email, phone, job_title')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only.', status: 403 as const }
  }
  return { profile, supabase }
}

// Resend free tier is ~10 emails/second. Sleep between sends to stay safely
// under that ceiling without rolling our own backoff/retry logic. For
// pipeline-grade volume we'd switch to Resend's batch endpoint.
const PER_SEND_DELAY_MS = 120

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
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
      return Response.json({ error: 'template_id is required' }, { status: 400 })
    }
    if (!body.recipients) {
      return Response.json({ error: 'recipients is required' }, { status: 400 })
    }

    const adminDb = getAdmin()

    // Load the template
    const { data: template, error: templateError } = await adminDb
      .from('email_templates')
      .select('id, name, subject, body_html, theme')
      .eq('id', body.template_id)
      .single()

    if (templateError || !template) {
      return Response.json({ error: 'Template not found' }, { status: 404 })
    }

    // Resolve recipient list — always returns a shape we can iterate.
    const memberIds = await resolveRecipients(adminDb, body.recipients)
    if (memberIds.length === 0) {
      return Response.json(
        { error: 'No recipients matched the criteria' },
        { status: 400 },
      )
    }

    // Hard cap so a misclick doesn't fire 50,000 emails. The Club's member
    // base is tier-gated and small, so 500 is more than enough headroom.
    if (memberIds.length > 500) {
      return Response.json(
        { error: `Too many recipients (${memberIds.length}). Cap is 500 per send.` },
        { status: 400 },
      )
    }

    // Load member + profile rows
    const { data: memberRows, error: memberErr } = await adminDb
      .from('members')
      .select(
        `
        id, membership_tier, company_name,
        profile:profiles!members_profile_id_fkey(
          id, first_name, last_name, email, phone, job_title, company_name
        )
        `,
      )
      .in('id', memberIds)

    if (memberErr) {
      return Response.json({ error: memberErr.message }, { status: 500 })
    }

    // Coerce supabase relationship type — supabase-js types the joined
    // relation as an array even for !inner joins; cast for ergonomics.
    const members = (memberRows ?? []) as unknown as MemberRow[]

    // Optional event context
    let event: EventRow | null = null
    const eventId = body.event_id ?? (body.recipients.kind === 'event_attendees' ? body.recipients.event_id : null)
    if (eventId) {
      const { data: evt } = await adminDb
        .from('events')
        .select('id, title, venue_name, start_date, end_date')
        .eq('id', eventId)
        .single()
      event = (evt ?? null) as EventRow | null
    }

    // Optional intro context — we hydrate the "other" member relative to each
    // recipient at substitution time
    let introduction: { row: IntroductionRow; other_by_recipient: Map<string, MemberRow> } | null = null
    if (body.introduction_id) {
      const { data: intro } = await adminDb
        .from('introductions')
        .select('id, member_a_id, member_b_id, match_reason')
        .eq('id', body.introduction_id)
        .single()
      if (intro) {
        // Fetch both members so we can pick whichever isn't the recipient
        const otherIds = [intro.member_a_id, intro.member_b_id]
        const { data: pair } = await adminDb
          .from('members')
          .select(
            `id, membership_tier, company_name,
             profile:profiles!members_profile_id_fkey(id, first_name, last_name, email, phone, job_title, company_name)`,
          )
          .in('id', otherIds)
        const byId = new Map<string, MemberRow>(
          ((pair ?? []) as unknown as MemberRow[]).map((m) => [m.id, m]),
        )
        const otherByRecipient = new Map<string, MemberRow>()
        for (const m of members) {
          const otherId = m.id === intro.member_a_id ? intro.member_b_id : intro.member_a_id
          const other = byId.get(otherId)
          if (other) otherByRecipient.set(m.id, other)
        }
        introduction = {
          row: { ...intro, other_member: null },
          other_by_recipient: otherByRecipient,
        }
      }
    }

    // Sender profile from the logged-in admin's row, with Sarah as the
    // brand-mark fallback for any missing field
    const senderName =
      `${auth.profile.first_name ?? ''} ${auth.profile.last_name ?? ''}`.trim() ||
      'Sarah Restrick'
    const sender = {
      full_name: senderName,
      title: auth.profile.job_title ?? 'Founder, The Club',
      email: auth.profile.email ?? 'sarah@theclub.example.com',
      phone: auth.profile.phone ?? '',
      booking_link: 'https://theclub.example.com/book',
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey && !body.dry_run) {
      return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }
    const resend = apiKey ? new Resend(apiKey) : null
    // Resolve "from" like the shared club-email sender (RESEND_FROM_EMAIL
    // first) so the verified sending domain is used. Reading only FROM_EMAIL
    // fell back to onboarding@resend.dev when only RESEND_FROM_EMAIL was set,
    // which Resend restricts to the account owner's own address.
    const fromEmail =
      process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || 'onboarding@resend.dev'
    const fromHeader = `${sender.full_name} <${fromEmail}>`

    // Per-recipient send loop
    const stats = { sent: 0, failed: 0, skipped: 0 }
    const errors: Array<{ member_id: string; error: string }> = []
    const preview: Array<{
      member_id: string
      email: string
      subject: string
      body_preview: string
    }> = []
    const logRows: Array<{
      member_id: string
      template_name: string
      channel: 'email'
      subject: string
      body_preview: string
      status: 'sent' | 'failed' | 'queued'
      sent_at?: string
      resend_message_id?: string | null
    }> = []
    // Mirror each send into email_log too, so campaign sends show up in the
    // unified "Sent mail" log alongside automations/transactional mail. Same
    // columns club-email's logEmail() writes (category = "campaign:<template>").
    const emailLogRows: Array<{
      to_email: string
      subject: string
      html: string
      category: string
      status: 'sent' | 'failed'
      error: string | null
      resend_message_id: string | null
      member_id: string
    }> = []

    for (const member of members) {
      const toEmail = member.profile?.email
      if (!toEmail) {
        stats.skipped += 1
        errors.push({ member_id: member.id, error: 'No email on profile' })
        continue
      }

      const data = buildMergeData({
        member,
        event,
        introduction: introduction
          ? { ...introduction.row, other_member: introduction.other_by_recipient.get(member.id) ?? null }
          : null,
        sender,
      })

      const resolvedSubject = replaceMergeTags(template.subject || '', data) || '(no subject)'
      const resolvedHtml = replaceMergeTags(template.body_html || '', data)
      const bodyPreview = stripToText(resolvedHtml).slice(0, 200)

      preview.push({
        member_id: member.id,
        email: toEmail,
        subject: resolvedSubject,
        body_preview: bodyPreview,
      })

      if (body.dry_run) {
        // dry_run — don't ship, don't log. Caller gets `preview` to inspect.
        continue
      }

      try {
        const result = await resend!.emails.send({
          from: fromHeader,
          to: [toEmail],
          subject: resolvedSubject,
          html: resolvedHtml,
        })
        if (result.error) {
          const msg =
            typeof result.error === 'object' && result.error && 'message' in result.error
              ? String((result.error as { message: unknown }).message)
              : 'Resend error'
          stats.failed += 1
          errors.push({ member_id: member.id, error: msg })
          logRows.push({
            member_id: member.id,
            template_name: template.name,
            channel: 'email',
            subject: resolvedSubject,
            body_preview: bodyPreview,
            status: 'failed',
          })
          emailLogRows.push({
            to_email: toEmail,
            subject: resolvedSubject,
            html: resolvedHtml,
            category: `campaign:${template.name}`,
            status: 'failed',
            error: msg,
            resend_message_id: null,
            member_id: member.id,
          })
        } else {
          stats.sent += 1
          logRows.push({
            member_id: member.id,
            template_name: template.name,
            channel: 'email',
            subject: resolvedSubject,
            body_preview: bodyPreview,
            status: 'sent',
            sent_at: new Date().toISOString(),
            resend_message_id: result.data?.id ?? null,
          })
          emailLogRows.push({
            to_email: toEmail,
            subject: resolvedSubject,
            html: resolvedHtml,
            category: `campaign:${template.name}`,
            status: 'sent',
            error: null,
            resend_message_id: result.data?.id ?? null,
            member_id: member.id,
          })
        }
      } catch (err) {
        stats.failed += 1
        const msg = err instanceof Error ? err.message : 'Unknown send error'
        errors.push({ member_id: member.id, error: msg })
        logRows.push({
          member_id: member.id,
          template_name: template.name,
          channel: 'email',
          subject: resolvedSubject,
          body_preview: bodyPreview,
          status: 'failed',
        })
        emailLogRows.push({
          to_email: toEmail,
          subject: resolvedSubject,
          html: resolvedHtml,
          category: `campaign:${template.name}`,
          status: 'failed',
          error: msg,
          resend_message_id: null,
          member_id: member.id,
        })
      }

      // Rate-limit pacing — see PER_SEND_DELAY_MS comment above
      await sleep(PER_SEND_DELAY_MS)
    }

    // Bulk-insert the log rows once at the end — keeps the recipient loop
    // free of DB latency. Service-role client bypasses RLS for the log
    // write, which is fine since we already gated on admin at the top.
    if (logRows.length > 0) {
      const { error: logErr } = await adminDb
        .from('communications')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(logRows as any)
      if (logErr) {
        console.error('[send-template] failed to write communications log:', logErr)
      }
    }

    // Mirror into the unified email_log so campaign sends appear in the
    // "Sent mail" log alongside automations/transactional mail. Best-effort.
    if (emailLogRows.length > 0) {
      const { error: emailLogErr } = await adminDb.from('email_log').insert(emailLogRows)
      if (emailLogErr) {
        console.error('[send-template] failed to write email_log:', emailLogErr)
      }
    }

    return Response.json({
      sent: stats.sent,
      failed: stats.failed,
      skipped: stats.skipped,
      total: members.length,
      errors,
      preview: body.dry_run ? preview : preview.slice(0, 3),
      dry_run: !!body.dry_run,
    })
  } catch (e) {
    console.error('[send-template] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}

async function resolveRecipients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminDb: any,
  recipients: NonNullable<RequestBody['recipients']>,
): Promise<string[]> {
  if (recipients.kind === 'member_ids') {
    return Array.from(new Set(recipients.ids.filter(Boolean)))
  }
  if (recipients.kind === 'all_active') {
    const { data } = await adminDb
      .from('members')
      .select('id')
      .eq('membership_status', 'active')
    return (data ?? []).map((m: { id: string }) => m.id)
  }
  if (recipients.kind === 'event_attendees') {
    const { data } = await adminDb
      .from('bookings')
      .select('member_id, status')
      .eq('event_id', recipients.event_id)
      .in('status', ['confirmed', 'pending'])
    return Array.from(
      new Set((data ?? []).map((b: { member_id: string }) => b.member_id).filter(Boolean)),
    )
  }
  return []
}

// Lightweight HTML-to-text for the body_preview column. We don't need a real
// HTML parser here — just enough to give the comms feed a readable snippet
// without raw markup.
function stripToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
