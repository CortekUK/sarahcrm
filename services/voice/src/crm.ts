// CRM writes (Supabase, service role — bypasses RLS).
//
// Enquiries are inserted DIRECTLY rather than via POST /api/enquiries/intake:
// the intake requires an email (callers often don't give one) and always
// sends an acknowledgement email to the enquirer (no flag to suppress it) plus
// an admin notification EMAIL. The project rule is that this agent never
// emails anyone, so we replicate the intake's minimum here: scored enquiry
// row → owner routing (app_settings.enquiry_routing, else first admin) →
// follow-up task linked both ways → an in-app admin_notifications row.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { log, maskPhone } from './log.js'
import { phoneDigits, speakablePhone } from './phone.js'
import { scoreEnquiry } from './scoring.js'
import { callerName } from './summary.js'
import type { CallCapture, CallerMatch, CallTeam, Interest } from './types.js'
import { NO_MATCH } from './types.js'

export type Db = SupabaseClient

export function createDb(url: string | undefined, key: string | undefined): Db | null {
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export const TEAM_LABEL: Record<CallTeam, string> = {
  sales: 'Membership team',
  events: 'Events team',
  sarah: 'Sarah',
}

const TEAM_TASK_CATEGORY: Record<CallTeam, string> = { sales: 'sales', events: 'events', sarah: 'general' }

/** Caller interest → enquiries.intent (the existing intents the routing knows). */
export function intentForInterest(i: Interest | null, team: CallTeam | null): string {
  switch (i) {
    case 'membership':
    case 'event':
    case 'private_event':
    case 'sponsorship':
    case 'concierge':
    case 'press':
      return i
    default:
      if (team === 'events') return 'private_event'
      if (team === 'sales') return 'membership'
      return 'general'
  }
}

export function londonDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d) // YYYY-MM-DD
}

export function nextBusinessDay(now: Date): string {
  const d = new Date(now.getTime())
  do {
    d.setUTCDate(d.getUTCDate() + 1)
  } while ([0, 6].includes(new Date(`${londonDate(d)}T12:00:00Z`).getUTCDay()))
  return londonDate(d)
}

export function preferredLabel(cb: NonNullable<CallCapture['callback']>): string {
  const parts: string[] = []
  if (cb.preferredText) parts.push(cb.preferredText)
  if (cb.preferredAt) {
    parts.push(
      `≈ ${new Date(cb.preferredAt).toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}`,
    )
  }
  return parts.join(' ') || 'not specified'
}

// ── voice_calls ────────────────────────────────────────────────

export async function insertCallStart(
  db: Db,
  row: { callSid: string; from: string | null; to: string | null; direction: string },
): Promise<void> {
  const { error } = await db.from('voice_calls').upsert(
    {
      call_sid: row.callSid,
      from_number: row.from,
      to_number: row.to,
      direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
      status: 'in_progress',
      started_at: new Date().toISOString(),
    },
    { onConflict: 'call_sid', ignoreDuplicates: true },
  )
  if (error) log.error('call_insert_failed', error.message, { callSid: row.callSid })
}

/** Twilio status callback values → voice_calls.status. */
export function mapCallStatus(s: string | undefined): string {
  switch ((s ?? '').toLowerCase()) {
    case 'queued':
    case 'ringing':
      return 'ringing'
    case 'in-progress':
      return 'in_progress'
    case 'completed':
      return 'completed'
    case 'busy':
      return 'busy'
    case 'no-answer':
      return 'no_answer'
    case 'canceled':
      return 'canceled'
    case 'failed':
      return 'failed'
    default:
      return 'completed'
  }
}

export const FAILED_STATUSES = new Set(['busy', 'no_answer', 'canceled', 'failed'])

export async function updateCallStatus(
  db: Db,
  callSid: string,
  status: string,
  durationS: number | null,
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status !== 'ringing' && status !== 'in_progress') patch.ended_at = new Date().toISOString()
  if (durationS !== null) patch.duration_s = durationS
  const { error } = await db.from('voice_calls').update(patch).eq('call_sid', callSid)
  if (error) log.error('call_status_update_failed', error.message, { callSid })
}

// ── caller matching ────────────────────────────────────────────

