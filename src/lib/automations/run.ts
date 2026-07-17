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
import { generateSuggestions, pairKey } from '@/lib/introductions/suggest'
import type { MatchCandidate } from '@/lib/introductions/matching'

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
function daysAheadIso(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString()
}
function daysAheadDate(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
}
function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}
// Whole hours from `now` until an ISO instant (negative once it has passed).
function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000
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

// ── Event comms: once-only send backed by event_comms_sent ────────────
// The event reminder + post-event sequences dedup per (booking, kind) via
// the event_comms_sent table instead of automation_log, so each STAGE of a
// multi-stage sequence fires exactly once even if the cron runs late/twice.
interface EventCommsItem {
  eventId: string
  bookingId: string | null
  kind: string
  to: string | null | undefined
  subject: string
  html: string
  detail: string
}

// Which (booking_id, kind) pairs have already been sent for these events.
async function loadCommsSent(
  admin: Admin,
  eventIds: string[],
): Promise<Set<string>> {
  const sent = new Set<string>()
  if (eventIds.length === 0) return sent
  const { data } = await admin
    .from('event_comms_sent')
    .select('event_id, booking_id, kind')
    .in('event_id', eventIds)
  for (const r of (data ?? []) as { event_id: string; booking_id: string | null; kind: string }[]) {
    // Per-attendee stages key on the booking; event-level stages key on the event.
    sent.add(r.booking_id ? `${r.booking_id}:${r.kind}` : `event:${r.event_id}:${r.kind}`)
  }
  return sent
}

