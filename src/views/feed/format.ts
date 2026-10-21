// Feed time labels: "now", "5m", "3h", "Yesterday", "4d", "3 Oct", "3 Oct 2025".
// Only ever called after mount (FeedView gates on the chat provider), so the
// server never renders a time that could mismatch on hydration.

import { differenceInCalendarDays, format, isSameYear } from 'date-fns'
import type { ChatPerson } from '@/lib/chat/contract'

export function feedTime(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const mins = (now.getTime() - d.getTime()) / 60_000
  if (mins < 1) return 'now'
  if (mins < 60) return `${Math.floor(mins)}m`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h`
  const days = differenceInCalendarDays(now, d)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d`
  return isSameYear(d, now) ? format(d, 'd MMM') : format(d, 'd MMM yyyy')
}

export function fullTime(iso: string): string {
  return format(new Date(iso), "EEEE d MMMM yyyy 'at' HH:mm")
}

/** "Founder · Acme" / "The Club team" / "Member". */
export function personLine(p: ChatPerson | null | undefined): string {
  if (!p) return ''
  if (p.isAdmin) return 'The Club team'
  return [p.jobTitle, p.company].filter(Boolean).join(' · ')
}

export const personName = (p: ChatPerson | null | undefined) => p?.name ?? 'Former member'

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}
