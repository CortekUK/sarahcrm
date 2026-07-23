// Shared constants + pure helpers for the Accountant Auto-Escalation module
// (Module 6). Used by BOTH the admin UI and the escalation engine, so the
// period/due-date maths and escalation thresholds live in exactly one place.
//
// A finance task is a RECURRING deliverable (monthly / quarterly / annual)
// with three name+email contacts — accountant → escalation (FD) → final
// (Sarah). Each period produces one occurrence with a computed due_date. When
// an occurrence goes overdue the engine emails each level in turn, guarded by
// escalation_level so nothing is ever emailed twice.

import type { Database } from '@/types/database'

export type FinanceTaskRow = Database['public']['Tables']['finance_tasks']['Row']
export type FinanceOccurrenceRow =
  Database['public']['Tables']['finance_task_occurrences']['Row']

export type Cadence = 'monthly' | 'quarterly' | 'annual'

export const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
]

export const CADENCE_LABEL: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
}

// ── Escalation thresholds (documented defaults, as named constants) ──────
// Days overdue at which each level is emailed. Level N is emailed once, then
// escalation_level is bumped to N so it never fires again.
export const ESCALATION_DAYS = {
  accountant: 0, // level 1 — due date has passed
  director: 3, // level 2 — Finance Director
  final: 7, // level 3 — Sarah
} as const

export const ESCALATION_LEVEL_META: Record<
  number,
  { label: string; variant: 'draft' | 'info' | 'upcoming' | 'urgent' }
> = {
  0: { label: 'Not escalated', variant: 'draft' },
  1: { label: 'Accountant emailed', variant: 'info' },
  2: { label: 'Finance Director emailed', variant: 'upcoming' },
  3: { label: 'Sarah emailed', variant: 'urgent' },
}

// The contact emailed AT a given level (1/2/3).
export function contactForLevel(
  task: Pick<
    FinanceTaskRow,
    | 'accountant_name'
    | 'accountant_email'
    | 'escalation_name'
    | 'escalation_email'
    | 'final_name'
    | 'final_email'
  >,
  level: 1 | 2 | 3,
): { role: string; name: string | null; email: string | null } {
  if (level === 1)
    return { role: 'Accountant', name: task.accountant_name, email: task.accountant_email }
  if (level === 2)
    return { role: 'Finance Director', name: task.escalation_name, email: task.escalation_email }
  return { role: 'Sarah', name: task.final_name, email: task.final_email }
}

// ── Date helpers (calendar dates, YYYY-MM-DD) ────────────────────────────
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Whole days a due_date is overdue relative to `ref` (today by default).
// Positive once the due date has passed; negative while still ahead.
export function daysLate(dueDate: string, ref: string = todayDate()): number {
  const a = new Date(`${dueDate}T00:00:00`).getTime()
  const b = new Date(`${ref}T00:00:00`).getTime()
  return Math.round((b - a) / 86_400_000)
}

// Human label e.g. "Wed 22 Jul 2026".
export function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

// ── Period + due-date computation ────────────────────────────────────────
// DOCUMENTED RULE (the spec gives only a day-of-month, no month, for
// quarterly/annual — so we fix the month deterministically):
//   • monthly    → period 'YYYY-MM';  due_date = due_day of that month.
//   • quarterly  → period 'YYYY-Qn';  due_date = due_day of the quarter's
//                  FINAL month (Mar / Jun / Sep / Dec).
//   • annual     → period 'YYYY';     due_date = due_day of December.
// due_day is constrained 1–28 so it is always a valid day in every month.
export interface PeriodSpec {
  label: string
  dueDate: string // YYYY-MM-DD
}

// The 0-based month index (0=Jan) used for a period's due_date.
function dueMonthIndex(cadence: Cadence, monthIdx: number): number {
  if (cadence === 'monthly') return monthIdx
  if (cadence === 'annual') return 11 // December
  // quarterly → final month of the quarter containing monthIdx
  const quarter = Math.floor(monthIdx / 3) // 0..3
  return quarter * 3 + 2
}

function periodSpec(cadence: Cadence, year: number, monthIdx: number, dueDay: number): PeriodSpec {
  const dm = dueMonthIndex(cadence, monthIdx)
  const dueDate = `${year}-${pad(dm + 1)}-${pad(dueDay)}`
  let label: string
  if (cadence === 'monthly') label = `${year}-${pad(dm + 1)}`
  else if (cadence === 'quarterly') label = `${year}-Q${Math.floor(dm / 3) + 1}`
  else label = `${year}`
  return { label, dueDate }
}

// The CURRENT period spec for a cadence, relative to `ref` (today by default).
// A finance task is chased from when it is created onward, so we only ever
// generate the current period. (The escalation engine additionally skips any
// period whose due date falls before the task was created, so a brand-new task
// never back-dates an "overdue" deadline for a period it didn't exist in.)
export function currentPeriods(
  cadence: Cadence,
  dueDay: number,
  ref: string = todayDate(),
): PeriodSpec[] {
  const d = new Date(`${ref}T00:00:00`)
  return [periodSpec(cadence, d.getFullYear(), d.getMonth(), dueDay)]
}

// Human label for a period, e.g. "July 2026", "Q3 2026", "2026".
export function formatPeriodLabel(label: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(label)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
    return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(d)
  }
  const q = /^(\d{4})-Q(\d)$/.exec(label)
  if (q) return `Q${q[2]} ${q[1]}`
  return label
}
