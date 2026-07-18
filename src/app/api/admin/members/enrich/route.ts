// POST /api/admin/members/enrich
//
// Admin-only manual (re-)enrichment of a single member. Runs the best-effort
// enrichMember path behind the provider interface (Apollo today, swappable
// later). Autofills GAPS ONLY on the member's existing company fields.
//
// Body: { memberId: string }
// Returns: { ok: true, status } or { error }

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { enrichMember } from '@/lib/enrichment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(request: Request) {
  // ── Admin gate ──────────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return Response.json({ error: 'Admin only.' }, { status: 403 })
  }

  // ── Parse + validate ────────────────────────────────────────────
  let payload: { memberId?: string }
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const memberId = payload.memberId?.trim()
  if (!memberId) {
    return Response.json({ error: 'memberId is required.' }, { status: 400 })
  }

  // ── Enrich (best-effort — never throws) ─────────────────────────
  try {
    const { status } = await enrichMember(getAdminDb(), memberId)
    return Response.json({ ok: true, status })
  } catch (e) {
    console.error('[admin/members/enrich] failed:', e)
    return Response.json({ error: 'Enrichment failed.' }, { status: 500 })
  }
}
