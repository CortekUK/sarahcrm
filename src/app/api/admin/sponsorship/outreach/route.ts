// /api/admin/sponsorship/outreach — the outreach review QUEUE.
//
//   GET   ?event_id=&status=&sequence_id=  — list sponsor_outreach (joined with
//         the prospect company + decision-maker name, plus the prospect's
//         replied_at) for the review UI. ?sequence_id= returns every step of one
//         sequence (the editor's timeline), regardless of the other filters.
//   PATCH { id, subject?, body_html?, body_text?, to_email?, status?,
//           auto_send?, delay_days?, stop_sequence? }
//         — the human review edit:
//         • Body/subject/recipient edits are always allowed. Editing the
//           subject or body text re-renders body_html so what was reviewed is
//           what gets sent. Editing the subject/body of an APPROVED step
//           returns it to draft (approval, schedule and due date cleared) — it
//           must be re-approved ("All sponsor emails must be reviewed before
//           they are sent").
//         • status transitions allowed here:
//             draft|approved            → approved  (stamps approved_by/at;
//                                                     auto_send: true = "approve
//                                                     and schedule")
//             approved|draft|failed|cancelled → draft (clears approval + schedule)
//             draft|approved            → cancelled (stop this one step)
//         • auto_send alone schedules / unschedules an already-approved step.
//         • delay_days (days after the previous step is sent) can be changed
//           on a not-yet-sent step.
//         • due_at is recomputed (computeDueAt) on any status / schedule /
//           delay change: it exists only once the previous step was sent, or
//           for a scheduled first touch.
//         • stop_sequence: true cancels every not-yet-sent step of this row's
//           sequence.
//
// This route NEVER sends and CANNOT set status='sent'/'replied'/'bounced' —
// only dispatchOutreach() (manual send route + daily runner) sends, and only
// for an already-approved row. The approve step here is the human gate.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { computeDueAt, PENDING_STATUSES } from '@/lib/sponsorship/outreach/sequence'
import { renderOutreachHtml } from '@/lib/sponsorship/outreach/render'

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
    const sequenceId = searchParams.get('sequence_id')

    let query = admin
      .from('sponsor_outreach')
      .select(
        `*,
         sponsor_prospects ( id, company_name ),
         sponsor_decision_makers ( id, first_name, last_name, title, email )`,
      )

    if (sequenceId) {
      query = query.eq('sequence_id', sequenceId).order('step', { ascending: true })
    } else {
      query = query.order('created_at', { ascending: false })
      if (eventId) query = query.eq('event_id', eventId)
      if (status) query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) return Response.json({ error: error.message }, { status: 500 })

    // The prospect's replied_at (the "Replied" badge) — fetched separately so
    // the queue still loads if the sequences migration isn't applied yet.
    const rows = (data ?? []) as Record<string, unknown>[]
    const prospectIds = [...new Set(rows.map((r) => r.prospect_id as string).filter(Boolean))]
    const repliedAt = new Map<string, string>()
    if (prospectIds.length > 0) {
      const { data: replied, error: repliedErr } = await admin
        .from('sponsor_prospects')
        .select('id, replied_at')
        .in('id', prospectIds)
        .not('replied_at', 'is', null)
      if (!repliedErr) {
        for (const p of (replied ?? []) as { id: string; replied_at: string }[]) {
          repliedAt.set(p.id, p.replied_at)
        }
      }
    }

    // Flatten the embedded prospect / decision-maker into the shape the queue UI
    // reads (company_name + decision_maker_name), then drop the nested objects.
    const outreach = rows.map((row) => {
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
        prospect_replied_at: repliedAt.get(row.prospect_id as string) ?? null,
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
  auto_send?: boolean | null
  delay_days?: number | null
  stop_sequence?: boolean | null
}

const PENDING = PENDING_STATUSES as readonly string[]

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

    // Load the current row so transitions can be validated against it.
    // select('*') keeps this working before the sequences migration.
    const { data: current, error: loadErr } = await admin
      .from('sponsor_outreach')
      .select('*')
      .eq('id', body.id)
      .maybeSingle()
    if (loadErr || !current) return Response.json({ error: 'Outreach not found' }, { status: 404 })

    const nowIso = new Date().toISOString()

    // ── Stop the whole sequence (cancel every not-yet-sent step) ─────────
    if (body.stop_sequence === true) {
      let q = admin
        .from('sponsor_outreach')
        .update({ status: 'cancelled', updated_at: nowIso })
        .in('status', [...PENDING])
      q = current.sequence_id
        ? q.eq('sequence_id', current.sequence_id as string)
        : q.eq('prospect_id', current.prospect_id as string)
      const { error: stopErr } = await q
      if (stopErr) return Response.json({ error: stopErr.message }, { status: 500 })
      const { data: reloaded } = await admin
        .from('sponsor_outreach')
        .select('*')
        .eq('id', body.id)
        .maybeSingle()
      return Response.json({ outreach: reloaded })
    }

    const update: Record<string, unknown> = { updated_at: nowIso }
    const from = current.status as string

    // Content edits are always allowed.
    if (body.subject !== undefined) update.subject = body.subject
    if (body.body_html !== undefined) update.body_html = body.body_html
    if (body.body_text !== undefined) update.body_text = body.body_text
    if (body.to_email !== undefined) update.to_email = body.to_email

    // Keep body_html in step with an edited subject/body (unless the caller
    // sent its own HTML). Only when something actually changed, so a plain
    // approve doesn't rewrite the AI's original HTML.
    const subjectChanged = body.subject !== undefined && body.subject !== current.subject
    const textChanged = body.body_text !== undefined && body.body_text !== current.body_text
    if (body.body_html === undefined && (subjectChanged || textChanged)) {
      update.body_html = renderOutreachHtml(
        (update.subject as string | null | undefined) ?? (current.subject as string | null),
        (update.body_text as string | null | undefined) ?? (current.body_text as string | null),
      )
    }

    // Status transitions. Sending is done ONLY by dispatchOutreach, so 'sent'
    // (or replied/bounced, which only tracking sets) is rejected here.
    let resultingStatus = from
    if (body.status !== undefined && body.status !== null) {
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
        update.approved_at = nowIso
      } else if (to === 'draft') {
        if (!['approved', 'draft', 'failed', 'cancelled'].includes(from)) {
          return Response.json(
            { error: `Cannot move an outreach that is '${from}' back to draft.` },
            { status: 400 },
          )
        }
        update.status = 'draft'
        update.approved_by = null
        update.approved_at = null
        // Un-approving always unschedules. Only written when the column exists.
        if ('auto_send' in current) update.auto_send = false
      } else if (to === 'cancelled') {
        if (!PENDING.includes(from)) {
          return Response.json(
            { error: `Cannot cancel an outreach that is '${from}'.` },
            { status: 400 },
          )
        }
        update.status = 'cancelled'
      } else {
        return Response.json(
          {
            error: `Status '${to}' cannot be set here. Only approve, un-approve and cancel are allowed.`,
          },
          { status: 400 },
        )
      }
      resultingStatus = update.status as string
    }

    // Re-approval rule: an approved step whose subject/body was edited goes
    // back to draft, unscheduled, with no due date. Overrides any approve /
    // schedule in the same request — the edited copy must be approved again.
    const hasSequenceCols = 'due_at' in current
    const editedApproved = from === 'approved' && (subjectChanged || textChanged)
    if (editedApproved) {
      update.status = 'draft'
      update.approved_by = null
      update.approved_at = null
      if (hasSequenceCols) {
        update.auto_send = false
        update.due_at = null
      }
      resultingStatus = 'draft'
    }

    // Schedule / unschedule ("approve and schedule"). Only meaningful on an
    // approved step — the runner still re-checks status==='approved'.
    if (!editedApproved && body.auto_send !== undefined && body.auto_send !== null) {
      if (body.auto_send && resultingStatus !== 'approved') {
        return Response.json(
          { error: 'Approve this step before scheduling it.' },
          { status: 400 },
        )
      }
      if (resultingStatus !== 'draft') update.auto_send = Boolean(body.auto_send)
    }

    // Delay edit — only before the step has gone out.
    if (body.delay_days !== undefined && body.delay_days !== null) {
      const delay = Math.round(Number(body.delay_days))
      if (!Number.isFinite(delay) || delay < 0 || delay > 365) {
        return Response.json({ error: 'delay_days must be between 0 and 365.' }, { status: 400 })
      }
      if (!PENDING.includes(from)) {
        return Response.json(
          { error: `Cannot change the timing of an outreach that is '${from}'.` },
          { status: 400 },
        )
      }
      update.delay_days = delay
    }

    // Due date: recompute whenever status, schedule or delay changed (not for
    // a cancelled step, nor an edited-approved step, whose due date was just
    // cleared). computeDueAt gives a date only once the previous step has
    // been sent, or for a scheduled first touch; otherwise null (waiting /
    // nothing scheduled), so a draft first touch never shows a due date.
    const timingChanged =
      update.status !== undefined ||
      update.auto_send !== undefined ||
      update.delay_days !== undefined
    if (hasSequenceCols && timingChanged && !editedApproved && resultingStatus !== 'cancelled') {
      const scheduled =
        resultingStatus === 'approved' &&
        Boolean(update.auto_send !== undefined ? update.auto_send : current.auto_send)
      update.due_at = await computeDueAt(
        admin,
        {
          sequence_id: (current.sequence_id as string | null) ?? null,
          prospect_id: current.prospect_id as string,
          step: Number(current.step ?? 0),
        },
        Number(update.delay_days ?? current.delay_days ?? 0),
        scheduled,
      )
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
