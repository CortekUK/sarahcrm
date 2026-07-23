// Applies the Time Tracking migration via the Supabase Management API.
// Idempotent — safe to run twice. Same pattern as
// apply-accountability-migration.mjs.

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

const file = 'supabase/migrations/20260724_time_tracking.sql'
const body = fs.readFileSync(path.join(root, file), 'utf8')

await runQuery('time-tracking migration body', body)

// ── Verify ───────────────────────────────────────────────────
await runQuery(
  'verify: tables present',
  "select table_name from information_schema.tables where table_schema='public' and table_name in ('time_entries','event_profitability','staff_rates') order by table_name;",
)
await runQuery(
  'verify: accountability_tasks.event_id column',
  "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='accountability_tasks' and column_name='event_id';",
)
await runQuery(
  'verify: partial unique index for running timer',
  "select indexname, indexdef from pg_indexes where schemaname='public' and indexname='uniq_running_timer_per_staff';",
)
await runQuery(
  'verify: RLS policies',
  "select tablename, policyname, cmd from pg_policies where schemaname='public' and tablename in ('time_entries','event_profitability','staff_rates') order by tablename, policyname;",
)
await runQuery(
  'verify: rls enabled',
  "select relname, relrowsecurity from pg_class where relname in ('time_entries','event_profitability','staff_rates') order by relname;",
)

console.log('\nAll time-tracking migration steps applied.')
