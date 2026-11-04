import type { MetadataRoute } from 'next'
import { HARRODS_APPROVED } from '@/components/website/night/london/content'
import { createClient } from '@supabase/supabase-js'

// /sitemap.xml — static public pages plus every published PUBLIC event,
// published Portfolio case study and public Journal post. Reads as an anonymous visitor (no
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
  { path: '/pitch', priority: 0.8, changeFrequency: 'weekly' },
  ...(HARRODS_APPROVED ? [{ path: '/london-series', priority: 0.8, changeFrequency: 'monthly' as const }] : []),
  { path: '/concierge', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/partner', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/partner/sponsorship', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/partner/venues', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/partner/corporate-events', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/portfolio', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/rewards', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/success-stories', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/journal', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/share-your-experience', priority: 0.4, changeFrequency: 'yearly' },
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
    const [{ data: events }, { data: cases }, { data: posts }] = await Promise.all([
      supabase
        .from('events')
        .select('slug, updated_at, start_date')
        .in('status', ['published', 'live', 'completed'])
        .eq('visibility', 'public')
        .not('slug', 'is', null)
        .order('start_date', { ascending: false })
        .limit(1000),
      supabase
        .from('portfolio_case_studies')
        .select('slug, updated_at')
        .eq('is_published', true)
        .limit(1000),
      supabase
        .from('blog_posts')
        .select('slug, published_at')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .order('published_at', { ascending: false })
        .limit(500),
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
    for (const c of cases ?? []) {
      if (!c.slug) continue
      entries.push({
        url: `${SITE_URL}/portfolio/${c.slug}`,
        lastModified: c.updated_at ? new Date(c.updated_at) : now,
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    }
    for (const post of posts ?? []) {
      if (!post.slug) continue
      entries.push({
        url: `${SITE_URL}/journal/${post.slug}`,
        lastModified: post.published_at ? new Date(post.published_at) : now,
        changeFrequency: 'monthly',
        priority: 0.5,
      })
    }
  } catch (e) {
    console.error('[sitemap] event/portfolio/journal lookup failed', e)
  }

  return entries
}
