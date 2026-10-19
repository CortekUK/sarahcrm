// Sponsor outreach REPLY TRACKING — reads the synced Gmail table, never Gmail.
//
// Outreach is sent through Resend, so there is no Gmail thread id to follow.
// Every step carries reply_to = a Gmail-SYNCED inbox (SPONSOR_OUTREACH_REPLY_TO,
// default GOOGLE_WORKSPACE_SUBJECT — see ./resend.ts), so a prospect's reply
// arrives in that inbox and is synced as an inbound message from their
// address. Matching deliberately ignores which synced mailbox a message came
// from, so replies landing in the reply-to inbox (or any other synced inbox,
// e.g. a reply-all) all count.
//
// After each Gmail sync (and again at the start of the daily runner, before
// any scheduled step is sent) we look in public.gmail_messages for an INBOUND
// message that arrived after one of our steps was sent and that is:
//
//   1. from the exact address the step was sent to, or
//   2. from a colleague at the same company domain (not a free-mail domain)
//      whose subject is our step's subject (ignoring "Re:" / "Fwd:").
//
// Auto-replies (out-of-office, automatic reply, delivery failures) are
// ignored so a holiday notice doesn't stop a sequence.
//
// On a match, for that prospect:
//   • the step being replied to → status 'replied' + response_at /
//     response_snippet / response_gmail_message_id,
//   • every not-yet-sent step (draft/approved) → 'cancelled',
//   • sponsor_prospects.replied_at is stamped (the "Replied" badge, and the
//     runner never auto-sends to a replied prospect again) and the prospect
//     moves to 'responded' if it was at an earlier stage.
//
// Idempotent: only prospects with replied_at still null are considered.
// Never throws — returns counts; any DB error just yields zero matches.

import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelPendingSteps } from './sequence'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

// Only look for replies to steps sent in the last ~6 months.
const REPLY_LOOKBACK_DAYS = 180
// Keep PostgREST URLs short when filtering by many addresses / domains.
const CHUNK = 80

// Domains shared by many unrelated people — a same-domain match means nothing.
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'btinternet.com',
  'sky.com',
])

// Strong auto-reply / bounce subjects. Conservative on purpose.
const AUTO_REPLY_SUBJECT =
  /^\s*(automatic reply|auto[- ]?reply|autoreply|out of (the )?office|ooo\b|away from (the )?office|undeliverable|delivery status notification|mail delivery (failed|failure|subsystem))/i
const AUTO_REPLY_SENDER = /^(mailer-daemon|postmaster|no-?reply|donotreply)@/i

// Exported for offline testing.
export function isAutoReply(subject: string | null, fromEmail: string | null): boolean {
  if (fromEmail && AUTO_REPLY_SENDER.test(fromEmail)) return true
  return !!subject && AUTO_REPLY_SUBJECT.test(subject)
}

// "Re: RE: Fwd: Hello there " → "hello there"
export function normaliseSubject(subject: string | null | undefined): string {
  let s = (subject ?? '').trim().toLowerCase()
  for (;;) {
    const next = s.replace(/^(re|fw|fwd|aw|sv)\s*(\[\d+\])?\s*:\s*/i, '')
    if (next === s) break
    s = next
  }
  return s.replace(/\s+/g, ' ').trim()
}

export function emailDomain(email: string | null | undefined): string | null {
  const at = (email ?? '').lastIndexOf('@')
  if (at < 0) return null
  const d = (email as string).slice(at + 1).trim().toLowerCase()
  return d || null
}

export interface SentStep {
  id: string
  prospect_id: string
  to_email: string
  subject: string | null
  sent_at: string
}

export interface InboundMessage {
  gmail_message_id: string
  from_email: string | null
  subject: string | null
  snippet: string | null
  internal_date: string
}

export interface ReplyMatch {
  prospectId: string
  stepId: string
  message: InboundMessage
}

// Pure matcher (no I/O) — exported so the rules can be verified offline.
// For each prospect, returns the EARLIEST inbound message that counts as a
// reply, and the step it replies to (the latest step sent before it, preferring
// one whose subject it matches).
export function matchReplies(steps: SentStep[], messages: InboundMessage[]): ReplyMatch[] {
  const byProspect = new Map<string, SentStep[]>()
  for (const s of steps) {
    const list = byProspect.get(s.prospect_id) ?? []
    list.push({ ...s, to_email: s.to_email.trim().toLowerCase() })
    byProspect.set(s.prospect_id, list)
  }

  const sortedMsgs = messages
    .filter((m) => m.from_email && !isAutoReply(m.subject, m.from_email))
    .slice()
    .sort((a, b) => a.internal_date.localeCompare(b.internal_date))

  const out: ReplyMatch[] = []
  for (const [prospectId, list] of byProspect) {
    for (const m of sortedMsgs) {
      const from = (m.from_email as string).toLowerCase()
      const fromDomain = emailDomain(from)
      const msgTime = new Date(m.internal_date).getTime()
      const msgSubject = normaliseSubject(m.subject)

      // Steps sent before this message arrived.
      const earlier = list.filter((s) => new Date(s.sent_at).getTime() < msgTime)
      if (earlier.length === 0) continue

      const exact = earlier.filter((s) => s.to_email === from)
      const sameDomainSubject = earlier.filter((s) => {
        const d = emailDomain(s.to_email)
        return (
          !!d &&
          d === fromDomain &&
          !FREE_MAIL_DOMAINS.has(d) &&
          !!msgSubject &&
          normaliseSubject(s.subject) === msgSubject
        )
      })
      if (exact.length === 0 && sameDomainSubject.length === 0) continue

      // Prefer the step whose subject the reply carries, else the latest sent.
      const pool = [...exact, ...sameDomainSubject]
      const bySubject = pool.filter((s) => msgSubject && normaliseSubject(s.subject) === msgSubject)
      const pick = (bySubject.length ? bySubject : pool)
        .slice()
        .sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0]
      out.push({ prospectId, stepId: pick.id, message: m })
      break
    }
  }
  return out
}

