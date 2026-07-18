import type { Database } from '@/types/database'

export type ContactRow = Database['public']['Tables']['whatsapp_contacts']['Row']

export interface WaLogRow {
  id: string
  to_phone: string
  direction: string
  template_name: string | null
  body: string | null
  status: string
  created_at: string
  whatsapp_message_id: string | null
}

// A member resolved from a contact phone, for name display + profile link.
export interface MemberMatch {
  memberId: string
  name: string
}

// The 24-hour customer-service window (free-text only delivers inside it).
export const WINDOW_MS = 24 * 60 * 60 * 1000

// Approved templates offered in the composers. `hello_world` is Meta's default
// sample; add more approved template names here as they're created in the WABA.
export const TEMPLATES: { value: string; label: string; languageCode: string }[] = [
  { value: 'hello_world', label: 'hello_world (sample)', languageCode: 'en_US' },
]

// Last 9 digits of a phone, for suffix-matching across differing formats
// (member profile.phone is free-text; whatsapp_log.to_phone is E.164 digits).
export function phoneKey(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D+/g, '')
  return digits.slice(-9)
}

// Short relative time for the conversation list (e.g. "3m", "2h", "Mon").
export function shortTime(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// Time-of-day for a message bubble footer (e.g. "14:32").
export function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// Initials for the avatar circle.
export function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '#'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
