// Onboarding emails — sent via Resend, NOT Supabase's built-in mailer.
//
// No password ever goes in an email. We ask Supabase (admin generateLink) for
// a ONE-TIME set-password link — `invite` for a new account, `recovery` for an
// existing one — and send it in the branded shell. The link verifies with
// Supabase and lands on /set-password (SetPasswordPage reads the session from
// the URL hash; AuthHashRedirect forwards it there if it lands elsewhere),
// where the person chooses their own password. The link is single-use and
// expires per the project's email OTP expiry.
//
// The redirect target is always built from the fixed site URL (siteUrl()),
// never from the caller's request origin. `${siteUrl()}/set-password` must be
// in Supabase Auth → URL Configuration → Redirect URLs.

import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeHtml, renderClubEmail, sendClubEmail } from './club-email'
import { siteUrl } from './site-url'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

export interface InviteResult {
  userId: string | null
  emailSent: boolean
  error?: string
}

type Audience = 'member' | 'staff'

// Staff invites historically pass an explicit `loginUrl` (the staff sign-in);
// member invites never do. `audience` makes it explicit for new callers.
function audienceOf(args: { audience?: Audience; loginUrl?: string }): Audience {
  if (args.audience) return args.audience
  return args.loginUrl ? 'staff' : 'member'
}

function setPasswordRedirect(): string {
  return `${siteUrl()}/set-password`
}

// Renders + sends the branded "set your password" email.
async function sendSetPasswordMail(args: {
  email: string
  firstName: string | null | undefined
  actionLink: string
  audience: Audience
  heading?: string
  intro?: string
}): Promise<{ sent: boolean; error?: string }> {
  const name = escapeHtml(args.firstName || 'there')
  const staff = args.audience === 'staff'
  const intro =
    args.intro ??
    (staff
      ? 'Your staff account for The Club’s team workspace is ready. Use the button below to choose your password — you’ll then go straight to your team workspace.'
      : 'Your members account is ready. Use the button below to choose your password and sign in to your members area — your home for events, introductions and everything The Club offers.')
  const after = staff
    ? `After that, sign in any time at ${escapeHtml(`${siteUrl()}/admin/login`)}.`
    : `After that, sign in any time at ${escapeHtml(`${siteUrl()}/login`)}.`
  const html = renderClubEmail({
    eyebrow: staff ? 'The Club · team' : 'Welcome',
    heading: args.heading ?? (staff ? 'Set up your staff account' : 'Set up your Club account'),
    paragraphs: [
      `Hello ${name},`,
      intro,
      `This link works once and expires soon for your security. ${after} If you didn't expect this email, you can simply ignore it.`,
    ],
    cta: { label: 'Set your password', url: args.actionLink },
    ctaAfterIndex: 2,
    signoff: staff ? 'The Club platform' : undefined,
  })
  const r = await sendClubEmail({
    to: args.email,
    subject: staff ? 'Set up your Club staff account' : 'Set up your Club account',
    html,
    category: staff ? 'staff_invite' : 'member_invite',
  })
  return { sent: r.sent, error: r.error }
}

// Creates a NEW auth user via a one-time invite link and emails that link.
// Used by application approval, manual member/rep create, import and staff
// create. Signature/return unchanged so callers don't change; `redirectTo` /
// `loginUrl` are accepted for compatibility, but links are always built from
// the fixed site URL (a passed `loginUrl` marks the invite as a STAFF invite).
export async function sendInviteEmail(
  admin: Admin,
  args: {
    email: string
    firstName?: string | null
    redirectTo: string
    heading?: string
    intro?: string
    loginUrl?: string
    audience?: Audience
  },
): Promise<InviteResult> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: args.email,
    options: { redirectTo: setPasswordRedirect() },
  })
  const userId = data?.user?.id ?? null
  const actionLink = data?.properties?.action_link
  if (error || !userId || !actionLink) {
    return {
      userId,
      emailSent: false,
      error: error?.message ?? 'Could not create the account',
    }
  }
  const r = await sendSetPasswordMail({
    email: args.email,
    firstName: args.firstName,
    actionLink,
    audience: audienceOf(args),
    heading: args.heading,
    intro: args.intro,
  })
  return { userId, emailSent: r.sent, error: r.error }
}

// Emails an EXISTING account a fresh one-time set-password (recovery) link.
// Used by the admin "Resend login" buttons. The current password is left
// untouched — nothing is reset until the person uses the link.
export async function resetPasswordAndSendCredentials(
  admin: Admin,
  args: {
    userId: string
    email: string
    firstName?: string | null
    redirectTo: string
    loginUrl?: string
    audience?: Audience
  },
): Promise<InviteResult> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: args.email,
    options: { redirectTo: setPasswordRedirect() },
  })
  const actionLink = data?.properties?.action_link
  if (error || !actionLink) {
    return { userId: args.userId, emailSent: false, error: error?.message ?? 'Could not create a sign-in link' }
  }
  const r = await sendSetPasswordMail({
    email: args.email,
    firstName: args.firstName,
    actionLink,
    audience: audienceOf(args),
    heading: 'Set a new password',
    intro: 'Here is a fresh link to choose your password and get back into your account.',
  })
  return { userId: args.userId, emailSent: r.sent, error: r.error }
}
