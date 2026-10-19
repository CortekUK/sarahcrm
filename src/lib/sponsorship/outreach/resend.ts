// ResendSender — the default outreach sender for single approved messages.
//
// Wraps the shared sendClubEmail helper so branding + Resend config + email_log
// recording all stay in one place. Maps its { sent, id, error } result onto the
// SendOutcome the outreach route persists.
//
// Reply-to: outreach is sent FROM the Resend address (a no-reply mailbox that
// Gmail sync never reads), so every message sets reply_to to a SYNCED inbox —
// SPONSOR_OUTREACH_REPLY_TO, else GOOGLE_WORKSPACE_SUBJECT (Sarah's mailbox).
// The prospect's reply then lands in gmail_messages as an inbound message from
// their address, which is what reply tracking (./replies.ts) matches on.

import { sendClubEmail } from '@/lib/email/club-email'
import type { OutreachMessage, OutreachSender, SendOutcome } from './types'

// The inbox prospects' replies should land in (must be a Gmail-synced inbox).
export function outreachReplyTo(): string | undefined {
  const v = (process.env.SPONSOR_OUTREACH_REPLY_TO || process.env.GOOGLE_WORKSPACE_SUBJECT || '').trim()
  return v || undefined
}

export class ResendSender implements OutreachSender {
  readonly name = 'resend'

  async send(m: OutreachMessage): Promise<SendOutcome> {
    const { sent, id, error } = await sendClubEmail({
      to: m.to,
      subject: m.subject,
      html: m.html,
      category: 'sponsor_outreach',
      memberId: m.memberId ?? undefined,
      replyTo: outreachReplyTo(),
    })
    return { ok: sent, externalId: id, error }
  }
}