export async function matchCaller(db: Db | null, phone: string | null): Promise<CallerMatch> {
  if (!db || !phoneDigits(phone)) return NO_MATCH
  try {
    const { data, error } = await db.rpc('voice_match_caller', { p_phone: phone })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { kind: string; id: string; first_name: string | null; last_name: string | null }[]
    const name = (r: { first_name: string | null; last_name: string | null }) =>
      [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null
    const m = rows.find((r) => r.kind === 'member')
    const c = rows.find((r) => r.kind === 'contact')
    return {
      memberId: m?.id ?? null,
      memberName: m ? name(m) : null,
      contactId: c?.id ?? null,
      contactName: c ? name(c) : null,
    }
  } catch (e) {
    log.warn('caller_match_failed', { phone: maskPhone(phone), error: e instanceof Error ? e.message : String(e) })
    return NO_MATCH
  }
}

// ── enquiry + task + notification ──────────────────────────────

export interface EnquiryInput {
  capture: CallCapture
  callerId: string | null
  match: CallerMatch
  callId: string | null // voice_calls.id for the deep link
  summary: string
}

export function composeEnquiryMessage(i: EnquiryInput): string {
  const c = i.capture
  const lines: (string | null)[] = []
  if (c.callback) {
    lines.push(`Call requested (${TEAM_LABEL[c.callback.team]}): preferred ${preferredLabel(c.callback)}`)
  }
  lines.push(c.notes ? `Message: ${c.notes}` : null)
  lines.push(c.interest ? `Interested in: ${c.interest.replace(/_/g, ' ')}` : null)
  lines.push(c.company ? `Company: ${c.company}` : null)
  lines.push(c.role ? `Role: ${c.role}` : null)
  // No enquiry column fits a caller-stated figure (company_revenue* are Clay
  // enrichment fields) — same convention as the website concierge.
  lines.push(c.turnoverBand ? `Approx. turnover: ${c.turnoverBand} (stated by the caller)` : null)
  if (i.match.memberId) lines.push(`Caller ID matches member: ${i.match.memberName ?? i.match.memberId}`)
  else if (i.match.contactId) lines.push(`Caller ID matches contact: ${i.match.contactName ?? i.match.contactId}`)
  lines.push(
    '',
    `Call summary: ${i.summary}`,
    '',
    `Captured by the AI phone receptionist. Caller ID: ${i.callerId ?? 'withheld'}${
      c.phoneConfirmed ? ' (callback number confirmed)' : ''
    }.`,
  )
  return lines.filter((l): l is string => l !== null).join('\n')
}

async function resolveOwner(db: Db, intent: string): Promise<string | null> {
  try {
    const { data: routingRow } = await db.from('app_settings').select('value').eq('key', 'enquiry_routing').maybeSingle()
    const routing = ((routingRow as { value?: unknown } | null)?.value ?? {}) as Record<string, unknown>
    const routed = routing[intent]
    if (typeof routed === 'string' && routed) return routed
    const { data: firstAdmin } = await db
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    return (firstAdmin as { id: string } | null)?.id ?? null
  } catch (e) {
    log.error('owner_routing_failed', e)
    return null
  }
}

/** Inserts the enquiry (+ owner). Returns its id or null. Never throws. */
export async function insertEnquiry(db: Db, i: EnquiryInput): Promise<{ id: string; ownerId: string | null; score: number } | null> {
  const c = i.capture
  const intent = intentForInterest(c.interest, c.callback?.team ?? null)
  const phone = c.phone ?? i.callerId
  const message = composeEnquiryMessage(i)
  const { score, reasons } = scoreEnquiry({ email: c.email, phone, company: c.company, intent: [intent], message })
  const base = {
    first_name: c.firstName ?? 'Caller',
    last_name: c.lastName || '—',
    // enquiries.email is NOT NULL; '' = not given on the phone.
    email: c.email ?? '',
    phone,
    company: c.company,
    position: c.role,
    intent: [intent],
    message,
    source: 'phone_agent',
    status: 'new',
    lead_score: score,
    score_reasons: reasons,
  }
  const callFields = c.callback
    ? {
        call_requested_at: c.callback.requestedAt,
        call_team: c.callback.team,
        call_preferences: preferredLabel(c.callback),
      }
    : {}
  try {
    let res = await db.from('enquiries').insert({ ...base, ...callFields }).select('id').single()
    if (res.error && c.callback && /call_/i.test(res.error.message)) {
      // 20261016_concierge_events_calls.sql not applied — the call is still in the message.
      log.warn('enquiry_call_columns_missing')
      res = await db.from('enquiries').insert(base).select('id').single()
    }
    if (res.error || !res.data) throw new Error(res.error?.message ?? 'no row')
    const id = (res.data as { id: string }).id
    const ownerId = await resolveOwner(db, intent)
    if (ownerId) await db.from('enquiries').update({ assigned_to: ownerId }).eq('id', id)
    return { id, ownerId, score }
  } catch (e) {
    log.error('enquiry_insert_failed', e)
    return null
  }
}

export interface TaskInput {
  capture: CallCapture
  callerId: string | null
  match: CallerMatch
  summary: string
  callId: string | null
  enquiryId: string | null
  ownerId: string | null
  score: number | null
  now: Date
}

export function taskForCall(t: TaskInput): Record<string, unknown> | null {
  const c = t.capture
  const who = callerName(c) ?? speakablePhone(c.phone ?? t.callerId) ?? 'withheld number'
  const number = speakablePhone(c.phone ?? t.callerId)
  const link = t.callId ? `\nTranscript: /dashboard/calls?call=${t.callId}` : ''
  const common = {
    status: 'todo',
    assigned_to: t.ownerId,
    related_enquiry_id: t.enquiryId,
    related_member_id: t.match.memberId,
  }
  if (c.escalation) {
    return {
      ...common,
      title: `Escalated call: ${who} — ${c.escalation.category}`,
      description: `${c.escalation.reason}\nCall back on ${number ?? 'unknown number'}.\n\n${t.summary}${link}`,
      category: 'general',
      priority: 'high',
      due_date: nextBusinessDay(t.now),
    }
  }
  if (c.callback) {
    return {
      ...common,
      title: `Call back: ${who}${number && callerName(c) ? ` (${number})` : ''} — preferred ${preferredLabel(c.callback)} (${TEAM_LABEL[c.callback.team]})`.slice(0, 300),
      description: `${t.summary}\nFrom the AI phone receptionist — nothing is booked; confirm a time with the caller.${link}`,
      category: TEAM_TASK_CATEGORY[c.callback.team],
      priority: 'high',
      due_date: c.callback.preferredAt ? londonDate(new Date(c.callback.preferredAt)) : nextBusinessDay(t.now),
    }
  }
  if (t.enquiryId) {
    const due = new Date(t.now.getTime() + 2 * 24 * 3600 * 1000)
    return {
      ...common,
      title: `Follow up phone enquiry: ${who} (${intentForInterest(c.interest, null).replace(/_/g, ' ')})`,
      description: `${t.summary}${link}`,
      category: 'sales',
      priority: (t.score ?? 0) >= 70 ? 'high' : 'medium',
      due_date: londonDate(due),
    }
  }
  return null
}

export async function insertTask(db: Db, task: Record<string, unknown>, enquiryId: string | null): Promise<string | null> {
  try {
    const { data, error } = await db.from('tasks').insert(task).select('id').single()
    if (error || !data) throw new Error(error?.message ?? 'no row')
    const id = (data as { id: string }).id
    if (enquiryId) await db.from('enquiries').update({ related_task_id: id }).eq('id', enquiryId)
    return id
  } catch (e) {
    log.error('task_insert_failed', e)
    return null
  }
}

export async function notifyAdminsInApp(
  db: Db,
  n: { kind: string; title: string; body: string; link: string | null; enquiryId: string | null },
): Promise<void> {
  try {
    const { error } = await db.from('admin_notifications').insert({
      kind: n.kind,
      title: n.title.slice(0, 300),
      body: n.body.slice(0, 2000),
      link: n.link,
      related_enquiry_id: n.enquiryId,
    })
    if (error) throw new Error(error.message)
  } catch (e) {
    log.error('admin_notification_failed', e)
  }
}
