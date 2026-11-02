// Facts the receptionist may quote, loaded from Supabase at call start and
// cached in-process for 5 minutes (a call shouldn't wait on the DB, and a busy
// line shouldn't hammer it).
//
// Events mirror the website concierge (src/lib/concierge/events.ts): only
// status published/live, starting from now, next 180 days — the service-role
// client bypasses RLS, so this filter is what keeps draft/planning events out.
// Membership plans: active plans' name, lede and a few features. PRICES ARE
// NEVER LOADED — the receptionist must not quote prices.
import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from './log.js'

export interface EventFact {
  title: string
  dateLabel: string
  venue: string | null
  city: string | null
}

export interface PlanFact {
  name: string
  lede: string | null
  features: string[]
}

export interface ClubFacts {
  events: EventFact[]
  plans: PlanFact[]
}

const CACHE_MS = 5 * 60 * 1000
const MAX_EVENTS = 8
const HORIZON_DAYS = 180
let cache: { at: number; facts: ClubFacts } | null = null

export function resetFactsCache() {
  cache = null
}

export function eventDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function clip(s: string | null | undefined, n: number): string | null {
  if (!s) return null
  const t = s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/** Never throws — a failure yields empty lists (the agent then says the team can share details). */
export async function loadClubFacts(db: SupabaseClient | null, now = new Date()): Promise<ClubFacts> {
  if (!db) return { events: [], plans: [] }
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.facts

  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 3600 * 1000)
  const [eventsRes, plansRes] = await Promise.allSettled([
    db
      .from('events')
      .select('title, start_date, venue_name, venue_city, status')
      .in('status', ['published', 'live'])
      .gte('start_date', now.toISOString())
      .lte('start_date', horizon.toISOString())
      .order('start_date', { ascending: true })
      .limit(MAX_EVENTS),
    db
      .from('membership_plans')
      .select('name, lede, features, is_active, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .limit(6),
  ])

  const events: EventFact[] = []
  if (eventsRes.status === 'fulfilled' && !eventsRes.value.error) {
    for (const r of (eventsRes.value.data ?? []) as {
      title: string
      start_date: string | null
      venue_name: string | null
      venue_city: string | null
    }[]) {
      if (!r.start_date) continue
      events.push({ title: r.title, dateLabel: eventDateLabel(r.start_date), venue: r.venue_name, city: r.venue_city })
    }
  } else {
    log.warn('facts_events_failed', {
      error: eventsRes.status === 'rejected' ? String(eventsRes.reason) : eventsRes.value.error?.message,
    })
  }

  const plans: PlanFact[] = []
  if (plansRes.status === 'fulfilled' && !plansRes.value.error) {
    for (const r of (plansRes.value.data ?? []) as { name: string; lede: string | null; features: string[] | null }[]) {
      plans.push({
        name: r.name,
        lede: clip(r.lede, 160),
        features: (r.features ?? []).slice(0, 4).map((f) => clip(f, 80)).filter((f): f is string => !!f),
      })
    }
  } else {
    log.warn('facts_plans_failed', {
      error: plansRes.status === 'rejected' ? String(plansRes.reason) : plansRes.value.error?.message,
    })
  }

  const facts = { events, plans }
  cache = { at: Date.now(), facts }
  return facts
}

/** Event titles + venues from the last facts load (for speech-recognition hints). Never fetches. */
export function cachedEventHints(): string[] {
  const out: string[] = []
  for (const e of cache?.facts.events ?? []) {
    out.push(e.title)
    if (e.venue) out.push(e.venue)
    if (e.city) out.push(e.city)
  }
  return out
}
