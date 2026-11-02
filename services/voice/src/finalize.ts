// End-of-call pipeline: summary → enquiry/task/notification → voice_calls row.
//
// Triggered by whichever comes first: the relay WebSocket closing (we have the
// session in memory) or Twilio's status callback (call never reached the
// relay — busy / no answer / failed / hung up during the greeting).
// Exactly-once: an in-process lock per CallSid, plus a DB claim
// (`finalized_at` set only where it is still null) so a second replica or a
// retried callback can never file a second enquiry.
import { fillCaptureGaps } from './summary.js'
import { log } from './log.js'
import type { LlmClient } from './llm.js'
import {
  FAILED_STATUSES,
  insertEnquiry,
  insertTask,
  matchCaller,
  notifyAdminsInApp,
  taskForCall,
  type Db,
} from './crm.js'
import type { SessionSnapshot } from './session.js'
import { callerName, deriveOutcome, hasMessage, isQualified, summariseCall } from './summary.js'
import { emptyCapture, type CallerMatch, type Outcome } from './types.js'

export interface FinalizeInput {
  callSid: string
  snapshot: SessionSnapshot | null
  match: CallerMatch | null
  /** voice_calls.status reported by Twilio, if known. */
  twilioStatus?: string | null
  from?: string | null
  to?: string | null
}

export interface FinalizeDeps {
  db: Db | null
  llm: LlmClient | null
  summaryModel: string
  now?: () => Date
}

export interface FinalizeResult {
  outcome: Outcome
  summary: string
  enquiryId: string | null
  skipped?: 'no_db' | 'already_finalized'
}

const inFlight = new Map<string, Promise<FinalizeResult>>()

export function finalizeCall(input: FinalizeInput, deps: FinalizeDeps): Promise<FinalizeResult> {
  const existing = inFlight.get(input.callSid)
  if (existing) return existing
  const p = runFinalize(input, deps).finally(() => {
    // Keep the entry briefly so a late status callback doesn't re-run it.
    setTimeout(() => inFlight.delete(input.callSid), 10 * 60 * 1000).unref?.()
  })
  inFlight.set(input.callSid, p)
  return p
}

export function isFinalizing(callSid: string): boolean {
  return inFlight.has(callSid)
}

/** Wants the team to do something with this call → worth an enquiry. */
export function shouldFileEnquiry(snap: Pick<SessionSnapshot, 'capture' | 'callerId'>): boolean {
  const c = snap.capture
  // Escalations (complaints, payments, cancellations, press…) are not leads:
  // they get a high-priority task + notification instead of an enquiry.
  if (c.escalation) return false
  if (!isQualified(c, snap.callerId)) return false
  return c.enquiryRequested || !!c.callback || !!c.interest || !!c.notes
}

