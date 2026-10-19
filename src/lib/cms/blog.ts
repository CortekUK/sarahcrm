// Server-side readers for the public website blog ("The Journal").
//
// Posts are written by the Marketing AI Engine's BlogPublisher
// (src/lib/marketing/publish/blog.ts) when an admin approves a seo_blog /
// recap_blog asset, and live in public.blog_posts. RLS lets anyone read rows
// with status = 'published' — so these readers use a plain, cookie-free anon
// client (keeps /blog cacheable with `revalidate`). blog_posts isn't in the generated Database types yet,
// hence the untyped client + local row type. The ONE exception is the linked
// event on an article, which is read the same way the public event pages read
// events (cookie-aware server client + public status filter — see below); like
// those pages, that makes /blog/[slug] render per request, with revalidate as
// the cache window.
//
// Every reader is fail-soft: an error (e.g. the migration not applied yet)
// returns an empty list / null, so the public site never crashes.

import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// The statuses the public event pages show (/events listing + past-events
// archive, /events/[slug]) — never planning / draft / cancelled. Recap blogs
// are about finished events, so 'completed' must be included.
const PUBLIC_EVENT_STATUSES = ['published', 'live', 'completed'] as const

export interface BlogPostSummary {
  id: string
  slug: string
  title: string
  excerpt: string | null
  hero_image_url: string | null
  published_at: string | null
}

export interface BlogPost extends BlogPostSummary {
  body_html: string
  event: { title: string; slug: string } | null
}

function anonClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\s+/g, ''),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim().replace(/\s+/g, ''),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function listPublishedBlogPosts(limit = 60): Promise<BlogPostSummary[]> {
  try {
    const { data, error } = await anonClient()
      .from('blog_posts')
      .select('id, slug, title, excerpt, hero_image_url, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[cms/blog] list failed:', error.message)
      return []
    }
    return (data ?? []) as BlogPostSummary[]
  } catch (e) {
    console.error('[cms/blog] list failed:', e)
    return []
  }
}

// cache() de-duplicates the call between generateMetadata and the page.
export const getPublishedBlogPost = cache(async (slug: string): Promise<BlogPost | null> => {
  try {
    const supabase = anonClient()
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, slug, title, excerpt, hero_image_url, published_at, body_html, event_id')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
    if (error || !data) {
      if (error) console.error('[cms/blog] get failed:', error.message)
      return null
    }

    // Linked event — read EXACTLY like the public event pages do
    // (src/app/(public)/events/[slug]/page.tsx, events/page.tsx): the
    // cookie-aware anon server client + the explicit public status filter,
    // public-safe columns only. So the link appears iff /events/<slug> would
    // render for this visitor (incl. completed events) — never a link to a 404.
    let event: BlogPost['event'] = null
    if (data.event_id) {
      const eventsClient = await createServerClient()
      const { data: ev } = await eventsClient
        .from('events')
        .select('title, slug')
        .eq('id', data.event_id as string)
        .in('status', PUBLIC_EVENT_STATUSES)
        .maybeSingle()
      if (ev?.slug) event = { title: ev.title, slug: ev.slug }
    }

    return {
      id: data.id as string,
      slug: data.slug as string,
      title: data.title as string,
      excerpt: (data.excerpt as string | null) ?? null,
      hero_image_url: (data.hero_image_url as string | null) ?? null,
      published_at: (data.published_at as string | null) ?? null,
      body_html: (data.body_html as string | null) ?? '',
      event,
    }
  } catch (e) {
    console.error('[cms/blog] get failed:', e)
    return null
  }
})

export function formatBlogDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(iso),
    )
  } catch {
    return null
  }
}
