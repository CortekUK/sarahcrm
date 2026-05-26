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

import { NextRequest } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  email?: string
}

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
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
    .ilike('email', email)
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
    .maybeSingle()

  return Response.json({
    exists: true,
    isMember: Boolean(member),
  })
}
