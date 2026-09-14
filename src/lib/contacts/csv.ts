// CSV parsing + column mapping for the Contacts importer.
//
// Deliberately tolerant: the two real source exports (the me&u contact dump
// and the Clay enrichment) use completely different headers for the same
// fields, and Sarah will upload fresh Clay exports later whose columns may
// shift again. So headers are matched by alias, and any column we don't
// recognise is simply ignored rather than failing the upload.
//
// One generic upload handles BOTH files — they share `email` as the identity
// key, and the merge rule in the import route (blank never overwrites a stored
// value) makes an enrichment file additive over a thinner one.

import { toSector } from './sectors'

// ── Parser ───────────────────────────────────────────────────
// Minimal RFC-4180-ish parser: quoted fields, embedded commas, escaped quotes
// ("") and quoted newlines. Mirrors the members importer's parser.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((f) => f.trim() !== '')) rows.push(row)
  }
  return rows
}

// ── Column mapping ───────────────────────────────────────────
export interface ContactRow {
  email: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  job_title: string | null
  website: string | null
  industry_raw: string | null
  employee_count: number | null
  company_size: string | null
  linkedin_url: string | null
  sector: string
  phone: string | null
  city: string | null
  location: string | null
  email_subscribed: boolean
  sms_subscribed: boolean
  source: string | null
  groups: string[]
  is_member_flag: boolean
}

type Field = Exclude<keyof ContactRow, 'sector' | 'groups'>

// Normalised header → field. Covers both real exports plus common variants.
const ALIASES: Record<Field, string[]> = {
  email: ['email', 'emailaddress', 'mail'],
  first_name: ['firstname', 'first', 'forename', 'givenname'],
  last_name: ['lastname', 'last', 'surname', 'familyname'],
  company_name: ['company', 'companyname', 'companyname2', 'organisation', 'organization', 'business', 'enrichcompany'],
  job_title: ['jobtitle', 'title', 'role', 'position'],
  website: ['website', 'url', 'domain', 'companywebsite'],
  industry_raw: ['industry', 'sector', 'vertical'],
  employee_count: ['employeecount', 'employees', 'headcount', 'numberofemployees'],
  company_size: ['size', 'companysize'],
  linkedin_url: ['linkedinurl', 'linkedin', 'linkedinurl2', 'linkedinprofile'],
  phone: ['mobile', 'phone', 'phonenumber', 'tel', 'telephone'],
  city: ['locality', 'city', 'town'],
  location: ['location', 'region', 'country', 'companyaddress'],
  email_subscribed: ['subscribetoemail', 'emailsubscribed', 'subscribed'],
  sms_subscribed: ['subscribetosms', 'smssubscribed'],
  source: ['source', 'accountname', 'origin'],
  is_member_flag: ['iscurrentmember', 'member', 'ismember'],
}

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-.()]/g, '')
}

/**
 * Header index → field. Unrecognised columns are left unmapped.
 *
 * When two headers claim the same field, the one whose alias appears EARLIER
 * in that field's alias list wins — not simply the leftmost column. The source
 * export needs this: its junk "Account name" column sits to the left of the
 * real "Source" column, and positional matching would pick the junk.
 */
export function mapHeaders(headerRow: string[]): Record<number, Field> {
  const best: Partial<Record<Field, { idx: number; rank: number }>> = {}

  headerRow.forEach((raw, idx) => {
    const norm = normaliseHeader(raw)
    for (const field of Object.keys(ALIASES) as Field[]) {
      const rank = field === norm ? -1 : ALIASES[field].indexOf(norm)
      if (rank === -1 && field !== norm) continue
      const current = best[field]
      if (!current || rank < current.rank) best[field] = { idx, rank }
      break
    }
  })

  const map: Record<number, Field> = {}
  for (const [field, hit] of Object.entries(best) as [Field, { idx: number }][]) {
    map[hit.idx] = field
  }
  return map
}

// ── Value coercion ───────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim())
}

