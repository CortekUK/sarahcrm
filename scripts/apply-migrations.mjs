// One-off: apply the membership-application migrations directly via
// the Supabase Management API. Reads SUPABASE_ACCESS_TOKEN from .env.local.

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
// Prefer .env.local, fall back to .env (the token lives in whichever exists).
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

const files = [
  'supabase/migrations/20260708_rewards_benefits.sql',
]

for (const file of files) {
  const sql = fs.readFileSync(path.join(root, file), 'utf8')
  console.log(`\n→ Applying ${file}`)
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
}

console.log('\nAll migrations applied.')
