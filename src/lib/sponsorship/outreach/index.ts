// Outreach sender selection — the ONE place to change when Instantly lands.
//
// getSender(channel) returns the sender responsible for a channel:
//   * 'resend'   → ResendSender (single approved message via sendClubEmail).
//   * 'instantly'→ InstantlySender (documented stub until provisioned).

import { InstantlySender } from './instantly'
import { ResendSender } from './resend'
import type { OutreachChannel, OutreachSender } from './types'

export * from './types'
export { ResendSender } from './resend'
export { InstantlySender } from './instantly'

export function getSender(channel: OutreachChannel): OutreachSender {
  if (channel === 'resend') return new ResendSender()
  if (channel === 'instantly') return new InstantlySender()
  throw new Error(`No outreach sender configured for channel "${channel}".`)
}
