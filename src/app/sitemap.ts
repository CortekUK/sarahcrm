import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { listPublishedBlogPosts } from '@/lib/cms/blog'

// /sitemap.xml — static public pages plus every published event and
// published gallery (and Journal posts). Reads as an anonymous visitor (no
// cookies, so it can be built statically and revalidated hourly) — RLS
// decides what is public.
// Fail-soft: if a query errors, the static pages are still listed.

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://theclubgroup.co').replace(/\/+$/, '')

export const revalidate = 3600

const STATIC_PAGES: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '', priority: 1, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/memberships', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/membership-application', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/events', priority: 0.9, changeFrequency: 'daily' },
  { path: '/gallery', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/private-event-services', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/one-london-road', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/concierge', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/rewards', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/reviews', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/share-your-experience', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/blog', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/contact-us', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/club-rules', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/privacy-policy', priority: 0.3, changeFrequency: 'yearly' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    )
    const [{ data: events }, { data: galleries }] = await Promise.all([
      supabase
        .from('events')
        .select('slug, updated_at, start_date')
        .in('status', ['published', 'live', 'completed'])
        .not('slug', 'is', null)
        .order('start_date', { ascending: false })
        .limit(1000),
      supabase
        .from('galleries')
        .select('slug, updated_at')
        .eq('is_published', true)
        .limit(1000),
    ])
    for (const e of events ?? []) {
      if (!e.slug) continue
      const upcoming = e.start_date ? new Date(e.start_date) >= now : false
      entries.push({
        url: `${SITE_URL}/events/${e.slug}`,
        lastModified: e.updated_at ? new Date(e.updated_at) : now,
        changeFrequency: upcoming ? 'weekly' : 'yearly',
        priority: upcoming ? 0.8 : 0.4,
      })
    }
    for (const g of galleries ?? []) {
      if (!g.slug) continue
      entries.push({
        url: `${SITE_URL}/gallery/${g.slug}`,
        lastModified: g.updated_at ? new Date(g.updated_at) : now,
        changeFrequency: 'monthly',
        priority: 0.5,
      })
    }
  } catch (e) {
    console.error('[sitemap] event/gallery lookup failed', e)
  }

  const posts = await listPublishedBlogPosts(500)
  for (const post of posts) {
    entries.push({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.published_at ? new Date(post.published_at) : now,
      changeFrequency: 'monthly',
      priority: 0.5,
    })
  }

  return entries
}
