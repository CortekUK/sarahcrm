import type { MetadataRoute } from 'next'

// /robots.txt — the public marketing site is crawlable; the authenticated
// workspaces, API routes and one-off transactional pages are not.
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://theclubgroup.co').replace(/\/+$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard',
          '/portal',
          '/team',
          '/admin',
          '/login',
          '/set-password',
          '/checkin',
          '/sponsor',
          '/unsubscribe',
          '/events/*/success',
          '/membership-application/success',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
