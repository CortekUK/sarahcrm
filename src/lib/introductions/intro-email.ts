// Default content + HTML rendering for the two-sided introduction email.
//
// Each party gets their own email (addressed to them, about the *other*
// member). Sarah can edit the subject + message before sending; whatever she
// composes is persisted on the introduction so a scheduled send fires exactly
// that. The heading and the CTA (which lands on the member's Introductions
// page to accept/reject) are fixed.

import { renderClubEmail } from '@/lib/email/club-email'

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL || 'https://sarahcrm.vercel.app'

export interface IntroEmailDraft {
  subject: string
  body: string // newline-separated paragraphs Sarah can edit
}

// Build the default editable draft for a recipient, about the other member.
export function defaultIntroEmail(
  recipientFirstName: string | null,
  otherName: string,
  otherCompany: string | null,
  matchReason: string | null,
): IntroEmailDraft {
  const who = otherCompany ? `${otherName} (${otherCompany})` : otherName
  const lines = [
    `Hello ${recipientFirstName || 'there'},`,
    `We think there's good reason for you and ${who} to connect.`,
  ]
  if (matchReason && matchReason.trim()) lines.push(matchReason.trim())
  lines.push(`Tap below to view the introduction and let us know if you'd like us to connect you.`)
  return {
    subject: 'An introduction from The Club',
    body: lines.join('\n\n'),
  }
}

// Render a composed draft to the branded HTML email.
// The body may contain a {{button}} marker line indicating where the
// "View & respond" CTA should appear. If absent, the CTA goes at the end.
export const CTA_TOKEN = '{{button}}'

// Who the email is addressed to — fills merge tags admins carry over from
// the template builder ({{first_name}}, {{last_name}}, {{full_name}},
// {{name}}, optional "|fallback": {{first_name|there}}), plus
// {{other_name}} for the member being introduced.
export interface IntroRecipient {
  first_name?: string | null
  last_name?: string | null
}

export function fillIntroMergeTags(
  text: string,
  recipient: IntroRecipient | null | undefined,
  otherName: string,
): string {
  const first = recipient?.first_name?.trim() || ''
  const last = recipient?.last_name?.trim() || ''
  const values: Record<string, string> = {
    first_name: first,
    firstname: first,
    last_name: last,
    lastname: last,
    full_name: `${first} ${last}`.trim(),
    name: `${first} ${last}`.trim(),
    other_name: otherName,
  }
  return text.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (match, key: string, fallback?: string) => {
    const k = key.toLowerCase()
    if (k === 'button') return match // CTA marker — handled by renderIntroEmail
    if (!(k in values)) return match
    return values[k] || (fallback ?? '').trim() || (k.includes('first') ? 'there' : '')
  })
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// The admin's message is plain text (a textarea), so it is HTML-escaped
// here — a typed "<b>" shows as text, never as markup. Merge tags are
// filled for `recipient` (without one, {{first_name}} falls back to "there").
export function renderIntroEmail(
  otherName: string,
  draft: IntroEmailDraft,
  recipient?: IntroRecipient | null,
): string {
  const lines = draft.body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const tokenIdx = lines.findIndex((l) => l === CTA_TOKEN)
  const paragraphs = lines
    .filter((l) => l !== CTA_TOKEN)
    .map((l) => escapeHtml(fillIntroMergeTags(l, recipient, otherName)))
  return renderClubEmail({
    eyebrow: 'Introduction',
    heading: `We'd like to introduce you to ${escapeHtml(otherName)}.`,
    paragraphs,
    cta: { label: 'View & respond', url: `${APP_URL}/portal/introductions` },
    // tokenIdx counts paragraphs before the token (token already removed above).
    ...(tokenIdx >= 0 ? { ctaAfterIndex: tokenIdx } : {}),
  })
}

// Compose the persisted body string from prose paragraphs + the CTA position
// (after `ctaPos` paragraphs). Bakes a {{button}} marker into the body so a
// scheduled send renders the button in the same place.
export function composeIntroBody(prose: string, ctaPos: number): string {
  const paras = prose.split('\n').map((l) => l.trim()).filter(Boolean)
  const idx = Math.max(0, Math.min(ctaPos, paras.length))
  return [...paras.slice(0, idx), CTA_TOKEN, ...paras.slice(idx)].join('\n\n')
}

// Strip the {{button}} marker back out for editing (prose only).
export function stripCtaToken(body: string): string {
  return body
    .split('\n')
    .filter((l) => l.trim() !== CTA_TOKEN)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
