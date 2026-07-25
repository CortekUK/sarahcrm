// /api/admin/sponsorship/prospects — read + status control for sponsor prospects.
//
//   GET  ?event_id=…   → the event's prospects, warm-first then match_score desc.
//   PATCH { id, status } → move a single prospect through its human pipeline.
//
// Read/update only — no enrichment, no outreach, nothing is ever sent.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = [
  'suggested',
  'shortlisted',
  'approved',
  'contacted',
  'responded',
  'won',
  'lost',
  'dismissed',
] as const

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    const eventId = req.nextUrl.searchParams.get('event_id')
    if (!eventId) return Response.json({ error: 'event_id is required' }, { status: 400 })

    const admin = getAdmin()
    // Warm first, then highest match_score (nulls last), then company name.
    const { data, error } = await admin
      .from('sponsor_prospects')
      .select('*')
      .eq('event_id', eventId)
      .order('temperature', { ascending: true }) // 'cold' < 'warm' → put warm first below
      .order('match_score', { ascending: false, nullsFirst: false })
      .order('company_name', { ascending: true })
    if (error) return Response.json({ error: error.message }, { status: 500 })

    // 'warm' sorts after 'cold' alphabetically, so enforce warm-first here.
    const prospects = (data ?? []).slice().sort((a, b) => {
      const aw = a.temperature === 'warm' ? 1 : 0
      const bw = b.temperature === 'warm' ? 1 : 0
      if (aw !== bw) return bw - aw
      const as = (a.match_score as number | null) ?? -1
      const bs = (b.match_score as number | null) ?? -1
      if (as !== bs) return bs - as
      return String(a.company_name ?? '').localeCompare(String(b.company_name ?? ''))
    })

    return Response.json({ prospects })
  } catch (e) {
    console.error('[sponsorship/prospects] GET unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    let body: { id?: string; status?: string }
    try {
      body = (await req.json()) as { id?: string; status?: string }
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })
    if (!body.status || !(ALLOWED_STATUSES as readonly string[]).includes(body.status)) {
      return Response.json(
        { error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` },
        { status: 400 },
      )
    }

    const admin = getAdmin()
    const { data, error } = await admin
      .from('sponsor_prospects')
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .select('*')
      .maybeSingle()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    if (!data) return Response.json({ error: 'Prospect not found' }, { status: 404 })

    return Response.json({ prospect: data })
  } catch (e) {
    console.error('[sponsorship/prospects] PATCH unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
