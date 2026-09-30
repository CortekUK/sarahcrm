// Spreadsheet parsing for the Events importer.
//
// The source is Sarah's "Master Events Plan 2026 - 2027" workbook — a planning
// document, not a data export. What that means in practice:
//
//   • 7 tabs. Some list events in rows ("The Club by Sarah Restrick",
//     "PITCH", "Curated Experiences", "London: Harrods Rooftop Series"),
//     two are month-by-month CALENDAR GRIDS with no header row at all
//     ("Full Calendar", "Access"), one is nearly empty.
//   • The header row repeats partway down each tab, under a "2026 Events" /
//     "2027 Events" banner row.
//   • Cells are prose: "September 9th\n1pm - 4pm / 7pm - 11pm", "April /May",
//     "Q4 2026 or Q1 2027 (TBC)"; capacity "15 - 20"; five venues in one cell;
//     "Complimentary The Club Members / £100 + VAT Guests" for pricing.
//
// So this parser deliberately does NOT interpret any of it. It finds the rows,
// labels the columns, and hands every cell over verbatim. The one exception is
// a cell Excel itself stores as a real date, which we pass through as an ISO
// string so the admin form can pre-fill it.
//
// Tabs with no recognisable header row are skipped — that is what keeps the
// calendar grids out.

import * as XLSX from 'xlsx'
import { slugify } from '@/lib/utils'

export interface EventImportRow {
  /** Event title, trimmed to something usable as a heading. */
  title: string
  slug: string
  /** Which tab it came from — shown in the preview, drives the type guess. */
  sheet: string
  /** Section banner above the row, e.g. "2026 Events". */
  section: string | null
  event_type: 'member_event' | 'curated_luxury' | 'retreat'
  /** Set only when the cell was a genuine Excel date. */
  start_date: string | null
  /** Every labelled cell, exactly as written. */
  planning: Record<string, string>
}

export interface ParseResult {
  rows: EventImportRow[]
  /** Tabs we skipped, with the reason — shown in the preview so nothing looks lost. */
  skipped: { sheet: string; reason: string }[]
}

// Normalised header → the key we store it under in planning_data.
// Longest aliases first is not needed: matching is exact on the normalised text.
const HEADER_ALIASES: Record<string, string> = {
  event: 'event',
  concept: 'concept',
  purpose: 'purpose',
  targetaudience: 'target_audience',
  targetaudiencedemographics: 'target_audience',
  location: 'location',
  approxdate: 'date',
  approxdatetime: 'date',
  date: 'date',
  capacity: 'capacity',
  tickets: 'tickets',
  ticketsguestmix: 'tickets',
  sponsorship: 'sponsorship',
  sponsorshipcommercialpartners: 'sponsorship',
  venue: 'venue',
  venueproduction: 'venue',
  speakerpartner: 'speakers',
  speakerspartner: 'speakers',
  guestspeakerstalent: 'speakers',
  commercialdeliverynotes: 'notes',
  notes: 'notes',
}

// Labels for the preview and the admin panel, in the order they read best.
export const PLANNING_LABELS: Record<string, string> = {
  concept: 'Concept',
  purpose: 'Purpose',
  target_audience: 'Target audience',
  location: 'Location',
  date: 'Approx date & time',
  capacity: 'Capacity',
  tickets: 'Tickets',
  sponsorship: 'Sponsorship',
  venue: 'Venue',
  speakers: 'Speaker / partner',
  notes: 'Commercial & delivery notes',
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[\s_\-./&,()]/g, '')
}

/**
 * Excel stores a typed date as a day count from 1899-12-30. Read raw and do the
 * conversion here rather than letting the reader build Date objects: its
 * local-time conversion drags a 1 Jan 2027 cell back to 31 Dec 2026.
 *
 * The bounds cover 2000–2060, which keeps a capacity or a price from being
 * mistaken for a date.
 */
function serialToDate(v: unknown): Date | null {
  if (v instanceof Date) return v
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  if (v < 36_526 || v > 58_440) return null
  return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000)
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function cellText(v: unknown): string {
  if (v == null) return ''
  // A date cell must not reach the admin as "46388".
  const asDate = serialToDate(v)
  if (asDate && (v instanceof Date || typeof v === 'number')) return DATE_FMT.format(asDate)
  return String(v).trim()
}

