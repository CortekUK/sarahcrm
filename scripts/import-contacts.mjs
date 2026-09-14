// Bulk contact loader — the initial ~11k import.
//
//   node scripts/import-contacts.mjs <file.csv> [more.csv ...] [--commit]
//
// Runs the SAME merge rule as the in-app importer (blank never overwrites a
// stored value, sector only upgrades, consent is one-way), but talks straight
// to Postgres via the service-role key. Use it for the first big load — the
// UI importer is fine for the smaller Clay refreshes afterwards.
//
// Dry-run by default: prints what would happen and writes nothing. Add
// --commit to apply. Order doesn't matter — run the thin export and the Clay
// enrichment in either sequence, as many times as you like.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = path.resolve(import.meta.dirname, '..')

// ── env ──────────────────────────────────────────────────────
const envPath = [path.join(root, '.env.local'), path.join(root, '.env')].find((p) =>
  fs.existsSync(p),
)
if (!envPath) {
  console.error('No .env.local or .env found')
  process.exit(1)
}
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ── args ─────────────────────────────────────────────────────
const args = process.argv.slice(2)
const commit = args.includes('--commit')
const files = args.filter((a) => !a.startsWith('--'))
if (files.length === 0) {
  console.error('Usage: node scripts/import-contacts.mjs <file.csv> [...] [--commit]')
  process.exit(1)
}

// ── the shared parsing/sector logic, loaded from src via tsx ─
// Keeping one implementation avoids the script and the app drifting apart.
const { parseContactsCsv } = await import('../src/lib/contacts/csv.ts')
const { UNSEGMENTED, SECTOR_LABELS } = await import('../src/lib/contacts/sectors.ts')

const MERGE_FIELDS = [
  'first_name',
  'last_name',
  'company_name',
  'job_title',
  'website',
  'industry_raw',
  'employee_count',
  'company_size',
  'linkedin_url',
  'phone',
  'city',
  'location',
  'source',
]

