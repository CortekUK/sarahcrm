// One-off: apply the contacts migration via the Supabase Management API.
// Reads SUPABASE_ACCESS_TOKEN from .env.local (falls back to .env).

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

const file = 'supabase/migrations/20260806_contacts.sql'
const sql = fs.readFileSync(path.join(root, file), 'utf8')
console.log(`\n→ Applying ${file}`)
const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  },
)
const body = await res.text()
if (!res.ok) {
  console.error(`✗ Failed (${res.status}): ${body}`)
  process.exit(1)
}
console.log(`✓ Applied. ${body.slice(0, 300)}`)
