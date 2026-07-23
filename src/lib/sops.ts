// Shared constants + helpers for the SOP Library (Module 7).
// An SOP (Standard Operating Procedure) is admin-authored rich-text
// "knowledge that doesn't walk out the door": a title, a free-text category,
// and a sanitized rich-text HTML body, with a draft/published status.
// Admins manage all; staff read only the published ones.

import DOMPurify from 'isomorphic-dompurify'
import type { Database } from '@/types/database'

export type SopRow = Database['public']['Tables']['sops']['Row']
export type SopStatus = 'draft' | 'published'

// Free-text category with suggestions (NOT a rigid enum) — the DB column is
// plain text; these just populate a datalist / quick-pick.
export const CATEGORY_SUGGESTIONS = [
  'Onboarding',
  'Sponsorship',
  'Events',
  'Finance',
  'Membership',
  'Renewals',
  'General',
] as const

export const STATUS_META: Record<
  SopStatus,
  { label: string; variant: 'active' | 'draft' }
> = {
  published: { label: 'Published', variant: 'active' },
  draft: { label: 'Draft', variant: 'draft' },
}

// Group SOPs by their (free-text) category, categories sorted alphabetically
// but with any suggestion order preferred first.
export function groupByCategory(sops: SopRow[]): [string, SopRow[]][] {
  const map = new Map<string, SopRow[]>()
  for (const s of sops) {
    const cat = s.category?.trim() || 'General'
    const arr = map.get(cat) ?? []
    arr.push(s)
    map.set(cat, arr)
  }
  const order = (c: string) => {
    const i = (CATEGORY_SUGGESTIONS as readonly string[]).indexOf(c)
    return i === -1 ? CATEGORY_SUGGESTIONS.length : i
  }
  return [...map.entries()].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
}

// Sanitize a rich-text HTML body for safe render (used everywhere a body is
// shown, staff or admin). Mirrors the app's isomorphic-dompurify usage.
export function sanitizeSopHtml(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'hr', 'span', 'div',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  })
}

// Strip HTML to plain text for previews / snippets.
export function toPlainText(html: string | null | undefined): string {
  if (!html) return ''
  // Sanitise keeping structure, then turn block boundaries + <br> into spaces
  // BEFORE stripping tags — otherwise text from adjacent blocks/list items
  // merges together (e.g. "youdogotit"). Finally strip remaining tags.
  const structured = sanitizeSopHtml(html)
  const spaced = structured
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr|ul|ol)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
  const decoded = spaced
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
  return decoded.replace(/\s+/g, ' ').trim()
}
