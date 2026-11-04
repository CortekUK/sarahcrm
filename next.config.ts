import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  // Load these from node_modules instead of bundling them. jsdom (pulled in by
  // isomorphic-dompurify for server-side HTML sanitising) reads a data file via
  // its own __dirname; webpack bundling mangles that path, so at build/export
  // time it fails with ENOENT on browser/default-stylesheet.css. Keeping them
  // external preserves the correct resolution.
  serverExternalPackages: ['jsdom', 'isomorphic-dompurify'],
  // The admin Help Assistant reads its knowledge base from docs/knowledge/ at
  // request time. Those markdown files are never imported, so Next's tracer
  // cannot infer the dependency — list them explicitly or the route 404s its
  // own corpus in production.
  outputFileTracingIncludes: {
    '/api/admin/help/chat': ['./docs/knowledge/**'],
  },
  // Old URLs → their new homes (Sarah's brief: Private Events and Gallery
  // are deleted; Event Services now lives on Concierge, past events on
  // Portfolio). Explicit 301 (Next.js `permanent` sends 308) so search engines move the ranking.
  async redirects() {
    return [
      { source: '/private-event-services', destination: '/concierge#event-services', statusCode: 301 },
      { source: '/gallery', destination: '/portfolio', statusCode: 301 },
      { source: '/gallery/:slug', destination: '/portfolio', statusCode: 301 },
    ]
  },
  // Members-only and staff areas must never be indexed (Sarah's brief:
  // "set noindex on member routes").
  async headers() {
    return ['/portal/:path*', '/dashboard/:path*', '/team/:path*', '/checkin/:path*'].map((source) => ({
      source,
      headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
    }))
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'plus.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
      {
        // Cloudinary — used for hero video poster + any other media we
        // host on their CDN. Free tier covers ~10GB/month bandwidth.
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
}

export default nextConfig
