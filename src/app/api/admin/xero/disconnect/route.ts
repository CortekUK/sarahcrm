// POST /api/admin/xero/disconnect
//
// Admin-only. Best-effort revokes the Xero connection on Xero's side, then
// clears the stored tokens from app_settings so the CRM reports "Not connected".

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  clearXeroTokens,
  getValidAccessToken,
  loadXeroTokens,
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

export async function POST() {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = getAdminDb()

  // Best-effort remove the connection on Xero's side. Never fail on error.
  try {
    const stored = await loadXeroTokens(db)
    if (stored) {
      const { accessToken } = await getValidAccessToken(db)
      const connections = await fetch('https://api.xero.com/connections', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      })
      if (connections.ok) {
        const list = (await connections.json()) as Array<{ id: string; tenantId: string }>
        const match = list.find((c) => c.tenantId === stored.tenant_id) ?? list[0]
        if (match) {
          await fetch(`https://api.xero.com/connections/${match.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
          })
        }
      }
    }
  } catch {
    // ignore — local disconnect below is what matters
  }

  await clearXeroTokens(db)
  return NextResponse.json({ ok: true })
}
