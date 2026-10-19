// Concierge event suggestions — a compact list of UPCOMING, PUBLIC events the
// AI Website Concierge may recommend.
//
// Visibility mirrors the public /events pages: status in ('published','live').
// The chat route uses the SERVICE-ROLE client (bypasses RLS), so this filter is
// the only thing keeping 'planning' / 'draft' / 'cancelled' events out — it is
// applied explicitly here and never relaxed. 'completed' is public too but is
// excluded because only future events (start_date >= now) are suggested.
//
// Token budget: at most MAX_EVENTS rows, only slug/title/date/city/type and a
// ~110-char pitch, cached in-process for CACHE_MS so a busy chat doesn't hit
// the DB on every turn. Nothing private (prices, capacity, planning_data,
// sponsor info) is selected.

import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_EVENTS = 8
const HORIZON_DAYS = 180
const CACHE_MS = 5 * 60 * 1000
const PITCH_CHARS = 110
const PUBLIC_UPCOMING_STATUSES = ['published', 'live'] as const

export interface ConciergeEvent {
  slug: string
  title: string
  start_date: string // ISO
  date_label: string // "Thu 6 Nov 2026"
  city: string | null
  type: string // member_event | curated_luxury | retreat
  pitch: string
  url: string // public event page, relative to the site origin
}

// The shape the widget renders as a card.
export type ConciergeEventCard = Pick<ConciergeEvent, 'slug' | 'title' | 'date_label' | 'city' | 'pitch' | 'url'>

let cache: { at: number; events: ConciergeEvent[] } | null = null

// Strip HTML / markdown-ish noise and clip to a short one-line pitch.
function toPitch(description: string | null): string {
  if (!description) return ''
  const text = description
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[#*_`>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= PITCH_CHARS) return text
  const cut = text.slice(0, PITCH_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:\s]+$/, '')}…`
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Upcoming public events (cached). Never throws — a failure yields [] so the
// concierge simply doesn't suggest events that turn.
export async function getUpcomingPublicEvents(admin: SupabaseClient): Promise<ConciergeEvent[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.events
  try {
    const now = new Date()
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000)
    const { data, error } = await admin
      .from('events')
      .select('slug, title, start_date, event_type, venue_city, description, status')
      .in('status', [...PUBLIC_UPCOMING_STATUSES])
      .gte('start_date', now.toISOString())
      .lte('start_date', horizon.toISOString())
      .order('start_date', { ascending: true })
      .limit(MAX_EVENTS)
    if (error) throw error
    const events: ConciergeEvent[] = (data ?? [])
      // Belt and braces: re-check status + date client-side too.
      .filter(
        (e: { status: string; start_date: string | null; slug: string | null }) =>
          (PUBLIC_UPCOMING_STATUSES as readonly string[]).includes(e.status) &&
          !!e.start_date &&
          !!e.slug &&
          new Date(e.start_date) >= now,
      )
      .map(
        (e: {
          slug: string
          title: string
          start_date: string
          event_type: string
          venue_city: string | null
          description: string | null
        }) => ({
          slug: e.slug,
          title: e.title,
          start_date: e.start_date,
          date_label: dateLabel(e.start_date),
          city: e.venue_city ?? null,
          type: e.event_type,
          pitch: toPitch(e.description),
          url: `/events/${encodeURIComponent(e.slug)}`,
        }),
      )
    cache = { at: Date.now(), events }
    return events
  } catch (e) {
    console.error('[concierge/events] load upcoming events failed:', e)
    return []
  }
}

// Compact prompt block: one line per event, "slug | title | date | city | type | pitch".
export function eventsPromptBlock(events: ConciergeEvent[]): string {
  if (events.length === 0) return '(No upcoming public events are listed right now.)'
  return events
    .map((e) =>
      [e.slug, e.title, e.date_label, e.city ?? '—', e.type.replace(/_/g, ' '), e.pitch || '—'].join(' | '),
    )
    .join('\n')
}

// Validate the model's suggested slugs against the list we actually gave it
// (never trust it to invent a slug) and return up to 3 cards.
export function pickEventCards(events: ConciergeEvent[], slugs: unknown): ConciergeEventCard[] {
  if (!Array.isArray(slugs)) return []
  const bySlug = new Map(events.map((e) => [e.slug, e]))
  const seen = new Set<string>()
  const out: ConciergeEventCard[] = []
  for (const s of slugs) {
    if (typeof s !== 'string' || seen.has(s)) continue
    const e = bySlug.get(s)
    if (!e) continue
    seen.add(s)
    out.push({ slug: e.slug, title: e.title, date_label: e.date_label, city: e.city, pitch: e.pitch, url: e.url })
    if (out.length >= 3) break
  }
  return out
}
