// Automation flows — the scheduled email machine.
//
// A single `runAllAutomations(dryRun)` entry point runs every flow. Each
// flow finds the people in a given situation, skips anyone already handled
// (via automation_log), and either SENDS the email or — in dry-run /
// preview mode — just reports who WOULD be emailed. Nothing here decides
// who meets whom or approves anyone; it only sends lifecycle emails.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { renderClubEmail, sendClubEmail } from '@/lib/email/club-email'
import { renderIntroEmail } from '@/lib/introductions/intro-email'

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL || 'https://sarahcrm.vercel.app'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

function adminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// Supabase embeds a to-one relation as an object, but types loosely — be
// defensive and accept either shape.
function one<T>(v: T[] | T | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtMoney(pence: number | null | undefined): string {
  return `£${(((pence ?? 0) as number) / 100).toFixed(2)}`
}

function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}
function daysAheadDate(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
}
function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

interface FlowItem {
  ref_id: string
  to: string | null | undefined
  subject: string
  html: string
  detail: string
}

export interface FlowResult {
  flow: string
  label: string
  candidates: number
  alreadyHandled: number
  pending: number
  sent: number
  failed: number
  items: { ref_id: string; to: string; detail: string; status: string; error?: string }[]
}

// Shared dedup + send + log step used by every flow.
async function processFlow(
  admin: Admin,
  flow: string,
  label: string,
  dryRun: boolean,
  items: FlowItem[],
): Promise<FlowResult> {
  const valid = items.filter((i) => i.to)
  const refIds = valid.map((i) => i.ref_id)
  let handled = new Set<string>()
  if (refIds.length) {
    const { data } = await admin
      .from('automation_log')
      .select('ref_id')
      .eq('flow', flow)
      .in('ref_id', refIds)
    handled = new Set((data ?? []).map((r: { ref_id: string }) => r.ref_id))
  }
  const pending = valid.filter((i) => !handled.has(i.ref_id))
  const out: FlowResult['items'] = []
  let sent = 0
  let failed = 0

  for (const it of pending) {
    if (dryRun) {
      out.push({ ref_id: it.ref_id, to: it.to as string, detail: it.detail, status: 'would_send' })
      continue
    }
    const r = await sendClubEmail({
      to: it.to as string,
      subject: it.subject,
      html: it.html,
      category: `automation:${flow}`,
    })
    await admin.from('automation_log').insert({
      flow,
      ref_id: it.ref_id,
      recipient_email: it.to,
      status: r.sent ? 'sent' : 'failed',
      detail: r.error ?? it.detail,
    })
    if (r.sent) sent++
    else failed++
    out.push({
      ref_id: it.ref_id,
      to: it.to as string,
      detail: it.detail,
      status: r.sent ? 'sent' : 'failed',
      error: r.error,
    })
  }

  return {
    flow,
    label,
    candidates: valid.length,
    alreadyHandled: handled.size,
    pending: pending.length,
    sent,
    failed,
    items: out,
  }
}

// ── 1. Renewal reminders ──────────────────────────────────────────────
async function renewalReminders(admin: Admin, dryRun: boolean): Promise<FlowResult> {
  const { data } = await admin
    .from('members')
    .select('id, renewal_date, profiles(first_name, email)')
    .eq('membership_status', 'active')
    .gte('renewal_date', todayDate())
    .lte('renewal_date', daysAheadDate(7))

  const items: FlowItem[] = (data ?? []).map((m: Record<string, unknown>) => {
    const prof = one(m.profiles as { first_name?: string; email?: string } | null)
    const name = prof?.first_name || 'there'
    const renews = fmtDate(m.renewal_date as string)
    return {
      ref_id: `${m.id}:${m.renewal_date}`,
      to: prof?.email,
      subject: 'Your Club membership renews soon',
      detail: `Renews ${renews} — ${name}`,
      html: renderClubEmail({
        eyebrow: 'Membership',
        heading: 'Your membership renews soon.',
        paragraphs: [
          `Hello ${name},`,
          `A gentle note that your membership renews on <strong style="color:#F0EBE0;">${renews}</strong>.`,
          `There's nothing you need to do — it will continue automatically. If you'd like to make any changes, simply reply to this email.`,
        ],
      }),
    }
  })
  return processFlow(admin, 'renewal_reminder', 'Renewal reminders', dryRun, items)
}

