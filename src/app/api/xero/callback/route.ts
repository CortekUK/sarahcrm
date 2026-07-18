// GET /api/xero/callback
//
// Xero's OAuth2 redirect target. Xero sends the admin here with ?code & ?state
// (or ?error). We: (1) verify the state matches the httpOnly cookie set by
// /api/admin/xero/connect (CSRF), (2) require an admin session, (3) exchange the
// code for tokens, (4) look up the tenant, (5) persist tokens in app_settings.
// Token values are NEVER put in the redirect URL.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  exchangeCodeForTokens,
  getConnections,
  saveXeroTokens,
} from '@/lib/xero/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

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

function fail(req: Request, reason: string) {
  const res = NextResponse.redirect(
    new URL(`/dashboard/settings?xero=error&reason=${encodeURIComponent(reason)}`, req.url),
  )
  res.cookies.delete('xero_oauth_state')
  return res
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  if (oauthError) return fail(req, 'denied')

  // CSRF: state must match the cookie we set at connect time.
  const cookieState = req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('xero_oauth_state='))
    ?.slice('xero_oauth_state='.length)

  if (!state || !cookieState || state !== cookieState) {
    return fail(req, 'state')
  }
  if (!code) return fail(req, 'missing_code')

  const auth = await requireAdmin()
  if ('error' in auth) return fail(req, 'forbidden')

  try {
    const tokens = await exchangeCodeForTokens(code)
    const connections = await getConnections(tokens.access_token)
    const tenant = connections[0]
    if (!tenant) return fail(req, 'no_tenant')

    await saveXeroTokens(getAdminDb(), {
      tokens,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
    })
  } catch {
    return fail(req, 'exchange')
  }

  const res = NextResponse.redirect(new URL('/dashboard/settings?xero=connected', req.url))
  res.cookies.delete('xero_oauth_state')
  return res
}
