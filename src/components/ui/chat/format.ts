// Time + size formatting shared by the chat primitives. Short, glanceable
// labels in the list ("now", "14:05", "Yesterday", "Mon", "3 Oct"); full day
// labels for the date separators in a thread.

import { differenceInCalendarDays, format, isSameDay, isSameYear } from 'date-fns'

export function clockTime(iso: string | Date): string {
  return format(new Date(iso), 'HH:mm')
}

export function relativeTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  const mins = (now.getTime() - d.getTime()) / 60_000
  if (mins < 1) return 'now'
  if (mins < 60) return `${Math.floor(mins)}m`
  const days = differenceInCalendarDays(now, d)
  if (days === 0) return format(d, 'HH:mm')
  if (days === 1) return 'Yesterday'
  if (days < 7) return format(d, 'EEE')
  return isSameYear(d, now) ? format(d, 'd MMM') : format(d, 'd MMM yy')
}

export function dayLabel(iso: string | Date, now = new Date()): string {
  const d = new Date(iso)
  const days = differenceInCalendarDays(now, d)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return isSameYear(d, now) ? format(d, 'EEEE d MMMM') : format(d, 'd MMMM yyyy')
}

export function sameDay(a: string | Date, b: string | Date): boolean {
  return isSameDay(new Date(a), new Date(b))
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
