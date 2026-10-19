// Sponsor outreach SEQUENCE lifecycle — the in-CRM replacement for the
// "Instantly later" plan.
//
// A sequence is the set of sponsor_outreach rows drafted together (shared
// sequence_id): step 0 is the first touch, steps 1..n are follow-ups. Each
// step carries delay_days = days to wait AFTER THE PREVIOUS STEP WAS SENT.
//
// Lifecycle (status column; "scheduled" is shown in the UI, see below):
//
//   draft ──approve──▶ approved ──send (manual, any time)──▶ sent
//     ▲                  │  │
//     └──unapprove───────┘  └─ auto_send=true ("approve & schedule") →
//                              the daily runner sends it once due_at passes
//   draft/approved ──reply / bounce / admin stop──▶ cancelled
//   sent ──reply detected──▶ replied          sent ──Resend bounce──▶ bounced
//   send error ──▶ failed (admin can move it back to draft and re-approve)
//
// due_at is null until the PREVIOUS step is sent; at that moment
// scheduleNextStep() stamps the next step's due_at = sent_at + delay_days.
//
// THE HUMAN GATE IS UNCHANGED: dispatchOutreach() — the only function here
// that sends — refuses anything whose status is not exactly 'approved'. The
// "scheduled" state is NOT a separate DB status; it is approved + auto_send,
// so the cron path passes through the very same status==='approved' guard.
//
// Never throws: every function catches and reports, so neither the send route
// nor runAllAutomations can be crashed by it.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSender } from './index'
import type { OutreachChannel } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

const DAY_MS = 86_400_000

// Default gap (days after the previous step) for follow-up steps 1, 2, 3, 4…
// → first touch on day 0, follow-ups on ~day 3, 7, 14, 21.
export const DEFAULT_FOLLOW_UP_DELAYS = [3, 4, 7, 7]

// Steps that have not gone out yet and can still be cancelled / scheduled.
export const PENDING_STATUSES = ['draft', 'approved'] as const

// A claim older than this is treated as abandoned (e.g. a crashed request), so
// the row can be claimed again instead of being stuck forever.
const CLAIM_STALE_MS = 10 * 60 * 1000

// Prospect statuses that advance to 'contacted' on a successful send.
// 'responded'/'won' (and anything further) are never downgraded.
const BUMPABLE_PROSPECT_STATUSES = new Set(['suggested', 'shortlisted', 'approved'])

// Default delay for the step at position `index` in a freshly drafted sequence.
export function defaultDelayForStep(index: number): number {
  if (index <= 0) return 0
  return DEFAULT_FOLLOW_UP_DELAYS[Math.min(index - 1, DEFAULT_FOLLOW_UP_DELAYS.length - 1)]
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString()
}

// After a step is sent, stamp the NEXT pending step in the same sequence with
// its due date (sent_at + its delay_days). Only the immediate next step is
// scheduled — later steps wait for their own predecessor to be sent, so
// follow-ups can never bunch up. Best-effort.
export async function scheduleNextStep(
  admin: Admin,
  sent: { sequence_id: string | null; prospect_id: string; step: number; sent_at: string },
): Promise<void> {
  try {
    let q = admin
      .from('sponsor_outreach')
      .select('id, step, delay_days')
      .gt('step', sent.step)
      .in('status', [...PENDING_STATUSES])
      .order('step', { ascending: true })
      .limit(1)
    q = sent.sequence_id ? q.eq('sequence_id', sent.sequence_id) : q.eq('prospect_id', sent.prospect_id)
    const { data, error } = await q
    if (error || !data || data.length === 0) return
    const next = data[0] as { id: string; delay_days: number | null }
    await admin
      .from('sponsor_outreach')
      .update({
        due_at: addDays(sent.sent_at, Math.max(0, Number(next.delay_days ?? 0))),
        updated_at: new Date().toISOString(),
      })
      .eq('id', next.id)
  } catch (e) {
    console.error('[outreach/sequence] scheduleNextStep failed:', e)
  }
}

