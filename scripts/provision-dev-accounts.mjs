// Provision the two dev accounts named in .env.local
// (DEV_ADMIN_*, DEV_MEMBER_*) in the live Supabase project.
//
// What this script does, per account:
//   1. Try to create the auth user with email_confirm=true.
//   2. If the email already exists, reset the password instead (so a
//      changed/forgotten password in .env.local is automatically
//      synced to what's actually stored in Supabase).
//   3. Ensure the profiles row exists with role=admin / role=member.
//   4. For the member account: ensure a members row exists at tier_2,
//      active status, so portal pages render correctly.
//
// Idempotent — safe to run repeatedly. Uses direct REST calls (not
// the supabase-js client) so it works on Node 20 without a websocket
// polyfill.
//
// Usage:
//   node scripts/provision-dev-accounts.mjs

import fs from 'node:fs'
import path from 'node:path'

// ─── env loader ─────────────────────────────────────────────────────
const root = path.resolve(import.meta.dirname, '..')
const envPath = path.join(root, '.env.local')
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

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_EMAIL = env.DEV_ADMIN_EMAIL
const ADMIN_PASSWORD = env.DEV_ADMIN_PASSWORD
const MEMBER_EMAIL = env.DEV_MEMBER_EMAIL
const MEMBER_PASSWORD = env.DEV_MEMBER_PASSWORD

for (const [k, v] of [
  ['NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY],
  ['DEV_ADMIN_EMAIL', ADMIN_EMAIL],
  ['DEV_ADMIN_PASSWORD', ADMIN_PASSWORD],
  ['DEV_MEMBER_EMAIL', MEMBER_EMAIL],
  ['DEV_MEMBER_PASSWORD', MEMBER_PASSWORD],
]) {
  if (!v) {
    console.error(`✗ Missing ${k} in .env.local`)
    process.exit(1)
  }
}

const AUTH = `${SUPABASE_URL}/auth/v1`
const REST = `${SUPABASE_URL}/rest/v1`
const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

// ─── helpers ────────────────────────────────────────────────────────

async function jsonOrThrow(res, label) {
  if (res.ok) {
    // 204 no-content is fine — return null
    if (res.status === 204) return null
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
  const body = await res.text()
  throw new Error(`${label} → ${res.status}: ${body.slice(0, 400)}`)
}

async function findUserByEmail(email) {
  // GET /auth/v1/admin/users supports ?email= as a filter on most
  // recent gotrue builds; fall back to paging if the project hasn't
  // got that.
  const direct = await fetch(
    `${AUTH}/admin/users?email=${encodeURIComponent(email)}`,
    { headers: HEADERS },
  )
  const data = await jsonOrThrow(direct, 'listUsers')
  const list = Array.isArray(data?.users) ? data.users : []
  const match = list.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  )
  if (match) return match

  // Fallback — page through the first 1000 users
  const page = await fetch(`${AUTH}/admin/users?per_page=1000`, { headers: HEADERS })
  const pageData = await jsonOrThrow(page, 'listUsers(page)')
  const pageList = Array.isArray(pageData?.users) ? pageData.users : []
  return pageList.find((u) => u.email?.toLowerCase() === email.toLowerCase())
}

async function provisionAuthUser(email, password, firstName, lastName) {
  const existing = await findUserByEmail(email)
  if (existing) {
    const res = await fetch(`${AUTH}/admin/users/${existing.id}`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      }),
    })
    await jsonOrThrow(res, `updateUser ${email}`)
    return { id: existing.id, created: false }
  }
  const res = await fetch(`${AUTH}/admin/users`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    }),
  })
  const created = await jsonOrThrow(res, `createUser ${email}`)
  return { id: created.id, created: true }
}

async function ensureProfile(userId, email, firstName, lastName, role) {
  // Upsert via PostgREST; the handle_new_user trigger may have already
  // inserted a minimal profile row — Prefer: resolution=merge-duplicates
  // merges instead of failing.
  const res = await fetch(`${REST}/profiles?on_conflict=id`, {
    method: 'POST',
    headers: {
      ...HEADERS,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      role,
    }),
  })
  await jsonOrThrow(res, `upsert profile ${email}`)
}

async function ensureMember(profileId) {
  // Check first — the members table doesn't have a unique constraint on
  // profile_id we can rely on for upsert, so do a manual look-then-insert.
  const lookup = await fetch(
    `${REST}/members?profile_id=eq.${profileId}&select=id&limit=1`,
    { headers: HEADERS },
  )
  const found = await jsonOrThrow(lookup, 'select member')
  if (Array.isArray(found) && found[0]) return found[0].id

  const today = new Date().toISOString().slice(0, 10)
  const res = await fetch(`${REST}/members`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify({
      profile_id: profileId,
      membership_tier: 'tier_2',
      membership_type: 'individual',
      membership_status: 'active',
      membership_start_date: today,
      monthly_intro_quota: 5,
    }),
  })
  const inserted = await jsonOrThrow(res, 'insert member')
  return inserted?.[0]?.id ?? '(unknown)'
}

// ─── run ────────────────────────────────────────────────────────────

async function main() {
  console.log(`Provisioning dev accounts against ${SUPABASE_URL}`)
  console.log()

  console.log(`→ Admin: ${ADMIN_EMAIL}`)
  const adminUser = await provisionAuthUser(
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    'Claude',
    'Admin',
  )
  console.log(`  ${adminUser.created ? 'created' : 'password reset'}, id=${adminUser.id}`)
  await ensureProfile(adminUser.id, ADMIN_EMAIL, 'Claude', 'Admin', 'admin')
  console.log('  profile upserted with role=admin')
  console.log()

  console.log(`→ Member: ${MEMBER_EMAIL}`)
  const memberUser = await provisionAuthUser(
    MEMBER_EMAIL,
    MEMBER_PASSWORD,
    'Claude',
    'Member',
  )
  console.log(`  ${memberUser.created ? 'created' : 'password reset'}, id=${memberUser.id}`)
  await ensureProfile(memberUser.id, MEMBER_EMAIL, 'Claude', 'Member', 'member')
  console.log('  profile upserted with role=member')
  const memberId = await ensureMember(memberUser.id)
  console.log(`  member row ready, id=${memberId} (tier_2 / active)`)
  console.log()

  console.log('✓ Done. Try logging in at /login.')
}

main().catch((err) => {
  console.error(`\n✗ Failed: ${err.message}`)
  process.exit(1)
})
