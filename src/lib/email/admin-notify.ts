import type { SupabaseClient } from '@supabase/supabase-js'
import { renderClubEmail, sendClubEmail } from './club-email'

// Internal "something needs your attention" emails to the team — new
// applications, new bookings, etc. Sends the branded shell to every admin
// profile. Best-effort: failures are swallowed so they never break the
// member-facing flow that triggered them.
export async function notifyAdmins(
  admin: SupabaseClient,
  args: { subject: string; heading: string; paragraphs: string[]; ctaUrl?: string; ctaLabel?: string },
): Promise<void> {
  try {
    const { data } = await admin.from('profiles').select('email').eq('role', 'admin')
    const emails = (data ?? [])
      .map((p: { email: string | null }) => p.email)
      .filter((e): e is string => !!e)
    if (emails.length === 0) return

    const html = renderClubEmail({
      eyebrow: 'The Club · admin',
      heading: args.heading,
      paragraphs: args.paragraphs,
      cta: args.ctaUrl ? { url: args.ctaUrl, label: args.ctaLabel ?? 'Open dashboard' } : undefined,
      signoff: 'The Club platform',
    })
    await Promise.all(
      emails.map((to) => sendClubEmail({ to, subject: args.subject, html })),
    )
  } catch (e) {
    console.error('[notifyAdmins] failed:', e)
  }
}
