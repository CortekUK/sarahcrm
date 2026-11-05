// POST /api/check-member-email
//
// Lookup: does an account already exist for this email? Used by the
// public /membership-application form to block someone from applying
// twice — instead they're nudged to /login.
//
// Body: { email: string }
// Returns: { exists: boolean, isMember: boolean }
//
// Public — no auth required. We deliberately use service role server-
// side so anon clients don't need direct read access to `profiles`
// (which would otherwise need an RLS policy exposing email addresses).
// We also rate-limit the response shape so an attacker can only learn
// "yes/no on this email" — same surface as the public login flow
// already exposes via auth.

import { rateLimitsOff } from '@/lib/public-intake/rate-limit'
import { NextRequest } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  email?: string
}

// Best-effort per-IP throttle (per server instance) to slow down bulk
// enumeration of the member list. The public form calls this once per
// applicant, so the limit is generous. Over the limit we answer 429 with the
// same "unknown" shape, which the form treats as "let them proceed".
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 20
const hits = new Map<string, { count: number; resetAt: number }>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k)
  }
  const h = hits.get(ip)
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  h.count += 1
  return h.count > MAX_PER_WINDOW
}

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  if (!rateLimitsOff() && rateLimited(ip)) {
    return Response.json({ exists: false, isMember: false }, { status: 429 })
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ exists: false, isMember: false })
  }

  const admin = getAdminDb()

  // Profile match → they have an account.
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role')
    .ilike('email', email.replace(/[%_\\]/g, '\\$&'))
    .limit(1)
    .maybeSingle()

  if (!profile) {
    return Response.json({ exists: false, isMember: false })
  }

  // Member match → they have an active membership row attached.
  const { data: member } = await admin
    .from('members')
    .select('id')
    .eq('profile_id', profile.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  return Response.json({
    exists: true,
    isMember: Boolean(member),
  })
}
