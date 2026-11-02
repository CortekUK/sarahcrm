// Shared shapes for one call.

export const INTERESTS = [
  'membership',
  'event',
  'private_event',
  'sponsorship',
  'concierge',
  'press',
  'other',
] as const
export type Interest = (typeof INTERESTS)[number]

export const CALL_TEAMS = ['sales', 'events', 'sarah'] as const
export type CallTeam = (typeof CALL_TEAMS)[number]

export const ESCALATION_CATEGORIES = [
  'complaint',
  'payment',
  'cancellation',
  'press',
  'sensitive',
  'other',
] as const
export type EscalationCategory = (typeof ESCALATION_CATEGORIES)[number]

export const OUTCOMES = [
  'message_taken',
  'callback_requested',
  'enquiry_created',
  'escalated',
  'no_action',
  'failed',
] as const
export type Outcome = (typeof OUTCOMES)[number]

/** What the receptionist has captured so far (filled by tool calls). */
export interface CallCapture {
  firstName: string | null
  lastName: string | null
  phone: string | null // E.164 when parseable
  phoneConfirmed: boolean
  email: string | null
  company: string | null
  role: string | null
  interest: Interest | null
  turnoverBand: string | null
  notes: string | null
  callback: {
    requestedAt: string // ISO, when asked
    preferredText: string | null
    preferredAt: string | null // ISO, only when unambiguous + in the future
    team: CallTeam
    reason: string | null
  } | null
  enquiryRequested: boolean
  escalation: { category: EscalationCategory; reason: string } | null
  endRequested: { reason: string } | null
}

export function emptyCapture(): CallCapture {
  return {
    firstName: null,
    lastName: null,
    phone: null,
    phoneConfirmed: false,
    email: null,
    company: null,
    role: null,
    interest: null,
    turnoverBand: null,
    notes: null,
    callback: null,
    enquiryRequested: false,
    escalation: null,
    endRequested: null,
  }
}

export interface TranscriptEntry {
  role: 'caller' | 'agent' | 'event'
  text: string
  at: string // ISO
  interrupted?: boolean
}

/** Existing person the caller ID matched (public.voice_match_caller). */
export interface CallerMatch {
  memberId: string | null
  memberName: string | null
  contactId: string | null
  contactName: string | null
}

export const NO_MATCH: CallerMatch = { memberId: null, memberName: null, contactId: null, contactName: null }

export interface Usage {
  promptTokens: number
  completionTokens: number
  requests: number
}
