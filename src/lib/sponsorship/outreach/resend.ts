// ResendSender — the default outreach sender for single approved messages.
//
// Wraps the shared sendClubEmail helper so branding + Resend config + email_log
// recording all stay in one place. Maps its { sent, id, error } result onto the
// SendOutcome the outreach route persists.

import { sendClubEmail } from '@/lib/email/club-email'
import type { OutreachMessage, OutreachSender, SendOutcome } from './types'

export class ResendSender implements OutreachSender {
  readonly name = 'resend'

  async send(m: OutreachMessage): Promise<SendOutcome> {
    const { sent, id, error } = await sendClubEmail({
      to: m.to,
      subject: m.subject,
      html: m.html,
      category: 'sponsor_outreach',
      memberId: m.memberId ?? undefined,
    })
    return { ok: sent, externalId: id, error }
  }
}