function has(v) {
  if (v == null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}

// ── read + merge every file in memory first ──────────────────
const byEmail = new Map()
let totalRead = 0
let totalInvalid = 0

for (const f of files) {
  const abs = path.isAbsolute(f) ? f : path.resolve(process.cwd(), f)
  if (!fs.existsSync(abs)) {
    console.error(`✗ Not found: ${abs}`)
    process.exit(1)
  }
  const { rows, invalid } = parseContactsCsv(fs.readFileSync(abs, 'utf8'))
  totalRead += rows.length
  totalInvalid += invalid
  console.log(`→ ${path.basename(abs)}: ${rows.length} rows (${invalid} skipped, no valid email)`)

  for (const r of rows) {
    const prior = byEmail.get(r.email)
    if (!prior) {
      byEmail.set(r.email, r)
      continue
    }
    for (const f2 of MERGE_FIELDS) if (has(r[f2])) prior[f2] = r[f2]
    if (r.sector !== UNSEGMENTED) prior.sector = r.sector
    prior.groups = [...new Set([...(prior.groups ?? []), ...(r.groups ?? [])])]
    prior.email_subscribed = prior.email_subscribed && r.email_subscribed
    prior.sms_subscribed = prior.sms_subscribed && r.sms_subscribed
    prior.is_member_flag = prior.is_member_flag || r.is_member_flag
  }
}

const incoming = [...byEmail.values()]
console.log(
  `\n${totalRead} rows read across ${files.length} file(s) → ${incoming.length} unique contacts` +
    ` (${totalRead - incoming.length} duplicates merged, ${totalInvalid} invalid)`,
)

const bySector = {}
for (const r of incoming) bySector[r.sector] = (bySector[r.sector] ?? 0) + 1
console.log('\nSectors:')
for (const [k, v] of Object.entries(bySector).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(6)}  ${SECTOR_LABELS[k] ?? k}`)
}
const optedOut = incoming.filter((r) => !r.email_subscribed).length
console.log(`\nEmailable: ${incoming.length - optedOut}   Opted out: ${optedOut}`)

// ── compare against what's already stored ────────────────────
const db = createClient(URL, KEY, { auth: { persistSession: false } })
const CHUNK = 500

// Page through everything already stored rather than querying by a list of
// emails: supabase-js builds `.in()` into the GET query string, and 500
// addresses blows past the URL length limit ("fetch failed"). One ordered
// pass is also cheaper than N lookups once the table is full.
const SELECT_COLS = ['id', 'email', 'sector', 'groups', 'email_subscribed', 'sms_subscribed', 'is_member_flag']
  .concat(MERGE_FIELDS)
  .join(', ')

const stored = new Map()
const PAGE = 1000
for (let from = 0; ; from += PAGE) {
  const { data, error } = await db
    .from('contacts')
    .select(SELECT_COLS)
    .order('created_at', { ascending: true })
    .range(from, from + PAGE - 1)
  if (error) {
    console.error(`✗ Lookup failed: ${error.message}`)
    process.exit(1)
  }
  for (const row of data ?? []) stored.set(row.email.toLowerCase(), row)
  if (!data || data.length < PAGE) break
  process.stdout.write(`\r  read ${stored.size} existing contacts`)
}
if (stored.size) console.log(`\r  read ${stored.size} existing contacts`)

const toInsert = []
const toUpdate = []
let unchanged = 0

for (const r of incoming) {
  const ex = stored.get(r.email)
  if (!ex) {
    toInsert.push(r)
    continue
  }
  const patch = {}
  for (const f of MERGE_FIELDS) {
    const next = r[f]
    if (!has(next)) continue // blank never overwrites
    if (ex[f] === next) continue
    patch[f] = next
  }
  if (r.sector !== UNSEGMENTED && r.sector !== ex.sector) patch.sector = r.sector
  if ((r.groups ?? []).length) {
    const merged = [...new Set([...(ex.groups ?? []), ...r.groups])]
    if (merged.length !== (ex.groups ?? []).length) patch.groups = merged
  }
  if (ex.email_subscribed && !r.email_subscribed) {
    patch.email_subscribed = false
    patch.unsubscribed_at = new Date().toISOString()
  }
  if (ex.sms_subscribed && !r.sms_subscribed) patch.sms_subscribed = false
  if (r.is_member_flag && !ex.is_member_flag) patch.is_member_flag = true

  if (Object.keys(patch).length === 0) unchanged++
  else toUpdate.push({ id: ex.id, patch })
}

console.log(
  `\nPlan:  ${toInsert.length} new   ${toUpdate.length} updated   ${unchanged} unchanged`,
)

if (!commit) {
  console.log('\nDry run — nothing written. Re-run with --commit to apply.')
  process.exit(0)
}

// ── write ────────────────────────────────────────────────────
let inserted = 0
for (let i = 0; i < toInsert.length; i += CHUNK) {
  const slice = toInsert.slice(i, i + CHUNK)
  const { error } = await db.from('contacts').insert(
    slice.map((r) => ({
      ...r,
      unsubscribed_at: r.email_subscribed ? null : new Date().toISOString(),
    })),
  )
  if (error) {
    console.error(`✗ Insert chunk @${i} failed: ${error.message}`)
    process.exit(1)
  }
  inserted += slice.length
  process.stdout.write(`\r  inserted ${inserted}/${toInsert.length}`)
}
if (toInsert.length) process.stdout.write('\n')

let updated = 0
for (const { id, patch } of toUpdate) {
  const { error } = await db.from('contacts').update(patch).eq('id', id)
  if (error) console.error(`✗ Update ${id}: ${error.message}`)
  else updated++
  if (updated % 200 === 0) process.stdout.write(`\r  updated ${updated}/${toUpdate.length}`)
}
if (toUpdate.length) process.stdout.write(`\r  updated ${updated}/${toUpdate.length}\n`)

await db.from('contact_imports').insert({
  filename: files.map((f) => path.basename(f)).join(', '),
  total_rows: totalRead,
  inserted_count: inserted,
  updated_count: updated,
  skipped_count: unchanged + totalInvalid,
  error_rows: [],
})

console.log(`\n✓ Done. ${inserted} inserted, ${updated} updated, ${unchanged} unchanged.`)