async function runFinalize(input: FinalizeInput, deps: FinalizeDeps): Promise<FinalizeResult> {
  const now = (deps.now ?? (() => new Date()))()
  const snap: SessionSnapshot = input.snapshot ?? {
    callSid: input.callSid,
    callerId: input.from ?? null,
    startedAt: now.toISOString(),
    capture: emptyCapture(),
    transcript: [],
    usage: { promptTokens: 0, completionTokens: 0, requests: 0 },
    model: '',
    turns: 0,
    llmFailures: 0,
    error: null,
    endReason: null,
  }
  const callerSpoke = snap.transcript.some((t) => t.role === 'caller')
  const twilioFailed = !!input.twilioStatus && FAILED_STATUSES.has(input.twilioStatus)
  const relayFailed = !input.snapshot || (snap.llmFailures > 0 && !hasMessage(snap.capture) && snap.turns <= 1)

  const { db } = deps
  if (!db) {
    const summary = (await summariseCall(snap, null, deps.summaryModel)).summary
    log.warn('finalize_no_db', { callSid: input.callSid })
    return { outcome: deriveOutcome({ capture: snap.capture, enquiryCreated: false, failed: twilioFailed }), summary, enquiryId: null, skipped: 'no_db' }
  }

  // Make sure the row exists (the /voice/incoming insert is best-effort).
  await db
    .from('voice_calls')
    .upsert(
      { call_sid: input.callSid, from_number: input.from ?? snap.callerId, to_number: input.to ?? null, started_at: snap.startedAt },
      { onConflict: 'call_sid', ignoreDuplicates: true },
    )

  // Claim.
  const claim = await db
    .from('voice_calls')
    .update({ finalized_at: now.toISOString() })
    .eq('call_sid', input.callSid)
    .is('finalized_at', null)
    .select('id, status, started_at, ended_at, duration_s, enquiry_id')
  if (claim.error) {
    log.error('finalize_claim_failed', claim.error.message, { callSid: input.callSid })
    return { outcome: 'failed', summary: '', enquiryId: null }
  }
  const row = (claim.data ?? [])[0] as
    | { id: string; status: string; started_at: string; ended_at: string | null; duration_s: number | null; enquiry_id: string | null }
    | undefined
  if (!row) return { outcome: 'no_action', summary: '', enquiryId: null, skipped: 'already_finalized' }

  const match = input.match ?? (await matchCaller(db, snap.callerId))
  const sum = await summariseCall(snap, deps.llm, deps.summaryModel)
  // Details the caller said but the live agent never saved (e.g. company).
  fillCaptureGaps(snap.capture, sum.details)
  let summary = sum.summary
  if (!input.snapshot) {
    summary = callerSpoke
      ? summary
      : `The call ended before the receptionist answered (${input.twilioStatus?.replace(/_/g, ' ') ?? 'no relay session'}).`
  }

  let enquiryId: string | null = row.enquiry_id
  let ownerId: string | null = null
  let score: number | null = null
  if (!enquiryId && shouldFileEnquiry(snap)) {
    const enq = await insertEnquiry(db, { capture: snap.capture, callerId: snap.callerId, match, callId: row.id, summary })
    if (enq) {
      enquiryId = enq.id
      ownerId = enq.ownerId
      score = enq.score
    }
  }

  const task = taskForCall({
    capture: snap.capture,
    callerId: snap.callerId,
    match,
    summary,
    callId: row.id,
    enquiryId,
    ownerId,
    score,
    now,
  })
  if (task) await insertTask(db, task, enquiryId)

  const outcome = deriveOutcome({
    capture: snap.capture,
    enquiryCreated: !!enquiryId,
    failed: twilioFailed || (relayFailed && !callerSpoke) || (snap.llmFailures >= 2 && !hasMessage(snap.capture)),
  })

  const c = snap.capture
  const endedAt = row.ended_at ?? now.toISOString()
  const durationS =
    row.duration_s ?? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(row.started_at ?? snap.startedAt)) / 1000))
  const patch: Record<string, unknown> = {
    status: row.status === 'in_progress' || row.status === 'ringing' ? (twilioFailed ? input.twilioStatus : 'completed') : row.status,
    ended_at: endedAt,
    duration_s: durationS,
    caller_name: callerName(c),
    caller_phone: c.phone ?? snap.callerId,
    caller_email: c.email,
    caller_company: c.company,
    caller_role: c.role,
    interest: c.interest,
    turnover_band: c.turnoverBand,
    notes: c.notes,
    callback_requested_at: c.callback?.requestedAt ?? null,
    callback_preferred_text: c.callback?.preferredText ?? null,
    callback_preferred_at: c.callback?.preferredAt ?? null,
    callback_team: c.callback?.team ?? null,
    callback_note: c.callback?.reason ?? null,
    escalated: !!c.escalation,
    escalation_reason: c.escalation ? `${c.escalation.category}: ${c.escalation.reason}` : null,
    summary,
    outcome,
    enquiry_id: enquiryId,
    member_id: match.memberId,
    contact_id: match.contactId,
    transcript: snap.transcript,
    model: snap.model || null,
    prompt_tokens: snap.usage.promptTokens + sum.promptTokens,
    completion_tokens: snap.usage.completionTokens + sum.completionTokens,
    llm_requests: snap.usage.requests + (sum.usedFallback ? 0 : 1),
    error: snap.error,
  }
  const upd = await db.from('voice_calls').update(patch).eq('id', row.id)
  if (upd.error) log.error('finalize_update_failed', upd.error.message, { callSid: input.callSid })

  if (outcome !== 'no_action' && outcome !== 'failed') {
    const who = callerName(c) ?? snap.callerId ?? 'Withheld number'
    const titles: Record<string, string> = {
      escalated: `Phone call escalated — ${who}`,
      callback_requested: `Call back requested by phone — ${who}`,
      enquiry_created: `New phone enquiry — ${who}`,
      message_taken: `Phone message — ${who}`,
    }
    await notifyAdminsInApp(db, {
      kind: outcome === 'escalated' ? 'voice_call_escalated' : 'voice_call',
      title: titles[outcome],
      body: summary,
      link: `/dashboard/calls?call=${row.id}`,
      enquiryId,
    })
  }

  log.info('call_finalized', { callSid: input.callSid, outcome, enquiry: !!enquiryId, turns: snap.turns })
  return { outcome, summary, enquiryId }
}
