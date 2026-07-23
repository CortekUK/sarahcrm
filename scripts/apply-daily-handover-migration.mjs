// Applies the Daily Handover migration via the Supabase Management API.
// Idempotent — safe to run twice. Same pattern as
// apply-scorecards-migration.mjs.

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
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

const TOKEN = env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = 'owjnsljovmaaxgxpxxtw'
if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}

async function runQuery(label, sql) {
  console.log(`\n→ ${label}`)
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  )
  const text = await res.text()
  if (!res.ok) {
    console.error(`  ✗ ${res.status} ${res.statusText}`)
    console.error(`  ${text}`)
    process.exit(1)
  }
  console.log(`  ✓ ok — ${text.slice(0, 300)}`)
  return text
}

const file = 'supabase/migrations/20260726_daily_handover.sql'
const body = fs.readFileSync(path.join(root, file), 'utf8')

await runQuery('daily-handover migration body', body)

// ── Verify ───────────────────────────────────────────────────
await runQuery(
  'verify: tables present',
  "select table_name from information_schema.tables where table_schema='public' and table_name in ('daily_handovers','daily_reports') order by table_name;",
)
await runQuery(
  'verify: unique handover index',
  "select indexname, indexdef from pg_indexes where schemaname='public' and indexname='uniq_daily_handover_staff_date';",
)
await runQuery(
  'verify: handover_date index',
  "select indexname from pg_indexes where schemaname='public' and indexname='idx_daily_handovers_date';",
)
await runQuery(
  'verify: unique report index',
  "select indexname, indexdef from pg_indexes where schemaname='public' and indexname='uniq_daily_report_date';",
)
await runQuery(
  'verify: RLS policies',
  "select tablename, policyname, cmd from pg_policies where schemaname='public' and tablename in ('daily_handovers','daily_reports') order by tablename, policyname;",
)
await runQuery(
  'verify: rls enabled',
  "select relname, relrowsecurity from pg_class where relname in ('daily_handovers','daily_reports') order by relname;",
)

console.log('\nAll daily-handover migration steps applied.')
