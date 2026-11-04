// The one fixed public base URL for links inside emails (CTAs, set-password,
// unsubscribe). Always from configuration — NEVER from request headers
// (Origin/Host are attacker-controlled, so a header-built link lets anyone
// make the club's emails point at their own site). Same precedence the
// automations + Stripe helpers already use. No trailing slash.
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL || 'https://sarahcrm.vercel.app'
  return raw.trim().replace(/\/+$/, '')
}