// ── 2. Failed payment (dunning) ───────────────────────────────────────
async function failedPayments(admin: Admin, dryRun: boolean): Promise<FlowResult> {
  const { data } = await admin
    .from('payments')
    .select('id, amount_pence, description, members(profiles(first_name, email))')
    .eq('status', 'failed')

  const items: FlowItem[] = (data ?? []).map((p: Record<string, unknown>) => {
    const member = one(p.members as { profiles?: unknown } | null)
    const prof = one(member?.profiles as { first_name?: string; email?: string } | null)
    const name = prof?.first_name || 'there'
    return {
      ref_id: String(p.id),
      to: prof?.email,
      subject: 'A payment to The Club didn’t go through',
      detail: `${fmtMoney(p.amount_pence as number)} — ${name}`,
      html: renderClubEmail({
        eyebrow: 'Payment',
        heading: 'A payment didn’t go through.',
        paragraphs: [
          `Hello ${name},`,
          `We weren’t able to take a payment of <strong style="color:#F0EBE0;">${fmtMoney(p.amount_pence as number)}</strong>. This is usually just an expired or replaced card.`,
          `Please update your card so your membership continues uninterrupted.`,
        ],
        cta: { label: 'Update payment details', url: `${APP_URL}/portal/billing` },
      }),
    }
  })
  return processFlow(admin, 'failed_payment', 'Failed payments', dryRun, items)
}

// ── 3. Post-event follow-up ───────────────────────────────────────────
async function postEventFollowup(admin: Admin, dryRun: boolean): Promise<FlowResult> {
  const { data: events } = await admin
    .from('events')
    .select('id, title, start_date')
    .gte('start_date', daysAgoIso(3))
    .lte('start_date', daysAgoIso(1))
    .in('status', ['completed', 'live', 'published'])

  const items: FlowItem[] = []
  for (const ev of events ?? []) {
    const { data: bookings } = await admin
      .from('bookings')
      .select('id, is_guest, guest_name, guest_email, members(profiles(first_name, email))')
      .eq('event_id', (ev as { id: string }).id)
      .eq('status', 'confirmed')
    for (const b of bookings ?? []) {
      const bk = b as Record<string, unknown>
      const member = one(bk.members as { profiles?: unknown } | null)
      const prof = one(member?.profiles as { first_name?: string; email?: string } | null)
      const to = bk.is_guest ? (bk.guest_email as string) : prof?.email
      const name = (bk.is_guest ? (bk.guest_name as string) : prof?.first_name) || 'there'
      const title = (ev as { title: string }).title
      items.push({
        ref_id: String(bk.id),
        to,
        subject: `Thank you for joining ${title}`,
        detail: `${title} — ${name}`,
        html: renderClubEmail({
          eyebrow: 'With thanks',
          heading: `Thank you for joining us.`,
          paragraphs: [
            `Hello ${name},`,
            `It was a pleasure to have you at <strong style="color:#F0EBE0;">${title}</strong>. We hope it was an evening well spent.`,
            `We'd love to hear your reflections — your feedback shapes every evening that follows.`,
          ],
          cta: { label: 'Share your thoughts', url: `${APP_URL}/share-your-experience` },
        }),
      })
    }
  }
  return processFlow(admin, 'post_event_followup', 'Post-event follow-up', dryRun, items)
}

