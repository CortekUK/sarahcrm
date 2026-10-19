// Concierge call booking — feature flag, team routing and calendar config.
//
// Pure config/env helpers (NO Google calls, NO googleapis import), so the chat
// route can read the flag and route a call request without ever loading the
// calendar client. The calendar client (src/lib/google/calendar.ts) is only
// dynamically imported by the route when CONCIERGE_BOOKING_ENABLED is on.
//
// Env (see .env.local.example):
//   CONCIERGE_BOOKING_ENABLED     exactly 'true' turns live booking on. Anything
//                                 else (default) = OFF: the concierge captures
//                                 preferred days/times, creates the enquiry +
//                                 a follow-up task, and never calls Google.
//   CONCIERGE_BOOKING_CALENDARS   team → Workspace user email(s), e.g.
//                                 "sales=sales@x.co|james@x.co,events=events@x.co,sarah=sarah@x.co"
//                                 (several emails = a pool; any free member is offered).
//                                 Also used with the flag OFF to assign Sarah's
//                                 call-request task to her profile.
//   CONCIERGE_BOOKING_DURATION_MINS  default 30
//   CONCIERGE_BOOKING_HOURS          default "10-17" (wall-clock, timezone below)
//   CONCIERGE_BOOKING_DAYS           default "1-5" (ISO weekdays, 1 = Mon)
//   CONCIERGE_BOOKING_TIMEZONE       default "Europe/London"
//   CONCIERGE_BOOKING_HORIZON_DAYS   default 10 (how far ahead to look for slots)

export type CallTeam = 'sales' | 'events' | 'sarah'
export const CALL_TEAMS: CallTeam[] = ['sales', 'events', 'sarah']

export const TEAM_LABEL: Record<CallTeam, string> = {
  sales: 'Membership team',
  events: 'Events team',
  sarah: 'Sarah',
}

// tasks.category is free text: sales | events | admin | general.
export const TEAM_TASK_CATEGORY: Record<CallTeam, string> = {
  sales: 'sales',
  events: 'events',
  sarah: 'general',
}

// Existing enquiry intents (mirrors the public contact form / admin INTENT_LABELS).
export const ENQUIRY_INTENTS = [
  'general',
  'membership',
  'event',
  'private_event',
  'concierge',
  'sponsorship',
  'venue',
  'press',
] as const
export type EnquiryIntent = (typeof ENQUIRY_INTENTS)[number]

export function normaliseIntent(v: unknown): EnquiryIntent | null {
  return typeof v === 'string' && (ENQUIRY_INTENTS as readonly string[]).includes(v)
    ? (v as EnquiryIntent)
    : null
}

export function normaliseTeam(v: unknown): CallTeam | null {
  return typeof v === 'string' && (CALL_TEAMS as string[]).includes(v) ? (v as CallTeam) : null
}

// Which team takes the call, from the enquiry intent. Sarah only when the
// visitor explicitly asked for her (the model sets team 'sarah').
//   membership / general / sponsorship / concierge / press → sales
//   event / private_event / venue                          → events
export function teamForIntent(intent: EnquiryIntent | null): CallTeam {
  if (intent === 'event' || intent === 'private_event' || intent === 'venue') return 'events'
  return 'sales'
}

// Intent to file a call request under when the model gave none, so the
// existing intake owner routing (app_settings.enquiry_routing) picks the
// right person.
export function defaultIntentForTeam(team: CallTeam): EnquiryIntent {
  if (team === 'events') return 'private_event'
  if (team === 'sales') return 'membership'
  return 'general'
}

export function isConciergeBookingEnabled(): boolean {
  return process.env.CONCIERGE_BOOKING_ENABLED === 'true'
}

// "sales=a@x|b@x,events=c@x,sarah=d@x" → { sales: [a,b], events: [c], sarah: [d] }.
// Unknown keys / malformed entries are ignored.
export function getBookingCalendars(): Partial<Record<CallTeam, string[]>> {
  const raw = process.env.CONCIERGE_BOOKING_CALENDARS ?? ''
  const out: Partial<Record<CallTeam, string[]>> = {}
  for (const part of raw.split(',')) {
    const [key, value] = part.split('=').map((s) => s?.trim())
    const team = normaliseTeam(key)
    if (!team || !value) continue
    const emails = value
      .split('|')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    if (emails.length) out[team] = emails
  }
  return out
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

function rangeEnv(name: string, fallback: [number, number], min: number, max: number): [number, number] {
  const m = (process.env[name] ?? '').match(/^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/)
  if (!m) return fallback
  const a = Number(m[1])
  const b = Number(m[2])
  return a >= min && b <= max && a < b ? [a, b] : fallback
}

export interface BookingOptions {
  durationMins: number
  horizonDays: number
  hours: { startHour: number; endHour: number; days: number[]; timeZone: string }
}

export function getBookingOptions(): BookingOptions {
  const [startHour, endHour] = rangeEnv('CONCIERGE_BOOKING_HOURS', [10, 17], 0, 24)
  const [dFrom, dTo] = rangeEnv('CONCIERGE_BOOKING_DAYS', [1, 5], 1, 7)
  const days: number[] = []
  for (let d = dFrom; d <= dTo; d++) days.push(d)
  return {
    durationMins: intEnv('CONCIERGE_BOOKING_DURATION_MINS', 30, 15, 120),
    horizonDays: intEnv('CONCIERGE_BOOKING_HORIZON_DAYS', 10, 1, 30),
    hours: {
      startHour,
      endHour,
      days,
      timeZone: process.env.CONCIERGE_BOOKING_TIMEZONE?.trim() || 'Europe/London',
    },
  }
}
