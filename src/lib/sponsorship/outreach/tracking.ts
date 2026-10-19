// Resend engagement → sponsor outreach steps.
//
// Called by the Resend webhook (/api/webhooks/resend) for every event. A sent
// outreach step stores the Resend message id in sponsor_outreach.external_id,
// so the webhook's data.email_id matches it directly:
//   • opened  → opened_at (first open only)
//   • clicked → clicked_at + opened_at (first only; a click implies an open)
//   • bounced → status 'bounced' and every not-yet-sent step to that same
//               address is cancelled (no point following up a dead address)
//
// A message id that isn't an outreach step simply matches nothing. Never
// throws — engagement is best-effort data.

import type { SupabaseClient } from '@supabase/supabase-js'
import { PENDING_STATUSES } from './sequence'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

export async function recordOutreachEngagement(
  admin: Admin,
  messageId: string,
  kind: 'opened' | 'clicked' | 'bounced',
  iso: string,
): Promise<void> {
  try {
    if (kind === 'opened' || kind === 'clicked') {
      if (kind === 'clicked') {
        await admin
          .from('sponsor_outreach')
          .update({ clicked_at: iso })
          .eq('external_id', messageId)
          .is('clicked_at', null)
      }
      await admin
        .from('sponsor_outreach')
        .update({ opened_at: iso })
        .eq('external_id', messageId)
        .is('opened_at', null)
      return
    }

    // Bounce: only a step that actually went out can bounce. Then cancel the
    // not-yet-sent steps going to that same address (other contacts at the
    // prospect keep their sequences).
    const { data: bounced } = await admin
      .from('sponsor_outreach')
      .update({ status: 'bounced', updated_at: iso })
      .eq('external_id', messageId)
      .eq('status', 'sent')
      .select('prospect_id, to_email')
    for (const row of (bounced ?? []) as { prospect_id: string; to_email: string | null }[]) {
      const address = (row.to_email ?? '').trim().toLowerCase()
      if (!address) continue
      const { data: pending } = await admin
        .from('sponsor_outreach')
        .select('id, to_email')
        .eq('prospect_id', row.prospect_id)
        .in('status', [...PENDING_STATUSES])
      const ids = ((pending ?? []) as { id: string; to_email: string | null }[])
        .filter((p) => (p.to_email ?? '').trim().toLowerCase() === address)
        .map((p) => p.id)
      if (ids.length > 0) {
        await admin
          .from('sponsor_outreach')
          .update({ status: 'cancelled', updated_at: iso })
          .in('id', ids)
      }
    }
  } catch (e) {
    console.error('[outreach/tracking] engagement update failed:', e)
  }
}
