// Branded invite / set-password email — sent via Resend, NOT Supabase's
// built-in mailer. We ask Supabase to GENERATE the action link (which also
// creates the auth user) but NOT send it, then deliver our own premium
// branded email through Resend. This keeps every email on-brand and on one
// sending pipeline.

import type { SupabaseClient } from '@supabase/supabase-js'
import { renderClubEmail, sendClubEmail } from './club-email'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

export interface InviteResult {
  userId: string | null
  emailSent: boolean
  error?: string
}

// Generates an invite link (creating the auth user) and emails it via
// Resend with the branded "welcome — set your password" template.
export async function sendInviteEmail(
  admin: Admin,
  args: { email: string; firstName?: string | null; redirectTo: string; heading?: string; intro?: string },
): Promise<InviteResult> {
  const gen = await admin.auth.admin.generateLink({
    type: 'invite',
    email: args.email,
    options: { redirectTo: args.redirectTo },
  })
  if (gen.error || !gen.data?.properties?.action_link || !gen.data.user) {
    return { userId: gen.data?.user?.id ?? null, emailSent: false, error: gen.error?.message ?? 'Could not generate invite link' }
  }

  const link = gen.data.properties.action_link
  const name = args.firstName || 'there'
  const html = renderClubEmail({
    eyebrow: 'Welcome',
    heading: args.heading ?? 'Welcome to The Club.',
    paragraphs: [
      `Hello ${name},`,
      args.intro ??
        `We're delighted to welcome you. To get started, set your password and sign in to your members area — your home for events, introductions and everything The Club offers.`,
      `For your security, this link is unique to you. If you didn't expect this email, you can simply ignore it.`,
    ],
    cta: { label: 'Set your password', url: link },
  })

  const r = await sendClubEmail({
    to: args.email,
    subject: 'Welcome to The Club — set your password',
    html,
  })
  return { userId: gen.data.user.id, emailSent: r.sent, error: r.error }
}
