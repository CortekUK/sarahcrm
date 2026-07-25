// Outreach sender adapter — shared types (mirrors marketing/publish/types.ts).
//
// Sponsor outreach is NEVER auto-sent: a human approves a message, and only
// then does the outreach route hand it to a sender. This interface is the
// single seam a real integration (Instantly sequences) will implement later —
// see ./instantly.ts. Today, single messages go through the Resend pipeline
// (./resend.ts, wrapping the existing sendClubEmail helper).

export interface OutreachMessage {
  id: string
  to: string
  subject: string
  html: string
  text?: string
  memberId?: string | null
}

export interface SendOutcome {
  ok: boolean
  externalId?: string
  error?: string
}

export interface OutreachSender {
  readonly name: string
  send(m: OutreachMessage): Promise<SendOutcome>
}

export type OutreachChannel = 'resend' | 'instantly'
