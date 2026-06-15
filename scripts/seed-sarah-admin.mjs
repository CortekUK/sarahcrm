// One-off: seed an extra admin account
//   email:    admin@sarahrestrick.com
//   password: admin@123
//
// Uses the SUPABASE_SERVICE_ROLE_KEY in .env.local. Idempotent — if the
// user already exists the password is reset to admin@123 instead of
// erroring. Run with:
//   node scripts/seed-sarah-admin.mjs

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const envPath = path.join(root, '.env.local')

const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const SUPABASE_URL = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const SERVICE_KEY = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const AUTH = `${SUPABASE_URL}/auth/v1`
const REST = `${SUPABASE_URL}/rest/v1`
const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

const EMAIL = 'admin@sarahrestrick.com'
const PASSWORD = 'admin@123'
const FIRST = 'Sarah'
const LAST = 'Admin'

async function jsonOrThrow(res, label) {
  if (res.ok) {
    if (res.status === 204) return null
    const t = await res.text()
    return t ? JSON.parse(t) : null
  }
  const body = await res.text()
  throw new Error(`${label} → ${res.status}: ${body.slice(0, 400)}`)
}

async function findUserByEmail(email) {
  const url = `${AUTH}/admin/users?email=${encodeURIComponent(email)}`
  const res = await fetch(url, { headers: HEADERS })
  const data = await jsonOrThrow(res, 'listUsers')
  const list = Array.isArray(data?.users) ? data.users : []
  return list.find((u) => u.email?.toLowerCase() === email.toLowerCase())
}

async function main() {
  console.log(`Provisioning ${EMAIL} against ${SUPABASE_URL}`)
  const existing = await findUserByEmail(EMAIL)
  let userId
  if (existing) {
    const res = await fetch(`${AUTH}/admin/users/${existing.id}`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { first_name: FIRST, last_name: LAST },
      }),
    })
    await jsonOrThrow(res, 'updateUser')
    userId = existing.id
    console.log(`  password reset, id=${userId}`)
  } else {
    const res = await fetch(`${AUTH}/admin/users`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { first_name: FIRST, last_name: LAST },
      }),
    })
    const created = await jsonOrThrow(res, 'createUser')
    userId = created.id
    console.log(`  created, id=${userId}`)
  }

  const res = await fetch(`${REST}/profiles?on_conflict=id`, {
    method: 'POST',
    headers: {
      ...HEADERS,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      id: userId,
      email: EMAIL,
      first_name: FIRST,
      last_name: LAST,
      role: 'admin',
    }),
  })
  await jsonOrThrow(res, 'upsert profile')
  console.log('  profile upserted with role=admin')
  console.log()
  console.log(`✓ Done. Sign in at /admin/login with ${EMAIL} / ${PASSWORD}`)
}

main().catch((err) => {
  console.error(`\n✗ Failed: ${err.message}`)
  process.exit(1)
})
