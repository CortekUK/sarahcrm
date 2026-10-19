// Daily sponsor-outreach SEQUENCE runner — hooked into runAllAutomations().
//
// Runs once per real automation batch (the cron fires runAllAutomations at the
// configured UK send-hour). Two steps, in this order:
//
//   1. Reply detection (detectOutreachReplies) over the synced Gmail table,
//      so a prospect who replied since the last Gmail sync is stopped BEFORE
//      anything else goes out to them.
//   2. Send every step that is approved + scheduled (auto_send) + due
//      (due_at <= now), one by one, through dispatchOutreach() — the same
//      function the manual Send button uses, with the same hard
//      status==='approved' guard, plus the runner-only checks (scheduled, due,
//      prospect hasn't replied/bounced).
//
// Steps that are merely 'approved' (not scheduled) are never sent here — an
// admin sends those by hand. Drafts are never sent by anything.
//
// Dry-run (Automations dashboard preview): reports what WOULD send, writes and
// sends nothing. Never throws — returns a FlowResult in the shape every other
// flow reports, so it appears on the Automations dashboard.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FlowResult } from '@/lib/automations/run'
import { detectOutreachReplies } from './replies'
import { dispatchOutreach } from './sequence'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

// Safety valve: never send more than this many outreach steps in one run.
const MAX_PER_RUN = 50

export async function sponsorOutreachSequences(
  admin: Admin,
  dryRun: boolean,
): Promise<FlowResult> {
  const result: FlowResult = {
    flow: 'sponsor_outreach_sequence',
    label: 'Sponsor outreach — scheduled follow-ups',
    candidates: 0,
    alreadyHandled: 0,
    pending: 0,
    sent: 0,
    failed: 0,
    items: [],
  }
  try {
    // ── 1. Stop anyone who has replied (read-only on a dry run) ──────
    const replies = await detectOutreachReplies(admin, { dryRun })
    const replied = new Set(replies.repliedProspectIds)

    // ── 2. Approved + scheduled + due ────────────────────────────────
    const { data, error } = await admin
      .from('sponsor_outreach')
      .select('id, prospect_id, to_email, subject, step, due_at')
      .eq('status', 'approved')
      .eq('auto_send', true)
      .not('due_at', 'is', null)
      .lte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })
      .limit(MAX_PER_RUN)
    if (error) {
      // e.g. the sequences migration isn't applied yet — nothing to do.
      console.error('[outreach/runner] due query failed:', error.message)
      return result
    }

    const rows = (data ?? []) as {
      id: string
      prospect_id: string
      to_email: string | null
      subject: string | null
      step: number
    }[]
    result.candidates = rows.length

    for (const row of rows) {
      const detail = `Step ${row.step}: ${row.subject ?? '(no subject)'}`
      const to = row.to_email ?? ''
      if (replied.has(row.prospect_id)) {
        // Only reachable on a dry run — a real run has already cancelled it.
        result.alreadyHandled += 1
        result.items.push({ ref_id: row.id, to, detail, status: 'skipped', error: 'Prospect replied' })
        continue
      }
      result.pending += 1
      if (dryRun) {
        result.items.push({ ref_id: row.id, to, detail, status: 'would_send' })
        continue
      }
      const outcome = await dispatchOutreach(admin, row.id, { auto: true })
      if (outcome.ok) {
        result.sent += 1
        result.items.push({ ref_id: row.id, to, detail, status: 'sent' })
      } else if (outcome.skipped) {
        result.items.push({ ref_id: row.id, to, detail, status: 'skipped', error: outcome.error })
      } else {
        result.failed += 1
        result.items.push({ ref_id: row.id, to, detail, status: 'failed', error: outcome.error })
      }
    }
  } catch (e) {
    console.error('[outreach/runner] failed:', e)
  }
  return result
}