/** "yes"/"true"/"1"/"y" → true. Anything else (incl. blank) → the default. */
function toBool(v: string | undefined, fallback: boolean): boolean {
  if (v == null) return fallback
  const s = v.trim().toLowerCase()
  if (!s) return fallback
  if (['yes', 'true', '1', 'y', 'subscribed'].includes(s)) return true
  if (['no', 'false', '0', 'n', 'unsubscribed'].includes(s)) return false
  return fallback
}

function toInt(v: string | undefined): number | null {
  if (!v) return null
  const n = parseInt(v.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

// Clay writes a failure marker into the cell rather than leaving it blank
// (610 rows in the real export say "❌ Company Not Found"). Treat those as
// empty so they never land in the table as a company name — and so the merge
// rule doesn't count them as a value worth overwriting a good one with.
const NOT_FOUND_RE = /^(❌|✖|x)?\s*(company\s+)?not\s+found$|^n\/?a$|^-+$|^null$|^undefined$/i

function clean(v: string | undefined): string | null {
  const s = (v ?? '').trim()
  if (s === '') return null
  // Strip any leading emoji/status glyph Clay prefixes before testing.
  const bare = s.replace(/^[^\p{L}\p{N}]+/u, '').trim()
  if (NOT_FOUND_RE.test(bare) || NOT_FOUND_RE.test(s)) return null
  return s
}

// The source export's `Tags` column is 96% filled but almost entirely junk —
// import filenames like "contacts.csv" or "Untitledspreadsheet". Only a small
// set of real groupings is worth keeping.
const JUNK_TAG_RE = /\.(csv|xlsx?)$|^untitled|^sheet|^import|^\d+$|^contacts?$/i

function parseGroups(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[;,|]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !JUNK_TAG_RE.test(t))
    .slice(0, 10)
}

/**
 * Turn one CSV data row into a ContactRow, or null when the email is missing
 * or malformed (the caller reports those as skipped).
 */
export function toContactRow(
  cells: string[],
  headerMap: Record<number, Field>,
): ContactRow | null {
  const get = (f: Field): string | undefined => {
    for (const [idx, field] of Object.entries(headerMap)) {
      if (field === f) {
        const v = cells[Number(idx)]
        if (v != null && v.trim() !== '') return v
      }
    }
    return undefined
  }

  const email = (get('email') ?? '').trim().toLowerCase()
  if (!email || !isValidEmail(email)) return null

  const industry = clean(get('industry_raw'))
  // Raw `Tags` isn't an aliased field (it's junk more often than not), so it's
  // read positionally by header name instead.
  const groups = parseGroups(undefined)

  return {
    email,
    first_name: clean(get('first_name')),
    last_name: clean(get('last_name')),
    company_name: clean(get('company_name')),
    job_title: clean(get('job_title')),
    website: clean(get('website')),
    industry_raw: industry,
    employee_count: toInt(get('employee_count')),
    company_size: clean(get('company_size')),
    linkedin_url: clean(get('linkedin_url')),
    sector: toSector(industry),
    phone: clean(get('phone')),
    city: clean(get('city')),
    location: clean(get('location')),
    email_subscribed: toBool(get('email_subscribed'), true),
    sms_subscribed: toBool(get('sms_subscribed'), true),
    source: clean(get('source')),
    groups,
    is_member_flag: toBool(get('is_member_flag'), false),
  }
}

/** Parse a whole CSV into rows + the count that had no usable email. */
export function parseContactsCsv(text: string): { rows: ContactRow[]; invalid: number } {
  const grid = parseCsv(text)
  if (grid.length < 2) return { rows: [], invalid: 0 }
  const headerMap = mapHeaders(grid[0])

  // `Tags` is handled separately — find its column by header name.
  const tagIdx = grid[0].findIndex((h) => normaliseHeader(h) === 'tags')

  const rows: ContactRow[] = []
  let invalid = 0
  for (let i = 1; i < grid.length; i++) {
    const row = toContactRow(grid[i], headerMap)
    if (!row) {
      invalid++
      continue
    }
    if (tagIdx >= 0) row.groups = parseGroups(grid[i][tagIdx])
    rows.push(row)
  }
  return { rows, invalid }
}
