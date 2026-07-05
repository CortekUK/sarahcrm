// POST /api/admin/members/recompute-scores
//
// Recomputes the relationship scores (Feature #4) and writes them into the
// members table.
//   • ?member_id=<id>  → recompute + update that one member
//   • (no param)       → recompute + update every active member
//
// Admin only. Reads and writes go through a service-role client so the
// aggregation isn't blocked by member-facing RLS.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { computeMemberScores } from '@/lib/members/scoring'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdmin() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  try {
    // ── Admin gate ────────────────────────────────────────────────
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const adminDb = getAdmin()
    const memberId = req.nextUrl.searchParams.get('member_id')

    // ── Single member ─────────────────────────────────────────────
    if (memberId) {
      const scores = await computeMemberScores(memberId, adminDb)
      const { error } = await adminDb.from('members').update(scores).eq('id', memberId)
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ updated: 1, scores })
    }

    // ── Bulk: every active, non-deleted member ────────────────────
    const { data: members, error: listErr } = await adminDb
      .from('members')
      .select('id')
      .eq('membership_status', 'active')
      .is('deleted_at', null)
    if (listErr) return Response.json({ error: listErr.message }, { status: 500 })

    let updated = 0
    for (const m of members ?? []) {
      try {
        const scores = await computeMemberScores(m.id, adminDb)
        const { error } = await adminDb.from('members').update(scores).eq('id', m.id)
        if (!error) updated += 1
      } catch (e) {
        console.error(`[recompute-scores] member ${m.id} failed:`, e)
      }
    }

    return Response.json({ updated })
  } catch (e) {
    console.error('[recompute-scores] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
