// Applies the SOP Library migration (Module 7) via the Supabase Management
// API. Idempotent — safe to run twice. Same pattern as
// apply-finance-tasks-migration.mjs.

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
  console.log(`  ✓ ok — ${text.slice(0, 400)}`)
  return text
}

const file = 'supabase/migrations/20260728_sop_library.sql'
const body = fs.readFileSync(path.join(root, file), 'utf8')

await runQuery('sop-library migration body', body)

// ── Verify ───────────────────────────────────────────────────
await runQuery(
  'verify: table present',
  "select table_name from information_schema.tables where table_schema='public' and table_name='sops';",
)
await runQuery(
  'verify: indexes',
  "select indexname from pg_indexes where schemaname='public' and tablename='sops' order by indexname;",
)
await runQuery(
  'verify: status check constraint',
  "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.sops'::regclass and contype='c' order by conname;",
)
await runQuery(
  'verify: RLS policies',
  "select policyname, cmd, qual from pg_policies where schemaname='public' and tablename='sops' order by policyname;",
)
await runQuery(
  'verify: rls enabled',
  "select relname, relrowsecurity from pg_class where relname='sops';",
)

console.log('\nAll sop-library migration steps applied.')
