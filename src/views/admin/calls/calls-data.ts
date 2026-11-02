// Calls (AI phone receptionist) — row types, labels and the browser-client
// queries. `voice_calls` is written by services/voice with the service role
// and read here under admin RLS (supabase/migrations/20261028_voice_calls.sql).
// The table isn't in src/types/database.ts yet, hence the untyped client.

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

export const db = supabase as unknown as SupabaseClient

export type CallOutcome =
  | 'message_taken'
  | 'callback_requested'
  | 'enquiry_created'
  | 'escalated'
  | 'no_action'
  | 'failed'

export interface TranscriptEntry {
  role: 'caller' | 'agent' | 'event'
  text: string
  at: string
  interrupted?: boolean
}

export interface CallRow {
  id: string
  call_sid: string
  from_number: string | null
  status: string
  started_at: string
  ended_at: string | null
  duration_s: number | null
  caller_name: string | null
  caller_phone: string | null
  caller_email: string | null
  caller_company: string | null
  caller_role: string | null
  interest: string | null
  turnover_band: string | null
  notes: string | null
  callback_requested_at: string | null
  callback_preferred_text: string | null
  callback_preferred_at: string | null
  callback_team: string | null
  callback_note: string | null
  escalated: boolean
  escalation_reason: string | null
  summary: string | null
  outcome: CallOutcome | null
  enquiry_id: string | null
  contact_id: string | null
  member_id: string | null
  handled_at: string | null
  handled_by: string | null
  member: { id: string; profile: { first_name: string | null; last_name: string | null } | null } | null
  contact: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null
}

export interface CallDetail extends CallRow {
  transcript: TranscriptEntry[]
  model: string | null
  prompt_tokens: number
  completion_tokens: number
  error: string | null
}

const LIST_COLUMNS = [
  'id, call_sid, from_number, status, started_at, ended_at, duration_s',
  'caller_name, caller_phone, caller_email, caller_company, caller_role, interest, turnover_band, notes',
  'callback_requested_at, callback_preferred_text, callback_preferred_at, callback_team, callback_note',
  'escalated, escalation_reason, summary, outcome, enquiry_id, contact_id, member_id, handled_at, handled_by',
  'member:members(id, profile:profiles!profile_id(first_name, last_name))',
  'contact:contacts(id, first_name, last_name, email)',
].join(', ')

export const PAGE_SIZE = 25

export type CallFilter = 'all' | 'unhandled' | CallOutcome

export const OUTCOME_META: Record<
  CallOutcome,
  { label: string; variant: 'active' | 'upcoming' | 'draft' | 'urgent' | 'info' }
> = {
  escalated: { label: 'Escalated', variant: 'urgent' },
  callback_requested: { label: 'Call back', variant: 'upcoming' },
  enquiry_created: { label: 'Enquiry', variant: 'active' },
  message_taken: { label: 'Message', variant: 'info' },
  no_action: { label: 'No action', variant: 'draft' },
  failed: { label: 'Failed', variant: 'urgent' },
}

export const FILTERS: { key: CallFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unhandled', label: 'Unhandled' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'callback_requested', label: 'Call back' },
  { key: 'enquiry_created', label: 'Enquiry' },
  { key: 'message_taken', label: 'Message' },
  { key: 'no_action', label: 'No action' },
  { key: 'failed', label: 'Failed' },
]

export const TEAM_LABELS: Record<string, string> = {
  sales: 'Membership team',
  events: 'Events team',
  sarah: 'Sarah',
}

export const INTEREST_LABELS: Record<string, string> = {
  membership: 'Membership',
  event: 'An event',
  private_event: 'Private event',
  sponsorship: 'Sponsorship',
  concierge: 'Concierge',
  press: 'Press',
  other: 'Other',
}

export interface CallsPage {
  rows: CallRow[]
  next: { at: string; id: string } | null
}

/** Keyset page, newest first: (started_at, id) < cursor. */
export async function fetchCallsPage(filter: CallFilter, cursor: { at: string; id: string } | null): Promise<CallsPage> {
  let q = db
    .from('voice_calls')
    .select(LIST_COLUMNS)
    .order('started_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  if (filter === 'unhandled') q = q.is('handled_at', null).not('outcome', 'in', '(no_action,failed)')
  else if (filter !== 'all') q = q.eq('outcome', filter)
  if (cursor) {
    q = q.or(`started_at.lt."${cursor.at}",and(started_at.eq."${cursor.at}",id.lt.${cursor.id})`)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as CallRow[]
  const page = rows.slice(0, PAGE_SIZE)
  const last = page[page.length - 1]
  return { rows: page, next: rows.length > PAGE_SIZE && last ? { at: last.started_at, id: last.id } : null }
}

export async function fetchCallDetail(id: string): Promise<CallDetail | null> {
  const { data, error } = await db
    .from('voice_calls')
    .select(`${LIST_COLUMNS}, transcript, model, prompt_tokens, completion_tokens, error`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as unknown as CallDetail | null) ?? null
}

/** Calls with a follow-up outcome nobody has marked handled yet. */
export async function fetchUnhandledCount(): Promise<number> {
  const { count, error } = await db
    .from('voice_calls')
    .select('id', { count: 'exact', head: true })
    .is('handled_at', null)
    .not('outcome', 'in', '(no_action,failed)')
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function setHandled(id: string, handledBy: string | null, handled: boolean): Promise<void> {
  const { error } = await db
    .from('voice_calls')
    .update(handled ? { handled_at: new Date().toISOString(), handled_by: handledBy } : { handled_at: null, handled_by: null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ── display helpers ─────────────────────────────────────────────

export function personName(p: { first_name: string | null; last_name: string | null } | null | undefined): string | null {
  if (!p) return null
  return [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || null
}

/** "+447915919880" → "07915 919880"; other numbers unchanged. */
export function displayPhone(p: string | null | undefined): string {
  if (!p) return 'Withheld number'
  if (p.startsWith('+44') && p.length === 13) {
    const n = `0${p.slice(3)}`
    return `${n.slice(0, 5)} ${n.slice(5)}`
  }
  return p
}

export function callerLabel(c: CallRow): string {
  return c.caller_name || personName(c.member?.profile) || personName(c.contact) || displayPhone(c.from_number)
}

export function formatDuration(s: number | null): string {
  if (s === null || s === undefined) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`
}

export function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isMissingTable(message: string): boolean {
  return /voice_calls|relation .* does not exist|schema cache/i.test(message)
}
