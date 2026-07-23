// Shared constants + helpers for the Daily Handover module (admin + staff).
//
// Every staff member submits one END-OF-DAY handover per day (handover_date,
// a YYYY-MM-DD date). Four short free-text fields. An admin can condense a
// day's handovers into "Sarah's Daily Leadership Report" (daily_reports).

import type { Database } from '@/types/database'

export type DailyHandoverRow =
  Database['public']['Tables']['daily_handovers']['Row']
export type DailyReportRow =
  Database['public']['Tables']['daily_reports']['Row']

// The four handover fields, in display order, with labels + placeholders.
export const HANDOVER_FIELDS = [
  {
    key: 'completed_today' as const,
    label: 'What I completed today',
    placeholder: 'The main things you finished or moved forward today…',
  },
  {
    key: 'working_tomorrow' as const,
    label: "What I'm working on tomorrow",
    placeholder: 'Your focus and priorities for tomorrow…',
  },
  {
    key: 'blocked' as const,
    label: "What's blocked",
    placeholder: 'Anything stuck or waiting on someone/something…',
  },
  {
    key: 'support_needed' as const,
    label: 'Support needed',
    placeholder: 'Where you could use help, a decision, or resources…',
  },
]

export type HandoverFieldKey = (typeof HANDOVER_FIELDS)[number]['key']

// A handover "has content" if any of the four fields is non-empty.
export function handoverHasContent(
  h: Pick<
    DailyHandoverRow,
    'completed_today' | 'working_tomorrow' | 'blocked' | 'support_needed'
  > | null | undefined,
): boolean {
  if (!h) return false
  return HANDOVER_FIELDS.some((f) => (h[f.key] ?? '').trim() !== '')
}

// ── Date helpers ─────────────────────────────────────────────
// We only ever deal with calendar dates (YYYY-MM-DD), local time.

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Today's date (YYYY-MM-DD) in local time.
export function today(): string {
  return toISODate(new Date())
}

// Shift a date string by n days (n may be negative).
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function isToday(date: string): boolean {
  return date === today()
}

// Human label e.g. "Wed 22 Jul 2026".
export function formatHandoverDate(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}