// ── 4. Guest → member nurture ─────────────────────────────────────────
async function guestNurture(admin: Admin, dryRun: boolean): Promise<FlowResult> {
  // Guest bookings for events in the last 90 days.
  const { data: bookings } = await admin
    .from('bookings')
    .select('id, guest_name, guest_email, events(start_date)')
    .eq('is_guest', true)
    .not('guest_email', 'is', null)

  // Keep only guests whose event has already happened (within 90 days).
  const recent = (bookings ?? []).filter((b: Record<string, unknown>) => {
    const ev = one(b.events as { start_date?: string } | null)
    if (!ev?.start_date) return false
    const t = new Date(ev.start_date).getTime()
    return t < Date.now() && t > Date.now() - 90 * 86_400_000
  })

  // Distinct guest emails, and exclude anyone who is already a member.
  const byEmail = new Map<string, { name: string }>()
  for (const b of recent) {
    const bk = b as Record<string, unknown>
    const email = (bk.guest_email as string)?.toLowerCase()
    if (email && !byEmail.has(email)) byEmail.set(email, { name: (bk.guest_name as string) || 'there' })
  }
  const emails = [...byEmail.keys()]
  let memberEmails = new Set<string>()
  if (emails.length) {
    const { data: profs } = await admin
      .from('profiles')
      .select('email, members(id)')
      .in('email', emails)
    memberEmails = new Set(
      (profs ?? [])
        .filter((p: Record<string, unknown>) => one(p.members as unknown))
        .map((p: Record<string, unknown>) => (p.email as string)?.toLowerCase()),
    )
  }

  const items: FlowItem[] = [...byEmail.entries()]
    .filter(([email]) => !memberEmails.has(email))
    .map(([email, { name }]) => ({
      ref_id: email,
      to: email,
      subject: 'An invitation to The Club',
      detail: `Guest nurture — ${name}`,
      html: renderClubEmail({
        eyebrow: 'Membership',
        heading: 'It was lovely to have you.',
        paragraphs: [
          `Hello ${name},`,
          `We so enjoyed having you as our guest. The Club is a private community built around trusted introductions and curated evenings — and we'd be glad to tell you more about joining.`,
        ],
        cta: { label: 'Explore membership', url: `${APP_URL}/memberships` },
      }),
    }))
  return processFlow(admin, 'guest_nurture', 'Guest → member nurture', dryRun, items)
}

// ── 5. Invoice chasing ────────────────────────────────────────────────
async function invoiceChasing(admin: Admin, dryRun: boolean): Promise<FlowResult> {
  const { data } = await admin
    .from('payments')
    .select('id, amount_pence, description, due_date, status, members(profiles(first_name, email))')
    .or(`status.eq.overdue,and(status.eq.pending,due_date.lt.${todayDate()})`)

  const items: FlowItem[] = (data ?? []).map((p: Record<string, unknown>) => {
    const member = one(p.members as { profiles?: unknown } | null)
    const prof = one(member?.profiles as { first_name?: string; email?: string } | null)
    const name = prof?.first_name || 'there'
    return {
      ref_id: String(p.id),
      to: prof?.email,
      subject: 'An outstanding balance with The Club',
      detail: `${fmtMoney(p.amount_pence as number)} — ${name}`,
      html: renderClubEmail({
        eyebrow: 'Account',
        heading: 'A small outstanding balance.',
        paragraphs: [
          `Hello ${name},`,
          `Our records show an outstanding balance of <strong style="color:#F0EBE0;">${fmtMoney(p.amount_pence as number)}</strong>${(p.description as string) ? ` for ${p.description}` : ''}.`,
          `If you've already settled this, please disregard — otherwise you can review and pay from your account.`,
        ],
        cta: { label: 'View account', url: `${APP_URL}/portal/billing` },
      }),
    }
  })
  return processFlow(admin, 'invoice_chasing', 'Invoice chasing', dryRun, items)
}

