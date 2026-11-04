// Shared Club email helpers — one branded shell + one Resend sender that
// every automated flow (and any future transactional email) reuses, so the
// look and the sending config live in exactly one place.

interface ClubEmailParts {
  eyebrow?: string
  heading: string
  paragraphs: string[]
  cta?: { label: string; url: string }
  // Where the CTA button sits: after this many paragraphs. Omit = after all.
  ctaAfterIndex?: number
  // Optional raw-HTML block (e.g. a highlighted panel) inserted between
  // paragraphs, after `panelAfterIndex` of them (default: after all).
  panelHtml?: string
  panelAfterIndex?: number
  signoff?: string
}

// ── Escaping ──────────────────────────────────────────────────────────
// Names, companies, event titles, guest names etc. are user-typed and end up
// interpolated into the strings callers pass below. Everything is escaped
// HERE, at the shared layer, so a "name" like `<a href=evil>Verify</a>` can
// never become a live link in an email sent from the club's domain.
//
// Existing entities (&amp; &#39; &mdash; …) are left as-is, so callers that
// already escape their values are not double-escaped.
const ENTITY_SAFE_AMP = /&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/g

// Full escape — safe for text AND double-quoted attribute values.
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(ENTITY_SAFE_AMP, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Escape every string value of a merge-tag dictionary, for substitution into
// an HTML body (subjects are plain text — resolve those with the raw data).
export function escapeMergeData<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) out[k] = typeof v === 'string' ? escapeHtml(v) : v
  return out as T
}

