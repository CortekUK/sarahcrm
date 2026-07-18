// POST /api/admin/xero/sync-spend
//
// Admin-only. Pages through all Xero ACCREC (sales) invoices once, sums each
// member's actually-paid amount (matched via members.xero_contact_id), and
// stores it on `members.xero_spend_pence` — historic spend that may predate the
// CRM. Surfaced in Finance as a "Xero spend" column.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { pullMemberSpend } from '@/lib/xero/spend'
import { XeroNotConnectedError } from '@/lib/xero/client'

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

  try {
    const counts = await pullMemberSpend(getAdminDb())
    return NextResponse.json({ ok: true, ...counts })
  } catch (err) {
    if (err instanceof XeroNotConnectedError) {
      return NextResponse.json({ ok: false, error: 'Xero is not connected.' }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Sync failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
