// Shared Club email helpers — one branded shell + one Resend sender that
// every automated flow (and any future transactional email) reuses, so the
// look and the sending config live in exactly one place.

interface ClubEmailParts {
  eyebrow?: string
  heading: string
  paragraphs: string[]
  cta?: { label: string; url: string }
  signoff?: string
}

// Branded LIGHT shell (cream + gold) — Sarah's preferred palette, aligned
// with the booking-confirmation emails so every message reads as the same
// brand. Paragraphs are plain strings (basic inline <strong>/<a> allowed
// by the caller).
export function renderClubEmail(parts: ClubEmailParts): string {
  const eyebrow = parts.eyebrow
    ? `<p style="margin:0 0 16px 0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#B8975A;font-weight:600;">${parts.eyebrow}</p>`
    : ''
  const body = parts.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.7;color:#3A3530;">${p}</p>`,
    )
    .join('')
  const cta = parts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 6px 0;"><tr><td style="background:#B8975A;border-radius:999px;">
         <a href="${parts.cta.url}" style="display:inline-block;padding:13px 30px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;font-weight:600;">${parts.cta.label}</a>
       </td></tr></table>`
    : ''
  const signoff = parts.signoff ?? 'Sarah Restrick &amp; the team'
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
          <h1 style="margin:0 0 22px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:#2C2825;font-weight:500;letter-spacing:-0.01em;">${parts.heading}</h1>
          ${body}
          ${cta}
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
export async function sendClubEmail(args: {
  to: string
  subject: string
  html: string
  category?: string
  memberId?: string | null
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
