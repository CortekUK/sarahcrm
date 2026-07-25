// POST /api/admin/sponsorship/outreach/send — THE HUMAN GATE.
//
// Client requirement (Sarah, verbatim): "All sponsor emails must be reviewed
// before they are sent." Nothing sends without an explicit human approve →
// send. This route HARD-GUARDS status==='approved' before it will send a single
// thing; a draft (or already-sent/failed) row is rejected outright.
//
// Sending goes through the outreach SEAM (getSender) — never sendClubEmail
// directly — so the 'instantly' channel drops in unchanged later. The
// InstantlySender throws by design; that throw is caught here and surfaced as a
// 502 + status='failed', it must never crash the route.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { getSender } from '@/lib/sponsorship/outreach'
import type { OutreachChannel } from '@/lib/sponsorship/outreach'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Prospect statuses that should advance to 'contacted' on a successful send.
// 'responded'/'won' (and anything further) are never downgraded.
const BUMPABLE_PROSPECT_STATUSES = new Set(['suggested', 'shortlisted', 'approved'])

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

    const admin = getAdmin()

    // ── Load the outreach row ────────────────────────────────────────────
    const { data: row, error: loadErr } = await admin
      .from('sponsor_outreach')
      .select(
        'id, prospect_id, status, sender, subject, body_html, body_text, to_email',
      )
      .eq('id', body.outreach_id)
      .maybeSingle()
    if (loadErr || !row) return Response.json({ error: 'Outreach not found' }, { status: 404 })

    // ── HARD GUARD: only an approved message may ever be sent ────────────
    if (row.status !== 'approved') {
      return Response.json({ error: 'Approve this outreach before sending.' }, { status: 400 })
    }

    // ── Recipient required ───────────────────────────────────────────────
    if (!row.to_email) {
      return Response.json(
        { error: 'No recipient email. Add one before sending.' },
        { status: 400 },
      )
    }

    // ── Send through the outreach seam (Resend today; Instantly later) ───
    const channel = (row.sender as OutreachChannel) ?? 'resend'
    let outcome: { ok: boolean; externalId?: string; error?: string }
    try {
      const sender = getSender(channel)
      outcome = await sender.send({
        id: row.id as string,
        to: row.to_email as string,
        subject: (row.subject as string) ?? '(no subject)',
        html: (row.body_html as string) ?? '',
        text: (row.body_text as string) ?? undefined,
        memberId: null,
      })
    } catch (e) {
      // InstantlySender throws by design — catch, mark failed, surface as 502.
      const message = e instanceof Error ? e.message : 'Send failed'
      console.error('[sponsorship/outreach/send] sender threw:', e)
      outcome = { ok: false, error: message }
    }

    if (!outcome.ok) {
      await admin
        .from('sponsor_outreach')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', row.id as string)
      return Response.json({ error: outcome.error ?? 'Send failed' }, { status: 502 })
    }

    // ── Success — mark sent + record the external id ─────────────────────
    const nowIso = new Date().toISOString()
    await admin
      .from('sponsor_outreach')
      .update({
        status: 'sent',
        sent_at: nowIso,
        external_id: outcome.externalId ?? null,
        updated_at: nowIso,
      })
      .eq('id', row.id as string)

    // Bump the prospect to 'contacted' only from an earlier stage — never
    // downgrade a prospect that has already responded / been won.
    if (row.prospect_id) {
      const { data: prospect } = await admin
        .from('sponsor_prospects')
        .select('id, status')
        .eq('id', row.prospect_id as string)
        .maybeSingle()
      if (prospect && BUMPABLE_PROSPECT_STATUSES.has(prospect.status as string)) {
        await admin
          .from('sponsor_prospects')
          .update({ status: 'contacted', updated_at: nowIso })
          .eq('id', prospect.id as string)
      }
    }

    return Response.json({ ok: true, external_id: outcome.externalId ?? null })
  } catch (e) {
    console.error('[sponsorship/outreach/send] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