// Work out a step's due date from its predecessor: the nearest earlier step in
// the same sequence that wasn't cancelled. A due date only exists once the
// previous step has been sent, or for a scheduled step:
//   predecessor sent          → sent_at + delay
//   predecessor not sent yet  → null (waiting)
//   no live predecessor (the step is the first live touch)
//                             → now + delay if `scheduled` (so an "approved and
//                               scheduled" first touch goes out on the next
//                               daily run), else null — a draft or unscheduled
//                               first touch has no due date.
export async function computeDueAt(
  admin: Admin,
  row: { sequence_id: string | null; prospect_id: string; step: number },
  delayDays: number,
  scheduled: boolean,
): Promise<string | null> {
  try {
    let q = admin
      .from('sponsor_outreach')
      .select('sent_at')
      .lt('step', row.step)
      .neq('status', 'cancelled')
      .order('step', { ascending: false })
      .limit(1)
    q = row.sequence_id ? q.eq('sequence_id', row.sequence_id) : q.eq('prospect_id', row.prospect_id)
    const { data, error } = await q
    if (error) return null
    const prev = (data ?? [])[0] as { sent_at: string | null } | undefined
    if (!prev) return scheduled ? addDays(new Date().toISOString(), delayDays) : null
    return prev.sent_at ? addDays(prev.sent_at, delayDays) : null
  } catch (e) {
    console.error('[outreach/sequence] computeDueAt failed:', e)
    return null
  }
}

// Cancel every not-yet-sent step for a prospect (all of its sequences) — used
// when the prospect replies (reply tracking). Returns how many rows were
// cancelled. Best-effort.
export async function cancelPendingSteps(admin: Admin, prospectId: string): Promise<number> {
  try {
    const { data, error } = await admin
      .from('sponsor_outreach')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('prospect_id', prospectId)
      .in('status', [...PENDING_STATUSES])
      .select('id')
    if (error) {
      console.error('[outreach/sequence] cancelPendingSteps failed:', error.message)
      return 0
    }
    return (data ?? []).length
  } catch (e) {
    console.error('[outreach/sequence] cancelPendingSteps failed:', e)
    return 0
  }
}

export type DispatchResult =
  | { ok: true; externalId: string | null }
  | { ok: false; httpStatus: number; error: string; skipped?: boolean }

