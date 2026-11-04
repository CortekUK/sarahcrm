// Small client-side helpers shared by the member portal views.

// DB rules reject bad writes with messages like
//   "DUPLICATE_BOOKING: this member already has a booking…"
// Show members the human part only. Anything without a token (raw Postgres /
// network errors) falls back to the friendly message supplied by the caller.
const DB_TOKEN_RE = /^\s*([A-Z][A-Z0-9_]{2,})(?::\s*([\s\S]*))?$/

export function dbErrorMessage(
  err: { message?: string | null } | string | null | undefined,
  fallback = 'Something went wrong. Please try again.',
): string {
  const raw = typeof err === 'string' ? err : (err?.message ?? '')
  const m = raw.match(DB_TOKEN_RE)
  if (!m) return fallback
  const human = (m[2] ?? '').trim()
  if (human) return human.charAt(0).toUpperCase() + human.slice(1)
  if (m[1] === 'PROFILE_FIELD_LOCKED' || m[1] === 'MEMBER_FIELD_LOCKED') {
    return 'Some of these details can only be changed by The Club team.'
  }
  return fallback
}

// The token itself (e.g. "DUPLICATE_CLAIM"), or null.
export function dbErrorToken(err: { message?: string | null } | string | null | undefined): string | null {
  const raw = typeof err === 'string' ? err : (err?.message ?? '')
  return raw.match(DB_TOKEN_RE)?.[1] ?? null
}

// Seats taken per event (1 + guests over confirmed/pending bookings), counted
// server-side because members can only read their own bookings under RLS.
export async function fetchSeatsTaken(eventIds: string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {}
  try {
    const res = await fetch(`/api/events/seats?ids=${encodeURIComponent(eventIds.join(','))}`, {
      cache: 'no-store',
    })
    if (!res.ok) return {}
    return (await res.json()) as Record<string, number>
  } catch {
    return {}
  }
}

// Read a JSON error body from one of our API routes.
export async function apiError(res: Response, fallback: string): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  return json.error ? dbErrorMessage(json.error, json.error) : fallback
}

// Accent- and case-insensitive text for search matching.
export function normalizeSearch(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