// Shared dedup + send + log step for event-comms items. Mirrors processFlow
// but records into event_comms_sent. `flow`/`label` are for the FlowResult
// summary only; the ref_id shown is `bookingId|event:kind`.
async function processEventComms(
  admin: Admin,
  flow: string,
  label: string,
  dryRun: boolean,
  items: EventCommsItem[],
  alreadySent: Set<string>,
): Promise<FlowResult> {
  const valid = items.filter((i) => i.to)
  const pending = valid.filter(
    (i) => !alreadySent.has(`${i.bookingId ?? 'event'}:${i.kind}`),
  )
  const out: FlowResult['items'] = []
  let sent = 0
  let failed = 0

  for (const it of pending) {
    const ref = `${it.bookingId ?? it.eventId}:${it.kind}`
    if (dryRun) {
      out.push({ ref_id: ref, to: it.to as string, detail: it.detail, status: 'would_send' })
      continue
    }
    const r = await sendClubEmail({
      to: it.to as string,
      subject: it.subject,
      html: it.html,
      category: `automation:${it.kind}`,
    })
    if (r.sent) {
      await admin.from('event_comms_sent').insert({
        event_id: it.eventId,
        booking_id: it.bookingId,
        kind: it.kind,
      })
      sent++
    } else {
      failed++
    }
    out.push({
      ref_id: ref,
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
    alreadyHandled: valid.length - pending.length,
    pending: pending.length,
    sent,
    failed,
    items: out,
  }
}

// Booking → recipient email + first name (member or guest).
function bookingRecipient(bk: Record<string, unknown>): { to: string | undefined; name: string } {
  const member = one(bk.members as { profiles?: unknown } | null)
  const prof = one(member?.profiles as { first_name?: string; email?: string } | null)
  const to = (bk.is_guest ? (bk.guest_email as string) : prof?.email) || undefined
  const name = (bk.is_guest ? (bk.guest_name as string) : prof?.first_name) || 'there'
  return { to, name }
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

// ── 3–4. Post-event sequence ──────────────────────────────────────────
// Keyed off the event having PASSED (reference instant = end_date || start_date).
// One helper loads the recently-finished events once; each stage below then
// picks the events in its post-event time band. Once-only per (booking, kind)
// via event_comms_sent. (Supersedes the old post_event_followup +
// guest_nurture flows, folding thank-you / feedback / conversion into
// dedicated, correctly-timed stages.)
interface PastEvent {
  id: string
  title: string
  ref: string // end_date || start_date
  hoursSince: number
}

async function loadRecentlyEndedEvents(admin: Admin): Promise<PastEvent[]> {
  const { data } = await admin
    .from('events')
    .select('id, title, start_date, end_date, status')
    .gte('start_date', daysAgoIso(11))
    .lte('start_date', daysAheadIso(1))
    .in('status', ['completed', 'live', 'published'])
  const out: PastEvent[] = []
  for (const ev of data ?? []) {
    const e = ev as { id: string; title: string; start_date: string; end_date: string | null }
    const ref = e.end_date || e.start_date
    const hoursSince = -hoursUntil(ref)
    if (hoursSince <= 0) continue // not finished yet
    out.push({ id: e.id, title: e.title, ref, hoursSince })
  }
  return out
}

async function confirmedBookings(admin: Admin, eventId: string) {
  const { data } = await admin
    .from('bookings')
    .select(
      'id, is_guest, guest_name, guest_email, member_id, checked_in, attendance, members(profiles(first_name, email))',
    )
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
  return (data ?? []) as Record<string, unknown>[]
}

// Thank-you (immediately after — first 24h band) to every attendee.
async function postEventThankYou(
  admin: Admin,
  dryRun: boolean,
  past: PastEvent[],
  sent: Set<string>,
): Promise<FlowResult> {
  const due = past.filter((e) => e.hoursSince > 0 && e.hoursSince <= 24)
  const items: EventCommsItem[] = []
  for (const ev of due) {
    for (const bk of await confirmedBookings(admin, ev.id)) {
      const { to, name } = bookingRecipient(bk)
      items.push({
        eventId: ev.id,
        bookingId: String(bk.id),
        kind: 'thank_you',
        to,
        subject: `Thank you for joining ${ev.title}`,
        detail: `${ev.title} — ${name}`,
        html: renderClubEmail({
          eyebrow: 'With thanks',
          heading: 'Thank you for joining us.',
          paragraphs: [
            `Hello ${name},`,
            `It was a pleasure to have you at <strong style="color:#F0EBE0;">${ev.title}</strong>. We hope it was an evening well spent.`,
            `We'll be in touch shortly — in the meantime, do stay in the conversation.`,
          ],
          cta: { label: 'See what’s next', url: `${APP_URL}/events` },
        }),
      })
    }
  }
  return processEventComms(admin, 'event_thank_you', 'Post-event · thank you', dryRun, items, sent)
}

// Feedback request (24–48h band).
async function postEventFeedback(
  admin: Admin,
  dryRun: boolean,
  past: PastEvent[],
  sent: Set<string>,
): Promise<FlowResult> {
  const due = past.filter((e) => e.hoursSince > 24 && e.hoursSince <= 48)
  const items: EventCommsItem[] = []
  for (const ev of due) {
    for (const bk of await confirmedBookings(admin, ev.id)) {
      const { to, name } = bookingRecipient(bk)
      items.push({
        eventId: ev.id,
        bookingId: String(bk.id),
        kind: 'feedback',
        to,
        subject: `Your reflections on ${ev.title}`,
        detail: `${ev.title} — ${name}`,
        html: renderClubEmail({
          eyebrow: 'We’d love to hear',
          heading: 'How was your evening?',
          paragraphs: [
            `Hello ${name},`,
            `Now that <strong style="color:#F0EBE0;">${ev.title}</strong> has settled, we'd be grateful for your reflections — your feedback shapes every evening that follows.`,
            `Share a note, or book a call with the team if you'd like to speak.`,
          ],
          cta: { label: 'Share your thoughts', url: `${APP_URL}/share-your-experience` },
        }),
      })
    }
  }
  return processEventComms(admin, 'event_feedback', 'Post-event · feedback', dryRun, items, sent)
}

// Membership conversion (7-day band) to NON-member guests only.
async function postEventConversion(
  admin: Admin,
  dryRun: boolean,
  past: PastEvent[],
  sent: Set<string>,
): Promise<FlowResult> {
  const due = past.filter((e) => e.hoursSince > 168 && e.hoursSince <= 216)
  const items: EventCommsItem[] = []
  for (const ev of due) {
    for (const bk of await confirmedBookings(admin, ev.id)) {
      // Non-member guests only — someone with a member_id is already in.
      if (!bk.is_guest && bk.member_id) continue
      const { to, name } = bookingRecipient(bk)
      items.push({
        eventId: ev.id,
        bookingId: String(bk.id),
        kind: 'conversion',
        to,
        subject: 'An invitation to The Club',
        detail: `${ev.title} — ${name}`,
        html: renderClubEmail({
          eyebrow: 'Membership',
          heading: 'It was lovely to have you.',
          paragraphs: [
            `Hello ${name},`,
            `We so enjoyed having you as our guest at <strong style="color:#F0EBE0;">${ev.title}</strong>. The Club is a private community built around trusted introductions and curated evenings — and we'd be glad to tell you more about joining.`,
          ],
          cta: { label: 'Explore membership', url: `${APP_URL}/memberships` },
        }),
      })
    }
  }
  return processEventComms(admin, 'event_conversion', 'Post-event · conversion', dryRun, items, sent)
}

// AI introduction recommendations among the event's ATTENDEES (48–96h band).
// REUSES the existing deterministic matching engine (generateSuggestions /
// scorePairForSuggestion) — the SAME code the admin "Generate suggestions"
// button runs — but feeds it ONLY the members who attended this event, so the
// candidate pairs are naturally scoped to the attendee subset. Inserts new
// pairs as introductions rows at status='suggested' (requested_by=null) so
// they land in the existing Approve/Dismiss queue; never auto-sends.
// Tracked once per event via event_comms_sent (booking_id=null, kind=intro_recs).
async function postEventIntroRecs(
  admin: Admin,
  dryRun: boolean,
  past: PastEvent[],
  sent: Set<string>,
): Promise<FlowResult> {
  const due = past.filter((e) => e.hoursSince > 48 && e.hoursSince <= 96)
  const out: FlowResult['items'] = []
  let created = 0
  let candidates = 0
  let alreadyHandled = 0

  for (const ev of due) {
    // Per-event guard (booking_id is null, so the unique index can't dedup it):
    // check the preloaded ledger set, keyed per event.
    if (sent.has(`event:${ev.id}:intro_recs`)) {
      alreadyHandled++
      continue
    }
    candidates++

    // Attendees = members who actually turned up (checked_in or attendance).
    const { data: att } = await admin
      .from('bookings')
      .select('member_id, checked_in, attendance')
      .eq('event_id', ev.id)
      .eq('status', 'confirmed')
      .not('member_id', 'is', null)
    const attendeeIds = [
      ...new Set(
        (att ?? [])
          .filter(
            (b: Record<string, unknown>) =>
              b.checked_in === true || b.attendance === 'attended',
          )
          .map((b: Record<string, unknown>) => b.member_id as string),
      ),
    ]
    const detail = `${ev.title} — ${attendeeIds.length} attendee(s)`
    if (attendeeIds.length < 2) {
      // Nothing to pair — still stamp so we don't re-scan this event daily.
      if (!dryRun) {
        await admin
          .from('event_comms_sent')
          .insert({ event_id: ev.id, booking_id: null, kind: 'intro_recs' })
      }
      out.push({ ref_id: `${ev.id}:intro_recs`, to: '', detail: `${detail} — skipped (<2)`, status: dryRun ? 'would_send' : 'sent' })
      continue
    }

    if (dryRun) {
      out.push({ ref_id: `${ev.id}:intro_recs`, to: '', detail: `${detail} — would suggest`, status: 'would_send' })
      continue
    }

    const suggestions = await buildAttendeeSuggestions(admin, attendeeIds)
    if (suggestions > 0) created += suggestions
    await admin
      .from('event_comms_sent')
      .insert({ event_id: ev.id, booking_id: null, kind: 'intro_recs' })
    out.push({
      ref_id: `${ev.id}:intro_recs`,
      to: '',
      detail: `${detail} — ${suggestions} suggested`,
      status: 'sent',
    })
  }

  return {
    flow: 'event_intro_recs',
    label: 'Post-event · AI intro recs',
    candidates,
    alreadyHandled,
    pending: candidates,
    sent: created,
    failed: 0,
    items: out,
  }
}

// Load the given members + tags, run the existing suggestion engine over ONLY
// them, and insert new pairs as 'suggested' introductions. Returns the number
// of new suggestions created. Mirrors the admin generate-suggestions route,
// scoped to an attendee subset.
async function buildAttendeeSuggestions(admin: Admin, memberIds: string[]): Promise<number> {
  const [membersRes, tagsRes, introsRes] = await Promise.all([
    admin
      .from('members')
      .select(
        'id, company_name, sector, sub_sector, intro_target_types, intro_target_criteria, what_they_can_offer, profiles(first_name, last_name, company_name, email)',
      )
      .in('id', memberIds)
      .eq('membership_status', 'active')
      .is('deleted_at', null),
    admin.from('member_tags').select('member_id, tag_id, tags(name, category)').in('member_id', memberIds),
    admin.from('introductions').select('member_a_id, member_b_id').or(
      memberIds.map((id) => `member_a_id.eq.${id},member_b_id.eq.${id}`).join(','),
    ),
  ])

  const tagMap = new Map<string, { tagId: string; name: string; category: string }[]>()
  for (const row of (tagsRes.data ?? []) as unknown as Array<{
    member_id: string
    tag_id: string
    tags: { name: string; category: string } | null
  }>) {
    if (!row.tags) continue
    const arr = tagMap.get(row.member_id) ?? []
    arr.push({ tagId: row.tag_id, name: row.tags.name, category: row.tags.category })
    tagMap.set(row.member_id, arr)
  }

  const candidates: MatchCandidate[] = (
    (membersRes.data ?? []) as unknown as Array<{
      id: string
      company_name: string | null
      sector: string | null
      sub_sector: string | null
      intro_target_types: string | null
      intro_target_criteria: string | null
      what_they_can_offer: string | null
      profiles: { first_name: string | null; last_name: string | null; company_name: string | null; email: string | null } | null
    }>
  ).map((m) => ({
    id: m.id,
    name: `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim() || 'Unnamed',
    company: m.company_name ?? m.profiles?.company_name ?? null,
    email: m.profiles?.email ?? null,
    tags: tagMap.get(m.id) ?? [],
    sector: m.sector,
    subSector: m.sub_sector,
    introTargetTypes: m.intro_target_types,
    introTargetCriteria: m.intro_target_criteria,
    whatTheyCanOffer: m.what_they_can_offer,
  }))

  const existingPairKeys = new Set<string>()
  for (const intro of (introsRes.data ?? []) as Array<{ member_a_id: string; member_b_id: string }>) {
    existingPairKeys.add(pairKey(intro.member_a_id, intro.member_b_id))
  }

  const suggestions = generateSuggestions(candidates, existingPairKeys, { minScore: 0.5, cap: 20 })
  if (suggestions.length === 0) return 0

  const rows = suggestions.map((s) => ({
    member_a_id: s.memberAId,
    member_b_id: s.memberBId,
    status: 'suggested' as const,
    match_score: s.matchScore,
    match_reason: s.matchReason || null,
    matching_tags: null,
    requested_by: null,
  }))
  const { data: inserted } = await admin.from('introductions').insert(rows).select('id')
  return inserted?.length ?? 0
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
      'id, status, member_a_id, member_b_id, email_a_scheduled_at, email_b_scheduled_at, email_a_sent_at, email_b_sent_at, email_a_subject, email_a_body, email_b_subject, email_b_body, a:members!introductions_member_a_id_fkey(profiles(first_name, last_name, email)), b:members!introductions_member_b_id_fkey(profiles(first_name, last_name, email))',
    )
    .or(
      `and(email_a_scheduled_at.lte.${today},email_a_sent_at.is.null),and(email_b_scheduled_at.lte.${today},email_b_sent_at.is.null)`,
    )

  const items: FlowItem[] = []
  const dueSides: { introId: string; side: 'a' | 'b' }[] = []
  // Introductions that had never been sent before this run — used to count
  // soft quota usage once, against both members, on first send.
  const firstSend = new Map<string, { a: string; b: string }>()

  for (const intro of data ?? []) {
    const row = intro as Record<string, unknown>
    if (!row.email_a_sent_at && !row.email_b_sent_at) {
      firstSend.set(row.id as string, {
        a: row.member_a_id as string,
        b: row.member_b_id as string,
      })
    }
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
      // Soft quota: first time this intro is actually sent, count it
      // against both members' monthly allowance (display-only).
      const fs = firstSend.get(id)
      if (fs && anySent) await bumpIntroUsage(admin, [fs.a, fs.b])
    }
  }

  return result
}

// Soft introduction quota — increment each member's monthly usage counter.
// Display-only (the portal shows "X remaining"); never blocks a send.
async function bumpIntroUsage(admin: Admin, memberIds: string[]): Promise<void> {
  for (const id of memberIds) {
    const { data: m } = await admin
      .from('members')
      .select('intros_used_this_month')
      .eq('id', id)
      .maybeSingle()
    const used = ((m?.intros_used_this_month as number) ?? 0) + 1
    await admin.from('members').update({ intros_used_this_month: used }).eq('id', id)
  }
}

// ── 7. Pre-event reminder SEQUENCE ────────────────────────────────────
// A staged countdown to confirmed attendees (members + guests) at
// 14 days / 7 days / 48 hours / morning-of, relative to the event start.
// hoursUntil maps each booking to exactly one non-overlapping band, so a
// daily/hourly cron sends the right single stage per run; once-only per
// (booking, kind) is guaranteed by event_comms_sent.
const REMINDER_STAGES: { kind: string; minH: number; maxH: number; eyebrow: string; when: string }[] = [
  { kind: 'reminder_14d', minH: 168, maxH: 336, eyebrow: 'Save the date', when: 'in a fortnight' },
  { kind: 'reminder_7d', minH: 48, maxH: 168, eyebrow: 'One week to go', when: 'next week' },
  { kind: 'reminder_48h', minH: 14, maxH: 48, eyebrow: 'Almost here', when: 'in two days' },
  { kind: 'reminder_morning', minH: 0, maxH: 14, eyebrow: 'Today', when: 'today' },
]

async function eventReminderSequence(
  admin: Admin,
  dryRun: boolean,
  sent: Set<string>,
): Promise<FlowResult> {
  // Upcoming events within the 14-day reminder window.
  const { data: events } = await admin
    .from('events')
    .select('id, title, start_date, venue_name, venue_city')
    .gte('start_date', new Date().toISOString())
    .lte('start_date', daysAheadIso(15))
    .in('status', ['published', 'live'])

  const items: EventCommsItem[] = []
  for (const ev of events ?? []) {
    const e = ev as {
      id: string
      title: string
      start_date: string
      venue_name: string | null
      venue_city: string | null
    }
    const h = hoursUntil(e.start_date)
    // The single band this event currently sits in (bands are contiguous).
    const stage = REMINDER_STAGES.find((s) => h > s.minH && h <= s.maxH)
    if (!stage) continue

    const { data: bookings } = await admin
      .from('bookings')
      .select('id, is_guest, guest_name, guest_email, members(profiles(first_name, email))')
      .eq('event_id', e.id)
      .eq('status', 'confirmed')
    const where = [e.venue_name, e.venue_city].filter(Boolean).join(', ')
    for (const b of bookings ?? []) {
      const bk = b as Record<string, unknown>
      const { to, name } = bookingRecipient(bk)
      items.push({
        eventId: e.id,
        bookingId: String(bk.id),
        kind: stage.kind,
        to,
        subject:
          stage.kind === 'reminder_morning'
            ? `Today — ${e.title}`
            : `A reminder — ${e.title} is ${stage.when}`,
        detail: `${e.title} (${stage.kind}) — ${name}`,
        html: renderClubEmail({
          eyebrow: stage.eyebrow,
          heading:
            stage.kind === 'reminder_morning'
              ? `${e.title} is today.`
              : `${e.title} is ${stage.when}.`,
          paragraphs: [
            `Hello ${name},`,
            `A gentle reminder that <strong style="color:#F0EBE0;">${e.title}</strong> takes place on <strong style="color:#F0EBE0;">${fmtDate(e.start_date)}</strong>${where ? ` at ${where}` : ''}.`,
            `We look forward to welcoming you.`,
          ],
        }),
      })
    }
  }
  return processEventComms(admin, 'event_reminder', 'Pre-event reminders', dryRun, items, sent)
}

// ── Maintenance: transition past-due pending payments to 'overdue' ─────
// Nothing else in the app produces the `overdue` status, so the Finance
// overdue card and the invoice-chasing flow would never fire. Run this
// before the email flows so chasing picks up freshly-overdue invoices.
async function markOverduePayments(admin: Admin): Promise<void> {
  await admin
    .from('payments')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_date', todayDate())
    .not('due_date', 'is', null)
}

// ── Maintenance: reset monthly introduction usage at the turn of a month ─
// Tracks the last reset month in app_settings so it runs once per calendar
// month regardless of how often the cron fires.
async function resetMonthlyQuotasIfDue(admin: Admin): Promise<void> {
  const month = new Date().toISOString().slice(0, 7) // YYYY-MM
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'intros_reset_month')
    .maybeSingle()
  const last = (data?.value as string | null) ?? null
  if (last === month) return
  await admin.from('members').update({ intros_used_this_month: 0 }).gt('intros_used_this_month', 0)
  await admin
    .from('app_settings')
    .upsert({ key: 'intros_reset_month', value: month }, { onConflict: 'key' })
}

export interface AutomationRunResult {
  dryRun: boolean
  flows: FlowResult[]
  totals: { candidates: number; pending: number; sent: number; failed: number }
}

export async function runAllAutomations(dryRun: boolean): Promise<AutomationRunResult> {
  const admin = adminClient()
  // State maintenance runs only on a real run (not preview): age past-due
  // invoices to 'overdue' and reset monthly intro counters at month-turn.
  if (!dryRun) {
    await markOverduePayments(admin)
    await resetMonthlyQuotasIfDue(admin)
  }
  // Event sequences dedup via event_comms_sent. Load the ledger once for
  // every event in play (upcoming 15d + recently-ended 11d) so each stage
  // knows what has already been sent.
  const { data: liveEvents } = await admin
    .from('events')
    .select('id')
    .gte('start_date', daysAgoIso(11))
    .lte('start_date', daysAheadIso(15))
  const eventIds = (liveEvents ?? []).map((e: { id: string }) => e.id)
  const commsSent = await loadCommsSent(admin, eventIds)
  const pastEvents = await loadRecentlyEndedEvents(admin)

  const flows = [
    await renewalReminders(admin, dryRun),
    await failedPayments(admin, dryRun),
    await eventReminderSequence(admin, dryRun, commsSent),
    await postEventThankYou(admin, dryRun, pastEvents, commsSent),
    await postEventFeedback(admin, dryRun, pastEvents, commsSent),
    await postEventIntroRecs(admin, dryRun, pastEvents, commsSent),
    await postEventConversion(admin, dryRun, pastEvents, commsSent),
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
