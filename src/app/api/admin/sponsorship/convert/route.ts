// POST /api/admin/sponsorship/convert
//
// The bridge from the INTELLIGENCE layer to the existing sponsorship spine.
// Turns a ranked sponsor_prospect into a real `sponsorships` row on its event,
// so it appears in the event's Sponsors panel and flows into the existing
// proposal → invite → ROI → sponsor-portal machinery. Idempotent: if the
// prospect was already converted, it returns the existing sponsorship.
//
//   body: { prospect_id, decision_maker_id?, package_name?, amount_pence? }
//
// Admin only. Never sends anything.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ConvertBody {
  prospect_id?: string
  decision_maker_id?: string
  package_name?: string
  amount_pence?: number
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    let body: ConvertBody
    try {
      body = (await req.json()) as ConvertBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.prospect_id) {
      return Response.json({ error: 'prospect_id is required' }, { status: 400 })
    }

    const admin = getAdmin()

    // Load the prospect.
    const { data: prospect, error: pErr } = await admin
      .from('sponsor_prospects')
      .select(
        'id, event_id, company_name, ai_rationale, converted_sponsorship_id, status',
      )
      .eq('id', body.prospect_id)
      .maybeSingle()
    if (pErr || !prospect) return Response.json({ error: 'Prospect not found' }, { status: 404 })

    // Idempotent: already converted → return the existing sponsorship.
    if (prospect.converted_sponsorship_id) {
      return Response.json({
        ok: true,
        already: true,
        sponsorship_id: prospect.converted_sponsorship_id,
      })
    }

    // Resolve the sponsor contact from a chosen / primary decision-maker.
    let sponsorName: string | null = null
    let sponsorEmail: string | null = null
    const dmQuery = admin
      .from('sponsor_decision_makers')
      .select('id, first_name, last_name, email, is_primary')
      .eq('prospect_id', prospect.id)
    const { data: dms } = body.decision_maker_id
      ? await dmQuery.eq('id', body.decision_maker_id)
      : await dmQuery.order('is_primary', { ascending: false }).limit(1)
    const dm = (dms ?? [])[0] as
      | { first_name?: string; last_name?: string; email?: string }
      | undefined
    if (dm) {
      sponsorName = `${dm.first_name ?? ''} ${dm.last_name ?? ''}`.trim() || null
      sponsorEmail = dm.email ?? null
    }

    // Create the real sponsorship row (event's sponsor list).
    const { data: sponsorship, error: insErr } = await admin
      .from('sponsorships')
      .insert({
        event_id: prospect.event_id,
        sponsor_company: prospect.company_name,
        sponsor_name: sponsorName,
        sponsor_email: sponsorEmail,
        package_name: body.package_name?.trim() || 'Event sponsor',
        amount_pence: typeof body.amount_pence === 'number' ? body.amount_pence : 0,
        brand_alignment: prospect.ai_rationale ?? null,
        status: 'proposed',
      })
      .select('id')
      .single()
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 })

    // Link the prospect + mark it won.
    await admin
      .from('sponsor_prospects')
      .update({
        converted_sponsorship_id: sponsorship.id,
        status: 'won',
        updated_at: new Date().toISOString(),
      })
      .eq('id', prospect.id)

    return Response.json({ ok: true, sponsorship_id: sponsorship.id })
  } catch (e) {
    console.error('[sponsorship/convert] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
