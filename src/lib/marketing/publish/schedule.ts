// Post scheduling rules — shared by the asset route (server) and the approval
// queue (client). Pure functions only: NO Metricool client / axios import here,
// so this file is safe to bundle in the browser.
//
// marketing_assets.scheduled_at (timestamptz) = when a social post should go
// out. MetricoolPublisher uses it as Metricool's publicationDate when it is in
// the future at approve time (pickPublicationInstant); otherwise approving
// publishes now. The admin sets it from the card's "Schedule" panel (asset
// route action 'save' with scheduled_at) — only for the Metricool social
// channels, and only while the post has NOT been sent to Metricool yet.

// The channels MetricoolPublisher handles (mirrors METRICOOL_CHANNELS in
// ./metricool.ts — kept separate so the client doesn't import the server file).
export const METRICOOL_SOCIAL_CHANNELS: ReadonlySet<string> = new Set([
  'linkedin',
  'instagram_feed',
  'instagram_carousel',
  'instagram_reel',
  'facebook',
  'tiktok',
])

export function isMetricoolSocialChannel(channel: string): boolean {
  return METRICOOL_SOCIAL_CHANNELS.has(channel)
}

// A scheduled time must be at least this far ahead when it is SET (gives
// Metricool time to import the media) …
export const SCHEDULE_MIN_LEAD_MS = 5 * 60 * 1000
// … and at most this many months ahead. Metricool's help centre says manual
// calendar posts have no limit (recurring posts cap at 180 days), so 6 months
// is our own sane ceiling, not a Metricool rule.
export const SCHEDULE_MAX_MONTHS = 6

export function scheduleMaxDate(now: Date): Date {
  const max = new Date(now.getTime())
  max.setMonth(max.getMonth() + SCHEDULE_MAX_MONTHS)
  return max
}

export type ScheduleValidation = { ok: true; value: string | null } | { ok: false; error: string }

// Validate the scheduled_at an admin sends. null / '' clears it.
export function validateScheduledAt(input: unknown, now: Date): ScheduleValidation {
  if (input === null || input === '') return { ok: true, value: null }
  if (typeof input !== 'string') return { ok: false, error: 'scheduled_at must be an ISO date string or null.' }
  const t = new Date(input)
  if (Number.isNaN(t.getTime())) return { ok: false, error: 'scheduled_at is not a valid date.' }
  if (t.getTime() < now.getTime() + SCHEDULE_MIN_LEAD_MS) {
    return { ok: false, error: 'Pick a time at least 5 minutes from now.' }
  }
  if (t.getTime() > scheduleMaxDate(now).getTime()) {
    return { ok: false, error: `Posts can be scheduled at most ${SCHEDULE_MAX_MONTHS} months ahead.` }
  }
  return { ok: true, value: t.toISOString() }
}

// Statuses that mean the network has (or is about to have) the post — never
// delete those. AWAITING_CONFIRMATION = handed to the network's app (TikTok)
// waiting for a final tap; treat it as sent.
const SENT_PROVIDER_STATUSES = new Set(['PUBLISHED', 'PUBLISHING', 'AWAITING_CONFIRMATION'])

export type MetricoolPostState = 'pending' | 'published' | 'gone'

// Decide whether a Metricool planner post can still be withdrawn.
//   snapshot null      → the post no longer exists in Metricool ('gone');
//   any provider status PUBLISHED / PUBLISHING / AWAITING_CONFIRMATION → 'published';
//   draft:true, or provider status PENDING / DRAFT / ERROR → 'pending';
//   no usable status   → by time: publishAt in the future → 'pending', else
//                        assume 'published' (never delete something that may
//                        already be live).
export function metricoolPostState(
  snapshot: { draft: boolean | null; providerStatuses: string[] } | null,
  publishAtIso: string | null,
  now: Date,
): MetricoolPostState {
  if (!snapshot) return 'gone'
  if (snapshot.providerStatuses.some((s) => SENT_PROVIDER_STATUSES.has(s))) return 'published'
  if (snapshot.draft === true) return 'pending'
  if (snapshot.providerStatuses.length) return 'pending'
  return isFuture(publishAtIso, now) ? 'pending' : 'published'
}

export function isFuture(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t > now.getTime()
}

// ── Wall-clock helpers (timezone-explicit, independent of the browser zone) ──
// The Schedule panel works in METRICOOL_TIMEZONE (default Europe/London): the
// admin picks "YYYY-MM-DDTHH:mm" as UK wall-clock time, we convert it to a UTC
// instant for scheduled_at. Intl does the zone maths (BST/GMT included).

export const DEFAULT_SCHEDULE_TIMEZONE = 'Europe/London'

interface ZoneParts {
  y: number
  m: number
  d: number
  h: number
  mi: number
  s: number
  weekday: number // 0 = Sunday … 6 = Saturday
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function zoneParts(date: Date, timeZone: string): ZoneParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '0'
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour')) % 24,
    mi: Number(get('minute')),
    s: Number(get('second')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

// Zone offset (ms) at an instant: wall clock − UTC.
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zoneParts(date, timeZone)
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

// "YYYY-MM-DDTHH:mm" wall clock in `timeZone` → the instant. null if unparseable.
export function wallClockToInstant(wall: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wall.trim())
  if (!m) return null
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  const off1 = zoneOffsetMs(new Date(guess), timeZone)
  let t = guess - off1
  const off2 = zoneOffsetMs(new Date(t), timeZone)
  if (off2 !== off1) t = guess - off2
  return new Date(t)
}

// Instant → "YYYY-MM-DDTHH:mm" wall clock in `timeZone` (DateTimeField format).
export function instantToWallClock(date: Date, timeZone: string): string {
  const p = zoneParts(date, timeZone)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`
}

// "Tue 28 Oct, 18:00" in `timeZone`.
export function formatScheduleTime(iso: string | Date, timeZone: string): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return String(iso)
  const p = zoneParts(date, timeZone)
  const weekday = Object.keys(WEEKDAY_INDEX)[p.weekday]
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p.m - 1]
  return `${weekday} ${p.d} ${month}, ${pad(p.h)}:${pad(p.mi)}`
}

// Quick picks computed in `timeZone` (not the browser's zone).
export function scheduleQuickPicks(now: Date, timeZone: string): { label: string; wall: string }[] {
  const today = zoneParts(now, timeZone)
  const day = (offset: number) => {
    const d = new Date(Date.UTC(today.y, today.m - 1, today.d + offset))
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const toMonday = ((1 - today.weekday + 7) % 7) || 7
  return [
    { label: 'Tomorrow 9:00', wall: `${day(1)}T09:00` },
    { label: 'Tomorrow 18:00', wall: `${day(1)}T18:00` },
    { label: 'Next Monday 9:00', wall: `${day(toMonday)}T09:00` },
  ]
}

// Label for the zone, e.g. "UK time (Europe/London)".
export function scheduleZoneLabel(timeZone: string): string {
  return timeZone === 'Europe/London' ? 'UK time (Europe/London)' : `${timeZone} time`
}

// Short suffix for chips, e.g. "UK".
export function scheduleZoneShort(timeZone: string): string {
  return timeZone === 'Europe/London' ? 'UK' : timeZone
}
