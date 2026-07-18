// GET /api/admin/xero/connect
//
// Starts the Xero OAuth2 Authorization Code flow. Admin-only. We mint a random
// `state`, store it in an httpOnly cookie for CSRF protection, then redirect the
// admin's browser to Xero's consent screen. Xero returns them to
// /api/xero/callback, which verifies the state against this cookie.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAuthorizeUrl } from '@/lib/xero/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') return { error: 'Admin only.', status: 403 as const }
  return { admin: profile }
}

export async function GET(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) {
    return NextResponse.redirect(new URL('/dashboard/settings?xero=forbidden', req.url))
  }

  let authorizeUrl: string
  const state = crypto.randomUUID()
  try {
    authorizeUrl = buildAuthorizeUrl(state)
  } catch {
    return NextResponse.redirect(
      new URL('/dashboard/settings?xero=error&reason=config', req.url),
    )
  }

  const res = NextResponse.redirect(authorizeUrl)
  res.cookies.set('xero_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return res
}
