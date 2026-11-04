// Server-side readers for the public Portfolio (replaces Gallery).
//
// Rows live in public.portfolio_case_studies (migration
// 20261106_a_website_rebuild_schema.sql). RLS lets anyone read rows with
// is_published = true, so a plain cookie-free anon client is enough and keeps
// /portfolio cacheable with `revalidate`. The table isn't in the generated
// Database types yet, hence the untyped client + local row type.
//
// Every reader is fail-soft: an error (e.g. the migration not applied yet)
// returns an empty list / null so the public site never crashes.

import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'

import {
  type CaseStudy,
  type CaseStudySummary,
  type PortfolioCategory,
  type PortfolioResult,
  youTubeId,
} from './portfolio-shared'

export * from './portfolio-shared'

const SUMMARY_COLUMNS =
  'id, slug, title, partner_names, category, location, event_date, date_label, headline_result, hero_image_url, layout, display_order, is_featured'

function anonClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\s+/g, ''),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim().replace(/\s+/g, ''),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

function toSummary(r: Record<string, unknown>): CaseStudySummary {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    partner_names: (r.partner_names as string | null) ?? null,
    category: (r.category as PortfolioCategory) ?? 'member_event',
    location: (r.location as string | null) ?? null,
    event_date: (r.event_date as string | null) ?? null,
    date_label: (r.date_label as string | null) ?? null,
    headline_result: (r.headline_result as string | null) ?? null,
    hero_image_url: (r.hero_image_url as string | null) ?? null,
    layout: r.layout === 'full' ? 'full' : 'half',
    display_order: Number(r.display_order ?? 0),
    is_featured: Boolean(r.is_featured),
  }
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
}

function asResults(v: unknown): PortfolioResult[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>
      return { figure: String(o.figure ?? '').trim(), label: String(o.label ?? '').trim() }
    })
    .filter((x) => x.figure !== '' || x.label !== '')
}

/** Published case studies, in the editor's order. */
export async function listCaseStudies(): Promise<CaseStudySummary[]> {
  try {
    const { data, error } = await anonClient()
      .from('portfolio_case_studies')
      .select(SUMMARY_COLUMNS)
      .eq('is_published', true)
      .order('display_order', { ascending: true })
      .order('event_date', { ascending: false, nullsFirst: false })
    if (error) {
      console.error('[cms/portfolio] list failed:', error.message)
      return []
    }
    return ((data ?? []) as Record<string, unknown>[]).map(toSummary)
  } catch (e) {
    console.error('[cms/portfolio] list failed:', e)
    return []
  }
}

/** Homepage "Recent Nights": the top featured case studies (default four). */
export async function listFeaturedCaseStudies(limit = 4): Promise<CaseStudySummary[]> {
  try {
    const { data, error } = await anonClient()
      .from('portfolio_case_studies')
      .select(SUMMARY_COLUMNS)
      .eq('is_published', true)
      .eq('is_featured', true)
      .order('display_order', { ascending: true })
      .limit(limit)
    if (error) {
      console.error('[cms/portfolio] featured failed:', error.message)
      return []
    }
    return ((data ?? []) as Record<string, unknown>[]).map(toSummary)
  } catch (e) {
    console.error('[cms/portfolio] featured failed:', e)
    return []
  }
}

/** Published case studies by slug (order kept), e.g. for Success Stories / Partner pages. */
export async function listCaseStudiesBySlugs(slugs: string[]): Promise<CaseStudySummary[]> {
  if (slugs.length === 0) return []
  try {
    const { data, error } = await anonClient()
      .from('portfolio_case_studies')
      .select(SUMMARY_COLUMNS)
      .eq('is_published', true)
      .in('slug', slugs)
    if (error) {
      console.error('[cms/portfolio] by slugs failed:', error.message)
      return []
    }
    const rows = ((data ?? []) as Record<string, unknown>[]).map(toSummary)
    return slugs.map((s) => rows.find((r) => r.slug === s)).filter((r): r is CaseStudySummary => !!r)
  } catch (e) {
    console.error('[cms/portfolio] by slugs failed:', e)
    return []
  }
}

// cache() de-duplicates the call between generateMetadata and the page.
export const getCaseStudy = cache(async (slug: string): Promise<CaseStudy | null> => {
  try {
    const { data, error } = await anonClient()
      .from('portfolio_case_studies')
      .select(
        `${SUMMARY_COLUMNS}, hero_video_url, brief, delivered, results, gallery_urls, partner_quote, partner_quote_by, event_id`,
      )
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()
    if (error || !data) {
      if (error) console.error('[cms/portfolio] get failed:', error.message)
      return null
    }
    const r = data as Record<string, unknown>
    return {
      ...toSummary(r),
      hero_video_url: (r.hero_video_url as string | null) ?? null,
      brief: (r.brief as string | null) ?? null,
      delivered: asStringArray(r.delivered),
      results: asResults(r.results),
      gallery_urls: asStringArray(r.gallery_urls),
      partner_quote: (r.partner_quote as string | null) ?? null,
      partner_quote_by: (r.partner_quote_by as string | null) ?? null,
      event_id: (r.event_id as string | null) ?? null,
    }
  } catch (e) {
    console.error('[cms/portfolio] get failed:', e)
    return null
  }
})

export interface PortfolioFilm {
  id: string
  youtube_url: string
  title: string
}

// The Video Gallery's four films (Curated Luxury Event; Lamborghini;
// Grantley Hall Bonfire Night; Members Evening Highlights) were managed
// under the old Private Events page. They move here with Portfolio; the
// 'portfolio' slug is read too so the films can be re-filed in the CMS.
const FILM_PAGE_SLUGS = ['portfolio', 'private-events', 'private-event-services']

export async function listPortfolioFilms(): Promise<PortfolioFilm[]> {
  try {
    const { data, error } = await anonClient()
      .from('video_gallery')
      .select('id, youtube_url, title, page_slug, display_order')
      .eq('is_active', true)
      .in('page_slug', FILM_PAGE_SLUGS)
      .order('display_order', { ascending: true })
    if (error) {
      console.error('[cms/portfolio] films failed:', error.message)
      return []
    }
    // One entry per video — the same film can be filed under two slugs.
    const seen = new Set<string>()
    const out: PortfolioFilm[] = []
    for (const r of (data ?? []) as { id: string; youtube_url: string; title: string }[]) {
      const key = youTubeId(r.youtube_url) ?? r.youtube_url
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ id: r.id, youtube_url: r.youtube_url, title: r.title })
    }
    return out
  } catch (e) {
    console.error('[cms/portfolio] films failed:', e)
    return []
  }
}
