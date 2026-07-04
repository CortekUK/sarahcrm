// Onboarding credentials — sent via Resend, NOT Supabase's built-in mailer.
//
// The member is given a temporary password directly in a branded email and
// signs in at /login with their email + that password. This deliberately
// avoids the magic-link / set-password redirect flow (which depended on
// Supabase redirect config landing on /set-password). They're asked to change
// the password after their first sign-in.

import { randomInt } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderClubEmail, sendClubEmail } from './club-email'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

export interface InviteResult {
  userId: string | null
  emailSent: boolean
  error?: string
}

// Strong 12-char temporary password, guaranteed to include an upper, lower,
// digit and symbol. Ambiguous glyphs (0/O/1/l/I) are excluded so it's easy to
// read and type from the email.
export function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const nums = '23456789'
  const sym = '!@#$%&*'
  const all = upper + lower + nums + sym
  const pick = (s: string) => s[randomInt(s.length)]
  const chars = [pick(upper), pick(lower), pick(nums), pick(sym)]
  for (let i = 0; i < 8; i++) chars.push(pick(all))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// A highlighted, boxed credentials card so the email + password stand out
// clearly rather than reading as plain sentences. Email-client-safe (tables +
// inline styles, monospace values).
function credentialsPanel(email: string, password: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px 0;border:1px solid #E5E0D8;border-radius:12px;overflow:hidden;">
  <tr><td style="padding:16px 22px;background:#FAFAF7;border-bottom:1px solid #EEEBE4;">
    <p style="margin:0 0 5px 0;font-family:'DM Sans',Arial,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#B8975A;font-weight:600;">Email</p>
    <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:16px;color:#2C2825;font-weight:600;word-break:break-all;">${escapeHtml(email)}</p>
  </td></tr>
  <tr><td style="padding:16px 22px;background:#F3EFE6;">
    <p style="margin:0 0 5px 0;font-family:'DM Sans',Arial,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#96793F;font-weight:600;">Temporary password</p>
    <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:19px;letter-spacing:0.06em;color:#2C2825;font-weight:700;word-break:break-all;">${escapeHtml(password)}</p>
  </td></tr>
</table>`
}

// Renders + sends the branded "here are your login details" email.
async function sendCredentialsMail(
  email: string,
  firstName: string | null | undefined,
  password: string,
  loginUrl: string,
): Promise<{ sent: boolean; error?: string }> {
  const name = firstName || 'there'
  const html = renderClubEmail({
    eyebrow: 'Welcome',
    heading: 'Your Club login details',
    paragraphs: [
      `Hello ${name},`,
      `Your members account is ready. Sign in to your members area — your home for events, introductions and everything The Club offers — using the details below:`,
      `For your security, please change your password from your profile after your first sign-in. If you didn't expect this email, you can simply ignore it.`,
    ],
    panelAfterIndex: 2,
    panelHtml: credentialsPanel(email, password),
    cta: { label: 'Sign in', url: loginUrl },
  })
  const r = await sendClubEmail({
    to: email,
    subject: 'Your Club login details',
    html,
  })
  return { sent: r.sent, error: r.error }
}

// Creates a NEW auth user with a generated password (confirmed, so they can
// sign in immediately) and emails the credentials. Used by application
// approval and manual member create. Signature/return unchanged from the old
// invite-link flow so callers don't change: `redirectTo` is now the login URL.
export async function sendInviteEmail(
  admin: Admin,
  args: { email: string; firstName?: string | null; redirectTo: string; heading?: string; intro?: string },
): Promise<InviteResult> {
  const password = generatePassword()
  const created = await admin.auth.admin.createUser({
    email: args.email,
    password,
    email_confirm: true,
  })
  if (created.error || !created.data?.user) {
    return {
      userId: created.data?.user?.id ?? null,
      emailSent: false,
      error: created.error?.message ?? 'Could not create the account',
    }
  }
  const r = await sendCredentialsMail(args.email, args.firstName, password, loginUrlFrom(args.redirectTo))
  return { userId: created.data.user.id, emailSent: r.sent, error: r.error }
}

// Resets an EXISTING member's password to a fresh temporary one and emails it.
// Used by the admin "Resend login" button for members who already have an
// account (imported, or approved on the existing-profile path).
export async function resetPasswordAndSendCredentials(
  admin: Admin,
  args: { userId: string; email: string; firstName?: string | null; redirectTo: string },
): Promise<InviteResult> {
  const password = generatePassword()
  const upd = await admin.auth.admin.updateUserById(args.userId, {
    password,
    email_confirm: true,
  })
  if (upd.error) {
    return { userId: args.userId, emailSent: false, error: upd.error.message }
  }
  const r = await sendCredentialsMail(args.email, args.firstName, password, loginUrlFrom(args.redirectTo))
  return { userId: args.userId, emailSent: r.sent, error: r.error }
}

// Callers historically pass `${origin}/set-password` as redirectTo. Under the
// password flow we point members at /login on the same origin instead.
function loginUrlFrom(redirectTo: string): string {
  try {
    const u = new URL(redirectTo)
    return `${u.origin}/login`
  } catch {
    return redirectTo
  }
}
