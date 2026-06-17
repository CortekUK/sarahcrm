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

export function renderIntroEmail(otherName: string, draft: IntroEmailDraft): string {
  const lines = draft.body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const tokenIdx = lines.findIndex((l) => l === CTA_TOKEN)
  const paragraphs = lines.filter((l) => l !== CTA_TOKEN)
  return renderClubEmail({
    eyebrow: 'Introduction',
    heading: `We'd like to introduce you to ${otherName}.`,
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
