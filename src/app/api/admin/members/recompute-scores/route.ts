// POST /api/admin/members/recompute-scores
//
// Recomputes the relationship scores (Feature #4) and writes them into the
// members table.
//   • ?member_id=<id>  → recompute + update that one member
//   • (no param)       → recompute + update every active member, in parallel
//                          batches. If the time budget runs out first the
//                          response has done:false + next_offset; call again
//                          with ?offset=<next_offset> to continue.
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
// The bulk pass reads several tables per member; give it the longest
// window Vercel allows on the plan and stop cleanly before it runs out.
export const maxDuration = 300

const CONCURRENCY = 8
// Leave headroom under maxDuration to answer before the platform cuts us off.
const TIME_BUDGET_MS = 240_000

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
      .order('id', { ascending: true })
    if (listErr) return Response.json({ error: listErr.message }, { status: 500 })

    const all = members ?? []
    const offsetRaw = Number(req.nextUrl.searchParams.get('offset') ?? 0)
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0
    const startedAt = Date.now()
    let updated = 0
    let i = offset
    while (i < all.length && Date.now() - startedAt < TIME_BUDGET_MS) {
      const batch = all.slice(i, i + CONCURRENCY)
      const done = await Promise.all(
        batch.map(async (m) => {
          try {
            const scores = await computeMemberScores(m.id, adminDb)
            const { error } = await adminDb.from('members').update(scores).eq('id', m.id)
            return !error
          } catch (e) {
            console.error(`[recompute-scores] member ${m.id} failed:`, e)
            return false
          }
        }),
      )
      updated += done.filter(Boolean).length
      i += batch.length
    }

    const finished = i >= all.length
    return Response.json({
      updated,
      total: all.length,
      done: finished,
      ...(finished ? {} : { next_offset: i }),
    })
  } catch (e) {
    console.error('[recompute-scores] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
