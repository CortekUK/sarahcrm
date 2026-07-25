// InstantlySender — documented STUB (modelled on marketing/publish/metricool.ts).
//
// This is the drop-in slot for multi-step outreach sequences once Instantly is
// provisioned. When that lands:
//   1. Implement send() against the Instantly API (enroll the contact in a
//      sequence / send the step, return the real message id).
//   2. Route the 'instantly' channel to this sender (getSender already does).
// Nothing else in the codebase should need to change — the outreach route
// treats every sender through the OutreachSender interface.
//
// Until then it throws so it can never silently no-op or fake a success.

import type { OutreachMessage, OutreachSender, SendOutcome } from './types'

export class InstantlySender implements OutreachSender {
  readonly name = 'instantly'

  async send(_m: OutreachMessage): Promise<SendOutcome> {
    throw new Error(
      'InstantlySender not implemented — sequences will be wired when Instantly is provisioned',
    )
  }
}