/**
 * A header row is one where at least three cells match known column names and
 * one of them is "Event". Both conditions matter: a banner row like
 * "2026 Events" normalises to a single near-miss, and a data row can easily
 * contain the word "venue" in its prose.
 */
function headerMap(row: unknown[]): Record<number, string> | null {
  const map: Record<number, string> = {}
  for (let i = 0; i < row.length; i++) {
    const key = HEADER_ALIASES[normalise(cellText(row[i]))]
    if (key && !Object.values(map).includes(key)) map[i] = key
  }
  const keys = Object.values(map)
  return keys.length >= 3 && keys.includes('event') ? map : null
}

/** A banner row: one filled cell, no header match, e.g. "PITCH Event Series: 2027". */
function bannerText(row: unknown[]): string | null {
  const filled = row.map(cellText).filter((c) => c !== '')
  return filled.length === 1 ? filled[0] : null
}

/**
 * Event type from the tab name. Curated experiences and the Access/lifestyle
 * calendar are luxury experiences; everything else (member nights, PITCH,
 * the Harrods series) is a member event. The admin can change it — this is a
 * starting point, not a decision.
 */
function typeForSheet(sheet: string): EventImportRow['event_type'] {
  const s = sheet.toLowerCase()
  if (s.includes('experience') || s.includes('access')) return 'curated_luxury'
  if (s.includes('retreat')) return 'retreat'
  return 'member_event'
}

/**
 * Titles come from the Event column, which is sometimes a whole paragraph
 * (the PITCH tab describes the series in that cell). Take the first line and
 * cap it — the full text survives in planning_data under "event".
 */
function toTitle(raw: string): string {
  const firstLine = raw.split('\n')[0].trim() || raw.trim()
  return firstLine.length > 120 ? `${firstLine.slice(0, 117).trimEnd()}…` : firstLine
}

export function parseEventsWorkbook(buffer: ArrayBuffer): ParseResult {
  // Raw values: date serials are converted in cellText/serialToDate, where the
  // conversion can be pinned to UTC.
  const wb = XLSX.read(buffer, { type: 'array' })
  const rows: EventImportRow[] = []
  const skipped: ParseResult['skipped'] = []
  const seenSlugs = new Set<string>()

  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      defval: '',
      blankrows: false,
    })

    let map: Record<number, string> | null = null
    let section: string | null = null
    let found = 0

    for (const raw of grid) {
      const row = raw as unknown[]

      const asHeader = headerMap(row)
      if (asHeader) {
        map = asHeader
        continue
      }

      const banner = bannerText(row)
      if (banner) {
        section = banner
        continue
      }

      if (!map) continue

      const eventIdx = Number(
        Object.keys(map).find((i) => map![Number(i)] === 'event'),
      )
      const titleRaw = cellText(row[eventIdx])
      if (titleRaw === '') continue

      const planning: Record<string, string> = {}
      let startDate: string | null = null

      for (const [idxStr, key] of Object.entries(map)) {
        const idx = Number(idxStr)
        const value = cellText(row[idx])
        if (value === '') continue
        planning[key] = value
        // Only a cell Excel stored as a real date is trustworthy enough to
        // pre-fill; "April /May" stays text for the admin to resolve.
        if (key === 'date') {
          const typed = serialToDate(row[idx])
          if (typed) startDate = typed.toISOString()
        }
      }

      const title = toTitle(titleRaw)
      // Several tabs repeat the same title ("The Club | Member Event" twice,
      // PITCH four times). Suffix duplicates so each keeps its own URL; the
      // server checks the slug against the database as well.
      let slug = slugify(title)
      if (!slug) slug = 'event'
      let unique = slug
      let n = 2
      while (seenSlugs.has(unique)) unique = `${slug}-${n++}`
      seenSlugs.add(unique)

      rows.push({
        title,
        slug: unique,
        sheet: name,
        section,
        event_type: typeForSheet(name),
        start_date: startDate,
        planning,
      })
      found++
    }

    if (found === 0) {
      skipped.push({
        sheet: name,
        reason: map ? 'no event rows under the headings' : 'no event table found (calendar or notes tab)',
      })
    }
  }

  return { rows, skipped }
}
