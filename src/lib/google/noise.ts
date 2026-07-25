// Noise classifier for inbound Gmail messages.
//
// Pure, I/O-free heuristic that flags automated / bulk senders (no-reply,
// newsletters, receipts, system notifications) so they don't pollute the
// "Detected from email" contact suggestions. Applied ONLY to unmatched
// messages during sync — a message matched to a member is never classified as
// noise (that guard lives in sync-core, not here).
//
// Kept deliberately conservative: the subject/snippet check only fires on
// strong, unambiguous automated phrases to avoid hiding a real person who
// merely mentions a "receipt" or "invoice" in passing. When in doubt, it
// returns false (i.e. keep the sender as a candidate).

import type { ParsedMessage } from './gmail'

// Local-part patterns that almost always denote an automated / bulk mailbox.
// Anchored to whole tokens where practical to limit false positives.
const NOISE_LOCALPART = new RegExp(
  [
    'no-?reply',
    'donotreply',
    'do-not-reply',
    'noreply',
    'notifications?',
    'mailer(-daemon)?',
    'bounce',
    'newsletter',
    'updates?',
    'alerts?',
    'postmaster',
    'receipts?',
    'billing',
    'invoice',
    'support',
  ].join('|'),
  'i',
)

// Strong, unambiguous automated-notification phrases. Kept short + conservative.
const NOISE_SUBJECT = new RegExp(
  [
    'your (receipt|invoice|order)',
    'order (confirmation|confirmed|shipped)',
    'payment (received|confirmation|failed)',
    'unsubscribe',
    'verify your (email|account)',
    'password reset',
    'do not reply',
    'this is an automated',
    'view (this|it) in your browser',
  ].join('|'),
  'i',
)

export function isNoiseSender(msg: ParsedMessage): boolean {
  const localPart = (msg.fromEmail || '').split('@')[0] ?? ''
  if (localPart && NOISE_LOCALPART.test(localPart)) return true

  // Classic newsletter / marketing signal.
  if (msg.listUnsubscribe && msg.listUnsubscribe.trim()) return true

  const haystack = `${msg.subject ?? ''} ${msg.snippet ?? ''}`
  if (NOISE_SUBJECT.test(haystack)) return true

  return false
}
