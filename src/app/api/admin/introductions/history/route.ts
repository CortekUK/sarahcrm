// GET /api/admin/introductions/history?member_ids=a,b,c   (max 100)
//
// Per-member introduction history for the admin request rows and compose
// flow: { history: { [memberId]: { quota, thisMonth, total, pendingRequests,
// lastIntroAt } } }. Display-only — see src/lib/introductions/history.ts.

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/marketing/admin'
import { getServiceDb, UUID_RE } from '@/lib/directory/server'
import { getIntroHistory, MAX_HISTORY_IDS } from '@/lib/introductions/history'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const ids = (req.nextUrl.searchParams.get('member_ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s))
  if (ids.length > MAX_HISTORY_IDS) {
    return Response.json({ error: `At most ${MAX_HISTORY_IDS} member ids.` }, { status: 400 })
  }

  try {
    const history = await getIntroHistory(getServiceDb(), ids)
    return Response.json({ history })
  } catch (e) {
    console.error('[introductions/history] failed:', e)
    return Response.json({ error: 'Could not load introduction history.' }, { status: 500 })
  }
}
