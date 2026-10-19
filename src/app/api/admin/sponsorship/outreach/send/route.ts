// POST /api/admin/sponsorship/outreach/send — THE HUMAN GATE.
//
// Client requirement (Sarah, verbatim): "All sponsor emails must be reviewed
// before they are sent." Nothing sends without an explicit human approve →
// send. The HARD GUARD (status must be exactly 'approved') lives in
// dispatchOutreach() (src/lib/sponsorship/outreach/sequence.ts) — the single
// send path shared with the daily sequence runner — so a draft (or
// already-sent/failed/cancelled) row is rejected outright on both paths.
//
// Sending goes through the outreach SEAM (getSender) inside dispatchOutreach —
// never sendClubEmail directly. A sender error is surfaced as a 502 +
// status='failed'; it never crashes the route. On success the prospect is
// bumped to 'contacted' and the next step of the sequence gets its due date.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { dispatchOutreach } from '@/lib/sponsorship/outreach/sequence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SendBody {
  outreach_id?: string
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    let body: SendBody
    try {
      body = (await req.json()) as SendBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.outreach_id) {
      return Response.json({ error: 'outreach_id is required' }, { status: 400 })
    }

    const outcome = await dispatchOutreach(getAdmin(), body.outreach_id)
    if (!outcome.ok) {
      return Response.json({ error: outcome.error }, { status: outcome.httpStatus })
    }
    return Response.json({ ok: true, external_id: outcome.externalId })
  } catch (e) {
    console.error('[sponsorship/outreach/send] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
