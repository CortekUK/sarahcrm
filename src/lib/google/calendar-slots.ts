// Pure free-slot maths for Google Calendar booking — NO network, NO googleapis.
//
// Kept separate from ./calendar.ts so the slot logic (business hours in a
// named time zone, DST-safe wall-clock → UTC, busy-interval subtraction,
// spreading offers across days) can be exercised offline with mock busy data.
// calendar.ts feeds it the freeBusy response; nothing here talks to Google.

export interface BusyInterval {
  start: string // ISO
  end: string // ISO
}

export interface BusinessHours {
  startHour: number // inclusive, wall-clock hour in `timeZone` (default 10)
  endHour: number // exclusive end of the last slot (default 17)
  days: number[] // ISO weekdays allowed: 1 = Mon … 7 = Sun (default Mon–Fri)
  timeZone: string // IANA zone (default Europe/London)
}

export interface FreeSlot {
  start: string // ISO (UTC)
  end: string // ISO (UTC)
  calendars: string[] // which of the queried calendars are free for the whole slot
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  startHour: 10,
  endHour: 17,
  days: [1, 2, 3, 4, 5],
  timeZone: 'Europe/London',
}

// Wall-clock parts of `date` as seen in `timeZone`.
function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  })
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdayMap[parts.weekday] ?? 0,
  }
}

// Offset (ms) of `timeZone` from UTC at instant `date` (e.g. +3600000 in BST).
function tzOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

// Wall-clock time in `timeZone` → the real UTC instant. Two-pass so it stays
// correct across the DST changeover days.
export function zonedTimeToUtc(
  year: number,
  month: number, // 1–12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  let ts = guess - tzOffsetMs(new Date(guess), timeZone)
  ts = guess - tzOffsetMs(new Date(ts), timeZone)
  return new Date(ts)
}

function overlaps(aStart: number, aEnd: number, b: { s: number; e: number }): boolean {
  return aStart < b.e && b.s < aEnd
}

// Every bookable slot of `durationMins` (on a `stepMins` grid) inside business
// hours between `rangeStart` and `rangeEnd`, with the calendars that are free
// for the whole slot. mode 'any' keeps a slot if at least one calendar is free
// (a team pool); 'all' needs every calendar free. Calendars listed in
// `unavailable` (freeBusy returned an error for them) are NEVER treated as free.
export function computeFreeSlots(args: {
  busyByCalendar: Record<string, BusyInterval[]>
  calendarIds: string[]
  rangeStart: Date
  rangeEnd: Date
  durationMins: number
  stepMins?: number
  hours?: Partial<BusinessHours>
  mode?: 'any' | 'all'
  unavailable?: string[]
}): FreeSlot[] {
  const hours: BusinessHours = { ...DEFAULT_BUSINESS_HOURS, ...(args.hours ?? {}) }
  const step = Math.max(5, args.stepMins ?? 30)
  const dur = Math.max(5, args.durationMins)
  const mode = args.mode ?? 'any'
  const unavailable = new Set(args.unavailable ?? [])
  const usable = args.calendarIds.filter((c) => !unavailable.has(c))
  if (usable.length === 0) return []
  if (mode === 'all' && usable.length !== args.calendarIds.length) return []

  const busy: Record<string, { s: number; e: number }[]> = {}
  for (const cal of usable) {
    busy[cal] = (args.busyByCalendar[cal] ?? [])
      .map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }))
      .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e))
  }

  const rangeStartMs = args.rangeStart.getTime()
  const rangeEndMs = args.rangeEnd.getTime()
  const out: FreeSlot[] = []

  // Walk calendar days in the target zone. Start from the zoned date of
  // rangeStart and step one civil day at a time (noon UTC anchor avoids DST
  // edge skips).
  const first = zonedParts(args.rangeStart, hours.timeZone)
  let cursor = Date.UTC(first.year, first.month - 1, first.day, 12)
  // Hard stop so a silly range can never spin (≈ 2 months of days).
  for (let i = 0; i < 62; i++, cursor += 24 * 60 * 60 * 1000) {
    const civil = new Date(cursor)
    const y = civil.getUTCFullYear()
    const m = civil.getUTCMonth() + 1
    const d = civil.getUTCDate()
    const dayStart = zonedTimeToUtc(y, m, d, hours.startHour, 0, hours.timeZone).getTime()
    if (dayStart > rangeEndMs) break
    const weekday = zonedParts(new Date(dayStart), hours.timeZone).weekday
    if (!hours.days.includes(weekday)) continue
    const dayEnd = zonedTimeToUtc(y, m, d, hours.endHour, 0, hours.timeZone).getTime()

    for (let s = dayStart; s + dur * 60000 <= dayEnd; s += step * 60000) {
      const e = s + dur * 60000
      if (s < rangeStartMs || e > rangeEndMs) continue
      const free = usable.filter((cal) => !busy[cal].some((b) => overlaps(s, e, b)))
      const keep = mode === 'all' ? free.length === usable.length : free.length > 0
      if (keep) out.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString(), calendars: free })
    }
  }
  return out
}

// Pick up to `n` slots spread across different days (one per day first,
// alternating morning/afternoon), so the visitor sees a real choice rather
// than five back-to-back times on Monday.
export function pickSpreadSlots(slots: FreeSlot[], n: number, timeZone = DEFAULT_BUSINESS_HOURS.timeZone): FreeSlot[] {
  const byDay = new Map<string, FreeSlot[]>()
  for (const s of slots) {
    const p = zonedParts(new Date(s.start), timeZone)
    const key = `${p.year}-${p.month}-${p.day}`
    const list = byDay.get(key) ?? []
    list.push(s)
    byDay.set(key, list)
  }
  const days = [...byDay.values()]
  const picked: FreeSlot[] = []
  let round = 0
  while (picked.length < n && days.some((d) => d.length > 0) && round < 10) {
    days.forEach((daySlots, i) => {
      if (picked.length >= n || daySlots.length === 0) return
      // Alternate preference: even days → earliest, odd days → afternoon-ish.
      const wantAfternoon = (i + round) % 2 === 1
      let idx = 0
      if (wantAfternoon) {
        const pm = daySlots.findIndex((s) => zonedParts(new Date(s.start), timeZone).hour >= 14)
        idx = pm >= 0 ? pm : daySlots.length - 1
      }
      picked.push(daySlots[idx])
      // Drop slots within 2h of the one just picked on that day so a later
      // round doesn't offer a near-duplicate time.
      const t = new Date(daySlots[idx].start).getTime()
      for (let k = daySlots.length - 1; k >= 0; k--) {
        if (Math.abs(new Date(daySlots[k].start).getTime() - t) < 2 * 60 * 60 * 1000) daySlots.splice(k, 1)
      }
    })
    round++
  }
  return picked.sort((a, b) => a.start.localeCompare(b.start))
}

// "Tue 21 Oct, 10:30" in the target zone.
export function formatSlotLabel(iso: string, timeZone = DEFAULT_BUSINESS_HOURS.timeZone): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${day}, ${time}`
}
