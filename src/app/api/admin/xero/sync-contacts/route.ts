// POST /api/admin/xero/sync-contacts
//
// Admin-only. Find-or-creates a Xero Contact for each (non-deleted) member and
// stores the resulting Xero ContactID on `members.xero_contact_id`. Optional
// `{ force: true }` body re-syncs members that already have a ContactID.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { syncAllMembers } from '@/lib/xero/contacts'
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

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let force = false
  try {
    const body = (await req.json()) as { force?: boolean } | null
    force = Boolean(body?.force)
  } catch {
    // no/invalid body → default force=false
  }

  try {
    const counts = await syncAllMembers(getAdminDb(), { force })
    return NextResponse.json({ ok: true, ...counts })
  } catch (err) {
    if (err instanceof XeroNotConnectedError) {
      return NextResponse.json({ ok: false, error: 'Xero is not connected.' }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Sync failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
