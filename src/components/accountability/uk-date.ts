import { UK_TIME_ZONE } from '@/lib/utils'

// Today's date in the UK as "yyyy-MM-dd" — the same "today" the database
// rules use for time entries and handovers (Europe/London), whatever the
// viewer's device time zone.
export function ukToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: UK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

// Shift a "yyyy-MM-dd" date by n days (calendar arithmetic, no time zone).
export function shiftIsoDate(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}
