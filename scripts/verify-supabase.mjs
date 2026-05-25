import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const TOKEN = env.SUPABASE_ACCESS_TOKEN
const REF = 'owjnsljovmaaxgxpxxtw'

async function sql(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
  return res.json()
}

console.log('— membership_applications columns —')
const cols = await sql(
  `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='membership_applications' ORDER BY ordinal_position;`,
)
console.log(cols.map((r) => r.column_name).join(', '))

console.log('\n— storage.buckets —')
const buckets = await sql(`SELECT id, public FROM storage.buckets ORDER BY id;`)
console.log(buckets)

console.log('\n— storage policies on objects —')
const policies = await sql(
  `SELECT policyname, cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname;`,
)
console.log(policies)
