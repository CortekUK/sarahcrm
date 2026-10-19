// Re-render an outreach step's HTML from its (edited) subject + plain text.
//
// The review editor edits subject + body_text, but the sender sends body_html.
// Without this, an admin's edits would be shown and approved but never sent.
// Mirrors the shell outreach/draft uses: eyebrow + subject as heading + one
// paragraph per blank-line-separated block (the first block is the greeting).
// Admin-typed text is HTML-escaped before it goes into the shell.

import { renderClubEmail } from '@/lib/email/club-email'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderOutreachHtml(subject: string | null, bodyText: string | null): string {
  const paragraphs = (bodyText ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => escapeHtml(p).replace(/\n/g, '<br />'))
  return renderClubEmail({
    eyebrow: 'Partnership with The Club',
    heading: escapeHtml(subject || 'A partnership with The Club'),
    paragraphs,
  })
}
