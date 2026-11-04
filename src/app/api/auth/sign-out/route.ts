// POST /api/auth/sign-out — ends the session and clears the auth cookies on
// the server, so the redirect that follows can never land with a stale
// session (the middleware would bounce a still-signed-in visitor from
// /login back into their portal).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut().catch(() => {})
  return NextResponse.json({ ok: true })
}