// ── 6. Scheduled introductions ────────────────────────────────────────
// Each side of an introduction can be scheduled INDEPENDENTLY. When a side's
// date arrives, send the exact email Sarah composed for that recipient (about
// the other member), stamp email_X_sent_at, clear its schedule, and recompute
// the overall status. Immediate "send now" is handled inline by the admin API.
async function scheduledIntroductions(admin: Admin, dryRun: boolean): Promise<FlowResult> {
  const today = todayDate()
  const { data } = await admin
    .from('introductions')
    .select(
      'id, status, email_a_scheduled_at, email_b_scheduled_at, email_a_sent_at, email_b_sent_at, email_a_subject, email_a_body, email_b_subject, email_b_body, a:members!introductions_member_a_id_fkey(profiles(first_name, last_name, email)), b:members!introductions_member_b_id_fkey(profiles(first_name, last_name, email))',
    )
    .or(
      `and(email_a_scheduled_at.lte.${today},email_a_sent_at.is.null),and(email_b_scheduled_at.lte.${today},email_b_sent_at.is.null)`,
    )

  const items: FlowItem[] = []
  const dueSides: { introId: string; side: 'a' | 'b' }[] = []

  for (const intro of data ?? []) {
    const row = intro as Record<string, unknown>
    const a = one((one(row.a as unknown) as { profiles?: unknown })?.profiles as {
      first_name?: string; last_name?: string; email?: string
    } | null)
    const b = one((one(row.b as unknown) as { profiles?: unknown })?.profiles as {
      first_name?: string; last_name?: string; email?: string
    } | null)
    const nameOf = (p: typeof a) =>
      `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'a fellow member'

    const aDue =
      row.email_a_scheduled_at && (row.email_a_scheduled_at as string) <= today && !row.email_a_sent_at
    const bDue =
      row.email_b_scheduled_at && (row.email_b_scheduled_at as string) <= today && !row.email_b_sent_at

    if (aDue && a?.email) {
      const subj = (row.email_a_subject as string) || 'An introduction from The Club'
      items.push({
        ref_id: `${row.id}:sched:a`,
        to: a.email,
        subject: subj,
        detail: `${nameOf(a)} ↔ ${nameOf(b)}`,
        html: renderIntroEmail(nameOf(b), { subject: subj, body: (row.email_a_body as string) || '' }),
      })
      dueSides.push({ introId: row.id as string, side: 'a' })
    }
    if (bDue && b?.email) {
      const subj = (row.email_b_subject as string) || 'An introduction from The Club'
      items.push({
        ref_id: `${row.id}:sched:b`,
        to: b.email,
        subject: subj,
        detail: `${nameOf(b)} ↔ ${nameOf(a)}`,
        html: renderIntroEmail(nameOf(a), { subject: subj, body: (row.email_b_body as string) || '' }),
      })
      dueSides.push({ introId: row.id as string, side: 'b' })
    }
  }

  const result = await processFlow(admin, 'intro_scheduled', 'Scheduled introductions', dryRun, items)

  if (!dryRun && dueSides.length > 0) {
    const now = new Date().toISOString()
    // Stamp each sent side + clear its schedule.
    for (const d of dueSides) {
      await admin
        .from('introductions')
        .update({ [`email_${d.side}_sent_at`]: now, [`email_${d.side}_scheduled_at`]: null })
        .eq('id', d.introId)
    }
    // Recompute overall status for each affected introduction.
    for (const id of [...new Set(dueSides.map((d) => d.introId))]) {
      const { data: r } = await admin
        .from('introductions')
        .select('email_a_scheduled_at, email_b_scheduled_at, email_a_sent_at, email_b_sent_at, status')
        .eq('id', id)
        .single()
      if (!r) continue
      const stillScheduled = r.email_a_scheduled_at || r.email_b_scheduled_at
      const anySent = r.email_a_sent_at || r.email_b_sent_at
      const terminal = ['accepted', 'completed', 'declined'].includes(r.status as string)
      if (!terminal) {
        const upd: Record<string, unknown> = { status: stillScheduled ? 'scheduled' : anySent ? 'sent' : r.status }
        if (anySent) upd.sent_at = now
        await admin.from('introductions').update(upd).eq('id', id)
      }
    }
  }

  return result
}

export interface AutomationRunResult {
  dryRun: boolean
  flows: FlowResult[]
  totals: { candidates: number; pending: number; sent: number; failed: number }
}

export async function runAllAutomations(dryRun: boolean): Promise<AutomationRunResult> {
  const admin = adminClient()
  const flows = [
    await renewalReminders(admin, dryRun),
    await failedPayments(admin, dryRun),
    await postEventFollowup(admin, dryRun),
    await guestNurture(admin, dryRun),
    await invoiceChasing(admin, dryRun),
    await scheduledIntroductions(admin, dryRun),
  ]
  const totals = flows.reduce(
    (acc, f) => ({
      candidates: acc.candidates + f.candidates,
      pending: acc.pending + f.pending,
      sent: acc.sent + f.sent,
      failed: acc.failed + f.failed,
    }),
    { candidates: 0, pending: 0, sent: 0, failed: 0 },
  )
  return { dryRun, flows, totals }
}
