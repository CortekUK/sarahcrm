// Applies the Finance Tasks (Accountant Auto-Escalation) migration via the
// Supabase Management API. Idempotent — safe to run twice. Same pattern as
// apply-daily-handover-migration.mjs.

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

const file = 'supabase/migrations/20260727_finance_tasks.sql'
const body = fs.readFileSync(path.join(root, file), 'utf8')

await runQuery('finance-tasks migration body', body)

// ── Verify ───────────────────────────────────────────────────
await runQuery(
  'verify: tables present',
  "select table_name from information_schema.tables where table_schema='public' and table_name in ('finance_tasks','finance_task_occurrences') order by table_name;",
)
await runQuery(
  'verify: unique occurrence index',
  "select indexname, indexdef from pg_indexes where schemaname='public' and indexname='uniq_finance_occurrence_task_period';",
)
await runQuery(
  'verify: status/due index',
  "select indexname from pg_indexes where schemaname='public' and indexname='idx_finance_occurrences_status_due';",
)
await runQuery(
  'verify: RLS policies (admin-only)',
  "select tablename, policyname, cmd from pg_policies where schemaname='public' and tablename in ('finance_tasks','finance_task_occurrences') order by tablename, policyname;",
)
await runQuery(
  'verify: rls enabled',
  "select relname, relrowsecurity from pg_class where relname in ('finance_tasks','finance_task_occurrences') order by relname;",
)
await runQuery(
  'verify: cadence + due_day checks',
  "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.finance_tasks'::regclass and contype='c' order by conname;",
)

console.log('\nAll finance-tasks migration steps applied.')