// Inline-text sanitiser for the shell's text slots (heading, eyebrow,
// paragraphs, CTA label, sign-off). Escapes everything EXCEPT the small set
// of literal formatting tags the app's own callers write: <strong>/<b>/<em>/
// <i>/<span>, <br />, and <strong|span|em style="…"> with a plain inline style
// (no double quotes, angle brackets or parentheses, so no url()/expression()).
// Links and every other tag become escaped text — a typed tag can bold text
// at most. Already-escaped text (&lt;b&gt;) stays text.
const SAFE_STYLE = "[a-zA-Z0-9#:;,.%' -]{1,200}"
const ALLOWED_INLINE_TAG = new RegExp(
  `<\\/?(?:strong|b|em|i|span)>|<(?:strong|span|em) style="${SAFE_STYLE}">|<br\\s*\\/?>`,
  'gi',
)
function escapeText(s: string): string {
  return s.replace(ENTITY_SAFE_AMP, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inlineHtml(value: unknown): string {
  const s = String(value ?? '')
  let out = ''
  let last = 0
  for (const m of s.matchAll(ALLOWED_INLINE_TAG)) {
    const at = m.index ?? 0
    out += escapeText(s.slice(last, at)) + (/^<br/i.test(m[0]) ? '<br />' : m[0])
    last = at + m[0].length
  }
  return out + escapeText(s.slice(last))
}

// CTA hrefs: only absolute http(s)/mailto URLs, attribute-escaped.
function safeHref(url: string): string {
  return /^(https?:\/\/|mailto:)/i.test(url.trim()) ? escapeHtml(url.trim()) : '#'
}

// Branded LIGHT shell (cream + gold) — Sarah's preferred palette, aligned
// with the booking-confirmation emails so every message reads as the same
// brand. Text slots are sanitised by inlineHtml (basic <strong>/<em>/<br />
// allowed; everything else, including <a>, is escaped). `panelHtml` is the
// one raw-HTML slot — callers must escape any user values they put in it.
export function renderClubEmail(parts: ClubEmailParts): string {
  const eyebrow = parts.eyebrow
    ? `<p style="margin:0 0 16px 0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#B8975A;font-weight:600;">${inlineHtml(parts.eyebrow)}</p>`
    : ''
  const paraHtml = parts.paragraphs.map(
    (p) =>
      `<p style="margin:0 0 16px 0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.7;color:#3A3530;">${inlineHtml(p)}</p>`,
  )
  const cta = parts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 6px 0;"><tr><td style="background:#B8975A;border-radius:999px;">
         <a href="${safeHref(parts.cta.url)}" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;font-weight:600;">${inlineHtml(parts.cta.label)}</a>
       </td></tr></table>`
    : ''
  const panelBlock = parts.panelHtml ?? ''
  // Place the CTA after `ctaAfterIndex` paragraphs, or after all of them.
  // Optionally slot a raw-HTML panel in among the paragraphs too.
  const body =
    parts.cta && typeof parts.ctaAfterIndex === 'number'
      ? (() => {
          const idx = Math.max(0, Math.min(parts.ctaAfterIndex, paraHtml.length))
          return [...paraHtml.slice(0, idx), cta, ...paraHtml.slice(idx)].join('') + panelBlock
        })()
      : (() => {
          const arr = [...paraHtml]
          if (panelBlock) {
            const pIdx = Math.max(0, Math.min(parts.panelAfterIndex ?? arr.length, arr.length))
            arr.splice(pIdx, 0, panelBlock)
          }
          return arr.join('') + cta
        })()
  const signoff = inlineHtml(parts.signoff ?? 'Sarah Restrick &amp; the team')
  return `
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F5F0;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #EAE6DE;">
        <tr><td align="center" style="padding:36px 32px 26px 32px;background:#FAFAF7;border-bottom:1px solid #E5E0D8;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:0.02em;color:#2C2825;font-weight:600;">The Club</div>
          <div style="margin-top:10px;">
            <span style="display:inline-block;width:30px;height:1px;background:#B8975A;vertical-align:middle;"></span>
            <span style="font-family:'DM Sans',Arial,sans-serif;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#B8975A;padding:0 12px;font-weight:600;">by Sarah Restrick</span>
            <span style="display:inline-block;width:30px;height:1px;background:#B8975A;vertical-align:middle;"></span>
          </div>
        </td></tr>
        <tr><td style="padding:40px 40px 8px 40px;">
          ${eyebrow}
          <h1 style="margin:0 0 22px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:#2C2825;font-weight:500;letter-spacing:-0.01em;">${inlineHtml(parts.heading)}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:22px 40px 40px 40px;">
          <p style="margin:0 0 6px 0;font-style:italic;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#6B6560;">With warmth,</p>
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#2C2825;">${signoff}</p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:#A09A93;">The Club by Sarah Restrick</p>
    </td></tr>
  </table>
</body></html>`
}

export interface SendResult {
  sent: boolean
  id?: string
  error?: string
}

// Best-effort: record every send (full HTML) in email_log so the admin can
// see and open any message the platform sent. Never throws.
async function logEmail(entry: {
  to: string
  subject: string
  html: string
  category?: string
  memberId?: string | null
  status: 'sent' | 'failed'
  error?: string | null
  resendId?: string | null
}): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(url, key, { auth: { persistSession: false } })
    await admin.from('email_log').insert({
      to_email: entry.to,
      subject: entry.subject,
      html: entry.html,
      category: entry.category ?? null,
      status: entry.status,
      error: entry.error ?? null,
      resend_message_id: entry.resendId ?? null,
      member_id: entry.memberId ?? null,
    })
  } catch (e) {
    console.error('[email_log] insert failed:', e)
  }
}

// Single Resend sender. Reads RESEND_FROM_EMAIL (falling back to FROM_EMAIL)
// and RESEND_FROM_NAME so the verified-domain config lives in env. Logs every
// send to email_log (pass `category` to label it, e.g. "booking_confirmation").
// Optional `replyTo` sets Resend's `reply_to`, so replies go to a real inbox
// instead of the (no-reply) from-address.
export async function sendClubEmail(args: {
  to: string
  subject: string
  html: string
  category?: string
  memberId?: string | null
  replyTo?: string
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL
  if (!apiKey || !fromEmail) return { sent: false, error: 'Resend not configured' }
  const fromName = process.env.RESEND_FROM_NAME || 'The Club'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      const error = `Resend ${res.status}: ${text}`
      await logEmail({ ...args, status: 'failed', error })
      return { sent: false, error }
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string }
    await logEmail({ ...args, status: 'sent', resendId: json.id ?? null })
    return { sent: true, id: json.id }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown send error'
    await logEmail({ ...args, status: 'failed', error })
    return { sent: false, error }
  }
}
