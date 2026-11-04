import type { SupabaseClient } from '@supabase/supabase-js'
import { renderClubEmail, sendClubEmail } from './club-email'
import { siteUrl } from './site-url'

// Admin alerts only ever link into our own app. Re-base whatever URL the
// caller built onto the fixed site URL (keeping just its path/query), so a
// link derived from a spoofed Origin/Host header can't point staff elsewhere.
function ownAppUrl(url: string): string {
  try {
    const u = new URL(url, siteUrl())
    return `${siteUrl()}${u.pathname}${u.search}${u.hash}`
  } catch {
    return `${siteUrl()}/dashboard`
  }
}

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
      cta: args.ctaUrl ? { url: ownAppUrl(args.ctaUrl), label: args.ctaLabel ?? 'Open dashboard' } : undefined,
      signoff: 'The Club platform',
    })
    await Promise.all(
      emails.map((to) => sendClubEmail({ to, subject: args.subject, html })),
    )
  } catch (e) {
    console.error('[notifyAdmins] failed:', e)
  }
}