export interface ReplyDetectionResult {
  checkedProspects: number
  matched: number
  cancelledSteps: number
  // Prospect ids found to have replied (also returned on a dry run, so the
  // runner's preview can exclude them).
  repliedProspectIds: string[]
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Read sent steps + synced inbound mail, match, and (unless dryRun) record
// replies and stop the sequences.
export async function detectOutreachReplies(
  admin: Admin,
  opts: { dryRun?: boolean } = {},
): Promise<ReplyDetectionResult> {
  const empty: ReplyDetectionResult = {
    checkedProspects: 0,
    matched: 0,
    cancelledSteps: 0,
    repliedProspectIds: [],
  }
  try {
    const sinceIso = new Date(Date.now() - REPLY_LOOKBACK_DAYS * 86_400_000).toISOString()

    // ── 1. Steps we have actually sent, recently, with a recipient ─────
    const { data: sentRows, error: sentErr } = await admin
      .from('sponsor_outreach')
      .select('id, prospect_id, to_email, subject, sent_at')
      .eq('status', 'sent')
      .not('to_email', 'is', null)
      .not('sent_at', 'is', null)
      .gte('sent_at', sinceIso)
      .limit(5000)
    if (sentErr || !sentRows || sentRows.length === 0) return empty

    // ── 2. Drop prospects already marked as replied ────────────────────
    const prospectIds = [...new Set(sentRows.map((r) => r.prospect_id as string))]
    const silent = new Set<string>()
    for (const ids of chunk(prospectIds, CHUNK)) {
      const { data, error } = await admin
        .from('sponsor_prospects')
        .select('id, replied_at')
        .in('id', ids)
      if (error) return empty // e.g. replied_at missing before the migration
      for (const p of data ?? []) if (!p.replied_at) silent.add(p.id as string)
    }
    const steps: SentStep[] = (sentRows as SentStep[]).filter((r) => silent.has(r.prospect_id))
    if (steps.length === 0) return empty

    // ── 3. Candidate inbound mail from those addresses / domains ───────
    const minSent = steps.reduce((m, s) => (s.sent_at < m ? s.sent_at : m), steps[0].sent_at)
    const emails = [...new Set(steps.map((s) => s.to_email.trim().toLowerCase()))]
    const domains = [
      ...new Set(
        emails
          .map((e) => emailDomain(e))
          // Only plain hostnames go into the PostgREST filter string below.
          .filter((d): d is string => !!d && !FREE_MAIL_DOMAINS.has(d) && /^[a-z0-9.-]+$/.test(d)),
      ),
    ]

    const messages = new Map<string, InboundMessage>()
    const cols = 'gmail_message_id, from_email, subject, snippet, internal_date'
    for (const batch of chunk(emails, CHUNK)) {
      const { data } = await admin
        .from('gmail_messages')
        .select(cols)
        .eq('direction', 'inbound')
        .in('from_email', batch)
        .gte('internal_date', minSent)
        .limit(2000)
      for (const m of (data ?? []) as InboundMessage[]) messages.set(m.gmail_message_id, m)
    }
    for (const batch of chunk(domains, CHUNK)) {
      const { data } = await admin
        .from('gmail_messages')
        .select(cols)
        .eq('direction', 'inbound')
        .or(batch.map((d) => `from_email.ilike.*@${d}`).join(','))
        .gte('internal_date', minSent)
        .limit(2000)
      for (const m of (data ?? []) as InboundMessage[]) messages.set(m.gmail_message_id, m)
    }

    const matches = matchReplies(steps, [...messages.values()])
    const result: ReplyDetectionResult = {
      checkedProspects: silent.size,
      matched: matches.length,
      cancelledSteps: 0,
      repliedProspectIds: matches.map((m) => m.prospectId),
    }
    if (opts.dryRun || matches.length === 0) return result

    // ── 4. Record each reply + stop that prospect's sequences ──────────
    const nowIso = new Date().toISOString()
    for (const match of matches) {
      try {
        const at = match.message.internal_date
        await admin
          .from('sponsor_outreach')
          .update({
            status: 'replied',
            response_at: at,
            response_snippet: (match.message.snippet ?? '').slice(0, 500) || null,
            response_gmail_message_id: match.message.gmail_message_id,
            updated_at: nowIso,
          })
          .eq('id', match.stepId)

        result.cancelledSteps += await cancelPendingSteps(admin, match.prospectId)

        const { data: prospect } = await admin
          .from('sponsor_prospects')
          .select('id, status')
          .eq('id', match.prospectId)
          .maybeSingle()
        const update: Record<string, unknown> = { replied_at: at, updated_at: nowIso }
        if (
          prospect &&
          ['suggested', 'shortlisted', 'approved', 'contacted'].includes(prospect.status as string)
        ) {
          update.status = 'responded'
        }
        await admin.from('sponsor_prospects').update(update).eq('id', match.prospectId)
      } catch (e) {
        console.error(`[outreach/replies] recording reply for ${match.prospectId} failed:`, e)
      }
    }
    return result
  } catch (e) {
    console.error('[outreach/replies] detection failed:', e)
    return empty
  }
}
