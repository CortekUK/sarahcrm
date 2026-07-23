// Shared constants + helpers for the Weekly Scorecards module (admin + staff).
//
// A "week" runs Monday → Sunday and is identified by its Monday (week_start),
// stored as a YYYY-MM-DD date string. Each target has a SOURCE that decides
// how its ACTUAL value is derived:
//   • manual          → the value in scorecard_targets.manual_actual
//                        (staff self-report; admins may also edit).
//   • tasks_completed  → count of the staff member's accountability_tasks with
//                        status='done' whose updated_at falls in the week.
//   • hours_logged     → sum of the staff member's time_entries.hours with
//                        entry_date in the week.

import type { Database } from '@/types/database'

export type ScorecardTargetRow =
  Database['public']['Tables']['scorecard_targets']['Row']
export type ScorecardSummaryRow =
  Database['public']['Tables']['scorecard_summaries']['Row']

export type ScorecardSource = 'manual' | 'tasks_completed' | 'hours_logged'

export const SCORECARD_SOURCE_META: Record<
  ScorecardSource,
  { label: string; hint: string; auto: boolean }
> = {
  manual: {
    label: 'Manual',
    hint: 'The staff member enters the actual value themselves (admins can edit too).',
    auto: false,
  },
  tasks_completed: {
    label: 'Tasks completed (auto)',
    hint: 'Auto-counted from accountability tasks marked done this week.',
    auto: true,
  },
  hours_logged: {
    label: 'Hours logged (auto)',
    hint: 'Auto-summed from time entries logged this week.',
    auto: true,
  },
}

export const SCORECARD_SOURCE_OPTIONS = (
  Object.keys(SCORECARD_SOURCE_META) as ScorecardSource[]
).map((value) => ({ value, label: SCORECARD_SOURCE_META[value].label }))

// ── Week helpers ─────────────────────────────────────────────
// All in local time; we only ever deal with calendar dates (YYYY-MM-DD).

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// The Monday (as YYYY-MM-DD) of the week containing `date` (default today).
export function mondayOf(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dow = d.getDay() // 0 = Sun … 6 = Sat
  const diff = dow === 0 ? -6 : 1 - dow // shift back to Monday
  d.setDate(d.getDate() + diff)
  return toISODate(d)
}

// Sunday (YYYY-MM-DD) that ends the week starting at `weekStart` (a Monday).
export function weekEnd(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`)
  d.setDate(d.getDate() + 6)
  return toISODate(d)
}

// Move a week_start by `n` weeks (n may be negative).
export function addWeeks(weekStart: string, n: number): string {
  const d = new Date(`${weekStart}T00:00:00`)
  d.setDate(d.getDate() + n * 7)
  return toISODate(d)
}

// Human label e.g. "21–27 Jul 2026".
export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`)
  const end = new Date(`${weekEnd(weekStart)}T00:00:00`)
  const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short' })
  const sameMonth = start.getMonth() === end.getMonth()
  const startLabel = sameMonth ? String(start.getDate()) : `${start.getDate()} ${monthFmt.format(start)}`
  return `${startLabel}–${end.getDate()} ${monthFmt.format(end)} ${end.getFullYear()}`
}

// Is `weekStart` the current (this-Monday) week?
export function isCurrentWeek(weekStart: string): boolean {
  return weekStart === mondayOf()
}

// ── Actual / score computation ───────────────────────────────

export interface WeekActualInputs {
  // accountability_tasks marked done whose updated_at is in the week.
  tasksCompleted: number
  // sum of time_entries.hours with entry_date in the week.
  hoursLogged: number
}

// The ACTUAL value for a target given the week's auto metrics.
export function actualForTarget(
  target: Pick<ScorecardTargetRow, 'source' | 'manual_actual'>,
  auto: WeekActualInputs,
): number {
  switch (target.source as ScorecardSource) {
    case 'tasks_completed':
      return auto.tasksCompleted
    case 'hours_logged':
      return auto.hoursLogged
    case 'manual':
    default:
      return Number(target.manual_actual ?? 0)
  }
}

export function isTargetMet(
  target: Pick<ScorecardTargetRow, 'source' | 'manual_actual' | 'target_value'>,
  auto: WeekActualInputs,
): boolean {
  const tgt = Number(target.target_value ?? 0)
  // A zero/absent target is treated as met (nothing required).
  if (tgt <= 0) return true
  return actualForTarget(target, auto) >= tgt
}

export interface ScorecardScore {
  met: number
  total: number
  score: number // 0–100, % of targets met (0 when there are no targets)
}

export function computeScore(
  targets: ScorecardTargetRow[],
  auto: WeekActualInputs,
): ScorecardScore {
  const total = targets.length
  const met = targets.filter((t) => isTargetMet(t, auto)).length
  const score = total === 0 ? 0 : Math.round((met / total) * 100)
  return { met, total, score }
}

// ── Auto-metric queries (used by admin + staff UIs) ──────────
// These take an already-fetched slice of rows and reduce them; the actual
// Supabase fetch happens in the page (RLS scopes staff to their own rows).

export function tasksCompletedInWeek(
  tasks: Array<{ status: string; updated_at: string }>,
  weekStart: string,
): number {
  const startMs = new Date(`${weekStart}T00:00:00`).getTime()
  const endMs = new Date(`${weekEnd(weekStart)}T23:59:59.999`).getTime()
  return tasks.filter(
    (t) =>
      t.status === 'done' &&
      (() => {
        const ms = new Date(t.updated_at).getTime()
        return ms >= startMs && ms <= endMs
      })(),
  ).length
}

export function hoursLoggedInWeek(
  entries: Array<{ hours: number | null; entry_date: string }>,
  weekStart: string,
): number {
  const end = weekEnd(weekStart)
  const sum = entries
    .filter((e) => e.entry_date >= weekStart && e.entry_date <= end)
    .reduce((a, e) => a + Number(e.hours ?? 0), 0)
  return Math.round(sum * 100) / 100
}
