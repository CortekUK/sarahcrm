// /api/admin/sponsorship/outreach — the outreach review QUEUE.
//
//   GET   ?event_id=&status=  — list sponsor_outreach (joined with the
//         prospect company + decision-maker name) for the review UI.
//   PATCH { id, subject?, body_html?, body_text?, to_email?, status? }
//         — the human review edit. Body/subject/recipient edits are always
//         allowed. The only status transitions here are draft⇄approved
//         (approve / un-approve); moving to 'approved' stamps approved_by +
//         approved_at, moving back to 'draft' clears them.
//
// This route NEVER sends and CANNOT set status='sent' — only send/route.ts
// sends, and only for an already-approved row. The approve step here is the
// human gate that unlocks sending.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    const admin = getAdmin()
    const { searchParams } = new URL(req.url)
    const eventId = searchParams.get('event_id')
    const status = searchParams.get('status')

    let query = admin
      .from('sponsor_outreach')
      .select(
        `*,
         sponsor_prospects ( id, company_name ),
         sponsor_decision_makers ( id, first_name, last_name, title, email )`,
      )
      .order('created_at', { ascending: false })

    if (eventId) query = query.eq('event_id', eventId)
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) return Response.json({ error: error.message }, { status: 500 })

    // Flatten the embedded prospect / decision-maker into the shape the queue UI
    // reads (company_name + decision_maker_name), then drop the nested objects.
    const outreach = ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const prospect = row.sponsor_prospects as { company_name?: string } | null
      const dm = row.sponsor_decision_makers as
        | { first_name?: string; last_name?: string }
        | null
      const dmName = dm
        ? `${dm.first_name ?? ''} ${dm.last_name ?? ''}`.trim() || null
        : null
      const { sponsor_prospects: _p, sponsor_decision_makers: _d, ...rest } = row
      return {
        ...rest,
        company_name: prospect?.company_name ?? null,
        decision_maker_name: dmName,
      }
    })

    return Response.json({ outreach })
  } catch (e) {
    console.error('[sponsorship/outreach GET] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}

interface PatchBody {
  id?: string
  subject?: string | null
  body_html?: string | null
  body_text?: string | null
  to_email?: string | null
  status?: string | null
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    let body: PatchBody
    try {
      body = (await req.json()) as PatchBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })

    const admin = getAdmin()

    // Load the current row so status transitions can be validated against it.
    const { data: current, error: loadErr } = await admin
      .from('sponsor_outreach')
      .select('id, status')
      .eq('id', body.id)
      .maybeSingle()
    if (loadErr || !current) return Response.json({ error: 'Outreach not found' }, { status: 404 })

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    // Content edits are always allowed.
    if (body.subject !== undefined) update.subject = body.subject
    if (body.body_html !== undefined) update.body_html = body.body_html
    if (body.body_text !== undefined) update.body_text = body.body_text
    if (body.to_email !== undefined) update.to_email = body.to_email

    // Status: only draft⇄approved is permitted here. Sending is done ONLY by
    // send/route.ts, so setting 'sent' (or any other status) is rejected.
    if (body.status !== undefined && body.status !== null) {
      const from = current.status as string
      const to = body.status
      if (to === 'approved') {
        if (from !== 'draft' && from !== 'approved') {
          return Response.json(
            { error: `Cannot approve an outreach that is '${from}'.` },
            { status: 400 },
          )
        }
        update.status = 'approved'
        update.approved_by = auth.profile.id
        update.approved_at = new Date().toISOString()
      } else if (to === 'draft') {
        if (from !== 'approved' && from !== 'draft') {
          return Response.json(
            { error: `Cannot move an outreach that is '${from}' back to draft.` },
            { status: 400 },
          )
        }
        update.status = 'draft'
        update.approved_by = null
        update.approved_at = null
      } else {
        return Response.json(
          { error: `Status '${to}' cannot be set here. Only approve/un-approve is allowed.` },
          { status: 400 },
        )
      }
    }

    const { data: updated, error: upErr } = await admin
      .from('sponsor_outreach')
      .update(update)
      .eq('id', body.id)
      .select('*')
      .maybeSingle()
    if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

    return Response.json({ outreach: updated })
  } catch (e) {
    console.error('[sponsorship/outreach PATCH] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