// Send ONE approved outreach row through the sender seam. Shared by the manual
// send route and the daily sequence runner so both paths apply identical
// rules. `opts.auto` = called by the runner: additionally requires the row to
// be scheduled (auto_send) and due, and the prospect not to have replied or
// bounced.
export async function dispatchOutreach(
  admin: Admin,
  outreachId: string,
  opts: { auto?: boolean } = {},
): Promise<DispatchResult> {
  try {
    // ── Load the outreach row ──────────────────────────────────────────
    // select('*') so this keeps working before the sequences migration is
    // applied (the new columns are simply absent then).
    const { data: row, error: loadErr } = await admin
      .from('sponsor_outreach')
      .select('*')
      .eq('id', outreachId)
      .maybeSingle()
    if (loadErr || !row) return { ok: false, httpStatus: 404, error: 'Outreach not found' }

    // ── HARD GUARD: only an approved message may ever be sent ──────────
    if (row.status !== 'approved') {
      return { ok: false, httpStatus: 400, error: 'Approve this outreach before sending.' }
    }

    // ── Recipient required ─────────────────────────────────────────────
    if (!row.to_email) {
      return { ok: false, httpStatus: 400, error: 'No recipient email. Add one before sending.' }
    }

    // ── Runner-only guards: scheduled, due, prospect still silent ──────
    if (opts.auto) {
      if (row.auto_send !== true) {
        return { ok: false, httpStatus: 400, error: 'Not scheduled', skipped: true }
      }
      if (!row.due_at || new Date(row.due_at as string).getTime() > Date.now()) {
        return { ok: false, httpStatus: 400, error: 'Not due yet', skipped: true }
      }
      const { data: prospect } = await admin
        .from('sponsor_prospects')
        .select('id, replied_at')
        .eq('id', row.prospect_id as string)
        .maybeSingle()
      if (!prospect || prospect.replied_at) {
        return { ok: false, httpStatus: 409, error: 'Prospect has replied', skipped: true }
      }
      // Belt and braces: a replied step anywhere on the prospect, or a bounce
      // to this same address, stops the automatic send.
      const { data: stopped } = await admin
        .from('sponsor_outreach')
        .select('status, to_email')
        .eq('prospect_id', row.prospect_id as string)
        .in('status', ['replied', 'bounced'])
      const address = String(row.to_email).trim().toLowerCase()
      const blocked = ((stopped ?? []) as { status: string; to_email: string | null }[]).some(
        (s) =>
          s.status === 'replied' || (s.to_email ?? '').trim().toLowerCase() === address,
      )
      if (blocked) {
        return { ok: false, httpStatus: 409, error: 'Prospect replied or address bounced', skipped: true }
      }
    }

    // ── Claim the row so a concurrent cron + manual send can't double-send ─
    const claimIso = new Date().toISOString()
    const staleIso = new Date(Date.now() - CLAIM_STALE_MS).toISOString()
    const { data: claimed, error: claimErr } = await admin
      .from('sponsor_outreach')
      .update({ send_claimed_at: claimIso })
      .eq('id', row.id as string)
      .eq('status', 'approved')
      .or(`send_claimed_at.is.null,send_claimed_at.lt."${staleIso}"`)
      .select('id')
    if (claimErr) {
      // The claim column only exists once the sequences migration is applied.
      // A manual send keeps its original (claim-less) behaviour; the runner
      // never sends without a claim.
      if (opts.auto) return { ok: false, httpStatus: 500, error: claimErr.message }
      console.warn('[outreach/sequence] claim unavailable, sending unclaimed:', claimErr.message)
    } else if (!claimed || claimed.length === 0) {
      return { ok: false, httpStatus: 409, error: 'This outreach is already being sent.' }
    }

    // ── Send through the outreach seam (Resend today) ──────────────────
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
      // InstantlySender throws by design — catch and mark failed.
      const message = e instanceof Error ? e.message : 'Send failed'
      console.error('[outreach/sequence] sender threw:', e)
      outcome = { ok: false, error: message }
    }

    const nowIso = new Date().toISOString()

    // Core state writes touch ONLY the original columns, so they can never
    // fail on a missing new column and leave a sent email looking unsent
    // (which would invite a duplicate send). The claim is released separately.
    if (!outcome.ok) {
      await admin
        .from('sponsor_outreach')
        .update({ status: 'failed', updated_at: nowIso })
        .eq('id', row.id as string)
      await releaseClaim(admin, row.id as string)
      return { ok: false, httpStatus: 502, error: outcome.error ?? 'Send failed' }
    }

    await admin
      .from('sponsor_outreach')
      .update({
        status: 'sent',
        sent_at: nowIso,
        external_id: outcome.externalId ?? null,
        updated_at: nowIso,
      })
      .eq('id', row.id as string)
    await releaseClaim(admin, row.id as string)

    // Bump the prospect to 'contacted' only from an earlier stage.
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

    // Start the clock on the next step of this sequence.
    await scheduleNextStep(admin, {
      sequence_id: (row.sequence_id as string | null) ?? null,
      prospect_id: row.prospect_id as string,
      step: Number(row.step ?? 0),
      sent_at: nowIso,
    })

    return { ok: true, externalId: outcome.externalId ?? null }
  } catch (e) {
    console.error('[outreach/sequence] dispatchOutreach failed:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return { ok: false, httpStatus: 500, error: message }
  }
}

async function releaseClaim(admin: Admin, id: string): Promise<void> {
  try {
    await admin.from('sponsor_outreach').update({ send_claimed_at: null }).eq('id', id)
  } catch {
    /* best-effort — a stale claim expires after CLAIM_STALE_MS anyway */
  }
}
