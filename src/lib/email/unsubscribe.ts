// Unsubscribe links for marketing email.
//
// Newsletter subscribers carry a per-row mailing_list.unsubscribe_token.
// Members have no mailing_list row, so their link carries the (lowercased)
// address plus an HMAC signature instead — nothing stored, nothing guessable.
// Either way the opt-out is recorded in mailing_list.unsubscribed_at (a
// member who opts out gets a suppression row), and every marketing send skips
// addresses found there (loadSuppressedEmails).
//
// Links point at the public /unsubscribe page, which confirms with a button
// and POSTs to /api/newsletter/unsubscribe — a link that is merely opened
// (e.g. by a mail scanner) never unsubscribes anyone.
//
// Signing key: UNSUBSCRIBE_SECRET, falling back to the service-role key
// (server-only; an HMAC never reveals its key).

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { siteUrl } from './site-url'

function signingKey(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function sign(email: string): string {
  return crypto
    .createHmac('sha256', signingKey())
    .update(`unsubscribe:${email}`)
    .digest('base64url')
}

export function subscriberUnsubscribeUrl(token: string): string {
  return `${siteUrl()}/unsubscribe?token=${encodeURIComponent(token)}`
}

export function memberUnsubscribeUrl(email: string): string {
  const e = email.trim().toLowerCase()
  return `${siteUrl()}/unsubscribe?e=${Buffer.from(e).toString('base64url')}&sig=${sign(e)}`
}

// Recipient → the right link (token when they have one, else signed email).
export function unsubscribeUrlFor(r: { email: string; unsubscribe_token?: string | null }): string {
  return r.unsubscribe_token ? subscriberUnsubscribeUrl(r.unsubscribe_token) : memberUnsubscribeUrl(r.email)
}

// Decodes + verifies a signed member link. Returns the email, or null.
export function verifyMemberUnsubscribe(e: string, sig: string): string | null {
  if (!signingKey() || !e || !sig) return null
  let email: string
  try {
    email = Buffer.from(e, 'base64url').toString('utf8').trim().toLowerCase()
  } catch {
    return null
  }
  if (!email.includes('@')) return null
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(email))
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? email : null
}

// Lowercased addresses that have opted out of marketing email.
export async function loadSuppressedEmails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
): Promise<Set<string>> {
  const out = new Set<string>()
  const { data } = await admin
    .from('mailing_list')
    .select('email')
    .not('unsubscribed_at', 'is', null)
  for (const r of (data ?? []) as { email: string | null }[]) {
    if (r.email) out.add(r.email.trim().toLowerCase())
  }
  return out
}

// Standard marketing footer with a working unsubscribe link.
export function unsubscribeFooterHtml(url: string): string {
  const href = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return `
    <hr style="border:none;border-top:1px solid #E5E0D8;margin:32px 0 16px;" />
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#6B6560;text-align:center;">
      You're receiving this from The Club by Sarah Restrick.
      <br/>
      <a href="${href}" style="color:#A87B4F;text-decoration:underline;">Unsubscribe</a>
    </p>
  `
}
