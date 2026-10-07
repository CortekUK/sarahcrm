// /api/admin/sponsorship/decision-makers — find + list a prospect's contacts.
//
//   POST { prospect_id, role_filters? } → discover decision makers at the
//     prospect's company (via the enrichment wrapper), replace the persisted
//     set with the fresh results, and return them. If the prospect has no
//     domain, or the capability is unavailable / needs an upgrade / errors,
//     this returns HTTP 200 with a `status` + `message` the UI can show — a
//     normal degrade, never a hard failure.
//   GET ?prospect_id=… → the persisted decision makers for that prospect.
//
// This route discovers + persists contact records only. It NEVER emails anyone.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { searchDecisionMakers } from '@/lib/enrichment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    let body: { prospect_id?: string; role_filters?: string[] }
    try {
      body = (await req.json()) as { prospect_id?: string; role_filters?: string[] }
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.prospect_id) {
      return Response.json({ error: 'prospect_id is required' }, { status: 400 })
    }
    const roleFilters = Array.isArray(body.role_filters)
      ? body.role_filters.filter((r): r is string => typeof r === 'string')
      : undefined

    const admin = getAdmin()
    const { data: prospect, error: pErr } = await admin
      .from('sponsor_prospects')
      .select('id, company_domain')
      .eq('id', body.prospect_id)
      .maybeSingle()
    if (pErr || !prospect) return Response.json({ error: 'Prospect not found' }, { status: 404 })

    const domain = (prospect.company_domain as string | null) ?? null
    if (!domain) {
      return Response.json({
        status: 'unavailable',
        message: 'No company domain on this prospect',
        decision_makers: [],
      })
    }

    const result = await searchDecisionMakers(domain, roleFilters)

    if (result.status !== 'ok') {
      // upgrade_required | unavailable | error — a normal degrade (HTTP 200).
      return Response.json({
        status: result.status,
        message:
          result.message ??
          (result.status === 'upgrade_required'
            ? 'Decision-maker discovery requires a plan upgrade.'
            : result.status === 'unavailable'
              ? 'Decision-maker discovery is not available.'
              : 'Decision-maker discovery failed.'),
        decision_makers: [],
      })
    }

    // Fresh set: clear existing, then insert the newly discovered people.
    await admin.from('sponsor_decision_makers').delete().eq('prospect_id', prospect.id as string)

    const rows = result.items.map((p, i) => ({
      prospect_id: prospect.id as string,
      first_name: p.firstName,
      last_name: p.lastName,
      title: p.title,
      seniority: p.seniority,
      email: p.email,
      linkedin_url: p.linkedinUrl,
      // Provider name is deliberately not surfaced by the wrapper.
      vendor: null,
      vendor_raw: p.raw ?? null,
      is_primary: i === 0,
    }))

    let inserted: Record<string, unknown>[] = []
    if (rows.length > 0) {
      const { data, error: insErr } = await admin
        .from('sponsor_decision_makers')
        .insert(rows)
        .select('*')
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 })
      inserted = (data ?? []) as Record<string, unknown>[]
    }

    return Response.json({ status: 'ok', decision_makers: inserted })
  } catch (e) {
    console.error('[sponsorship/decision-makers] POST unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    const prospectId = req.nextUrl.searchParams.get('prospect_id')
    if (!prospectId) return Response.json({ error: 'prospect_id is required' }, { status: 400 })

    const admin = getAdmin()
    const { data, error } = await admin
      .from('sponsor_decision_makers')
      .select('*')
      .eq('prospect_id', prospectId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) return Response.json({ error: error.message }, { status: 500 })

    return Response.json({ decision_makers: data ?? [] })
  } catch (e) {
    console.error('[sponsorship/decision-makers] GET unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
