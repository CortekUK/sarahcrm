// Applies the Team Accountability foundation migration via the Supabase
// Management API. Idempotent — safe to run twice.
//
// The two `alter type ... add value` statements are sent as their OWN query
// calls first (each autocommits), so the enum values are committed before the
// rest of the migration runs — avoiding any "new enum value used in same
// transaction" hazard.

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
  console.log(`  ✓ ok — ${text.slice(0, 200)}`)
  return text
}

const file = 'supabase/migrations/20260723_accountability_foundation.sql'
const full = fs.readFileSync(path.join(root, file), 'utf8')

// 1. Enum additions first, each on its own (autocommitted) call.
await runQuery(
  "enum: add 'team_member'",
  "alter type public.user_role add value if not exists 'team_member';",
)
await runQuery(
  "enum: add 'freelancer'",
  "alter type public.user_role add value if not exists 'freelancer';",
)

// 2. The rest of the migration — strip the two enum ALTER lines (already run).
const body = full
  .split('\n')
  .filter((l) => !/^alter type public\.user_role add value/i.test(l.trim()))
  .join('\n')

await runQuery('migration body', body)

// 3. Verify.
await runQuery(
  'verify: enum values',
  "select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'user_role' order by e.enumsortorder;",
)
await runQuery(
  'verify: tables present',
  "select table_name from information_schema.tables where table_schema='public' and table_name like 'accountability_%' order by table_name;",
)
await runQuery(
  'verify: bucket present',
  "select id, public from storage.buckets where id = 'accountability-files';",
)

console.log('\nAll accountability migration steps applied.')
