// End-of-call summary + outcome.
//
// The OUTCOME is deterministic (derived from what the tools captured) so the
// admin filter can be trusted; OpenAI only writes the 2–4 sentence summary.
// Any OpenAI failure (or no key) falls back to a templated summary.
import type { LlmClient } from './llm.js'
import { log } from './log.js'
import type { SessionSnapshot } from './session.js'
import type { CallCapture, Outcome, TranscriptEntry } from './types.js'

export function callerName(c: CallCapture): string | null {
  const n = [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
  return n || null
}

/** Enough to file an enquiry: a name plus a way to reach them. */
export function isQualified(c: CallCapture, callerId: string | null): boolean {
  return !!c.firstName && !!(c.phone ?? callerId ?? c.email)
}

/** Did the caller leave anything worth a follow-up? */
export function hasMessage(c: CallCapture): boolean {
  return !!(c.notes || c.interest || c.callback || c.enquiryRequested || c.escalation || c.company || c.email)
}

/**
 * Precedence: escalated > callback_requested > enquiry_created >
 * message_taken > failed > no_action. `failed` = the call never reached a
 * working conversation (Twilio failed/busy/no-answer, relay error, or the
 * model failed before the caller got anywhere).
 */
export function deriveOutcome(a: { capture: CallCapture; enquiryCreated: boolean; failed: boolean }): Outcome {
  const c = a.capture
  if (c.escalation) return 'escalated'
  if (c.callback) return 'callback_requested'
  if (a.enquiryCreated) return 'enquiry_created'
  if (hasMessage(c) || c.firstName) return 'message_taken'
  if (a.failed) return 'failed'
  return 'no_action'
}

const INTEREST_LABEL: Record<string, string> = {
  membership: 'membership',
  event: 'an event',
  private_event: 'a private event',
  sponsorship: 'sponsorship',
  concierge: 'the concierge service',
  press: 'a press enquiry',
  other: 'a general enquiry',
}

export function fallbackSummary(snap: Pick<SessionSnapshot, 'capture' | 'transcript' | 'callerId'>): string {
  const c = snap.capture
  const callerSpoke = snap.transcript.some((t) => t.role === 'caller')
  if (!callerSpoke) return 'The caller did not say anything before the call ended.'
  const who = callerName(c) ?? 'An unnamed caller'
  const company = c.company ? ` from ${c.company}` : ''
  const about = c.interest ? ` called about ${INTEREST_LABEL[c.interest] ?? c.interest}` : ' called The Club'
  const parts = [`${who}${company}${about}.`]
  if (c.notes) parts.push(`Message: ${c.notes}`)
  if (c.callback) {
    parts.push(
      `They asked for a call back${c.callback.preferredText ? ` (${c.callback.preferredText})` : ''} from the ${
        c.callback.team === 'sarah' ? 'Sarah' : c.callback.team === 'events' ? 'events team' : 'membership team'
      }.`,
    )
  }
  if (c.escalation) parts.push(`Escalated (${c.escalation.category}): ${c.escalation.reason}.`)
  if (!c.notes && !c.callback && !c.escalation && !c.interest) parts.push('No specific request was captured.')
  return parts.join(' ').slice(0, 1200)
}

function transcriptText(t: TranscriptEntry[], maxChars = 12_000): string {
  const lines = t
    .filter((e) => e.role !== 'event')
    .map((e) => `${e.role === 'caller' ? 'Caller' : 'Receptionist'}: ${e.text}`)
  let out = lines.join('\n')
  if (out.length > maxChars) out = `…\n${out.slice(-maxChars)}`
  return out
}

export async function summariseCall(
  snap: Pick<SessionSnapshot, 'capture' | 'transcript' | 'callerId'>,
  llm: LlmClient | null,
  model: string,
): Promise<{ summary: string; promptTokens: number; completionTokens: number; usedFallback: boolean; details: ExtractedDetails }> {
  const fallback = fallbackSummary(snap)
  const callerSpoke = snap.transcript.some((t) => t.role === 'caller')
  if (!llm || !callerSpoke) return { summary: fallback, promptTokens: 0, completionTokens: 0, usedFallback: true, details: {} }
  try {
    const res = await llm.complete({
      model,
      json: true,
      maxTokens: 350,
      signal: AbortSignal.timeout(20_000),
      messages: [
        {
          role: 'system',
          content:
            "You summarise phone calls to The Club by Sarah Restrick's AI receptionist for the club team. Return JSON {\"summary\": string, \"details\": {\"firstName\": string|null, \"lastName\": string|null, \"email\": string|null, \"company\": string|null, \"role\": string|null}}. summary: 2–4 plain sentences in British English, factual, third person (refer to the caller by name or \"they\", never \"he\"/\"she\") — who called, what they wanted, what was agreed (call back, enquiry, escalation) and any details the team needs. No speculation, no markdown. details: only what the CALLER clearly stated in the transcript (spelled-out names/emails reassembled, email lowercase), otherwise null — never guess.",
        },
        {
          role: 'user',
          content: `Captured details (JSON): ${JSON.stringify(snap.capture)}\n\nTranscript:\n${transcriptText(snap.transcript)}`,
        },
      ],
    })
    const parsed = JSON.parse(res.text) as { summary?: unknown; details?: unknown }
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 1500) : ''
    if (!summary) throw new Error('empty summary')
    return {
      summary,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      usedFallback: false,
      details: cleanDetails(parsed.details),
    }
  } catch (e) {
    log.warn('summary_fallback', { error: e instanceof Error ? e.message : String(e) })
    return { summary: fallback, promptTokens: 0, completionTokens: 0, usedFallback: true, details: {} }
  }
}

/** Caller details recovered from the transcript at call end (gap-fill only). */
export interface ExtractedDetails {
  firstName?: string
  lastName?: string
  email?: string
  company?: string
  role?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function cleanDetails(raw: unknown): ExtractedDetails {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const s = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  const email = s(r.email, 200)?.toLowerCase().replace(/\s+/g, '')
  return {
    firstName: s(r.firstName, 60),
    lastName: s(r.lastName, 60),
    email: email && EMAIL_RE.test(email) ? email : undefined,
    company: s(r.company),
    role: s(r.role),
  }
}

/** Fill only the capture fields the live agent left empty. */
export function fillCaptureGaps(capture: CallCapture, d: ExtractedDetails): void {
  capture.firstName ??= d.firstName ?? null
  capture.lastName ??= d.lastName ?? null
  capture.email ??= d.email ?? null
  capture.company ??= d.company ?? null
  capture.role ??= d.role ?? null
}
