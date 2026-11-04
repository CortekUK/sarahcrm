import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardItem } from './blocks'

// Short case-study cards used on London Series, /partner/corporate-events
// (and available to Success Stories). Figures are The Club's own results
// from the brochure / London Series deck — no Harrods client data here.
// Each card links to its Portfolio page when a PUBLISHED
// portfolio_case_studies record matches (by slug / title keyword).

export interface CaseStudy {
  key: 'hr-owen' | 'brand-and-influence' | 'gleneagles'
  /** Lower-case keywords matched against portfolio slug / title. */
  match: string[]
  title: string
  meta: string
  body: string
  image: string
  imageAlt: string
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    key: 'hr-owen',
    match: ['hr-owen', 'hr owen'],
    title: 'HR Owen',
    meta: 'Membership, sponsorship and event activations · 12 months',
    body: 'Introductions that sell: £90k invested, returning 10x across twelve months of Member events, curated brand activations and experience drive and stay days. Three cars sold through The Club introductions, five more across Lotus, Maserati and Bentley.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/partner/case-hr-owen.jpg',
    imageAlt: 'A green Lamborghini at an HR Owen activation with The Club',
  },
  {
    key: 'brand-and-influence',
    match: ['brand-and-influence', 'brand-influence', 'brand & influence', 'brand and influence'],
    title: 'Brand & Influence',
    meta: 'Harvey Nichols Manchester · July 2026',
    body: 'A flagship in-conversation with Alexandra Shulman CBE: 60 guests, ten celebrities, a Manchester Evening News cover story and 22k+ social media hits.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/partner/case-brand-and-influence.jpg',
    imageAlt: 'Alexandra Shulman CBE in conversation at Brand & Influence',
  },
  {
    key: 'gleneagles',
    match: ['gleneagles'],
    title: 'Gleneagles',
    meta: 'Golf and hospitality · September 2025',
    body: 'Three days at Gleneagles for 130 of The Club’s guests, with partner brands woven through the programme: £1.5m in sales for Gleneagles across the three days.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/partner/case-gleneagles.jpg',
    imageAlt: 'Gleneagles seen through a window during The Club’s golf weekend',
  },
]

/**
 * Map case-study key → published Portfolio slug. Reads as the visitor
 * (RLS returns published rows only). Any error (e.g. the table isn't
 * migrated yet) → no links, cards still render.
 */
export async function portfolioSlugs(supabase: SupabaseClient): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabase
      .from('portfolio_case_studies')
      .select('slug, title')
      .eq('is_published', true)
      .limit(200)
    if (error || !data) return {}
    const out: Record<string, string> = {}
    for (const cs of CASE_STUDIES) {
      const hit = (data as { slug: string; title: string }[]).find((r) =>
        cs.match.some(
          (m) => r.slug.toLowerCase().includes(m) || (r.title ?? '').toLowerCase().includes(m),
        ),
      )
      if (hit) out[cs.key] = hit.slug
    }
    return out
  } catch {
    return {}
  }
}

export function caseStudyCards(
  keys: CaseStudy['key'][],
  slugs: Record<string, string>,
): CardItem[] {
  return keys
    .map((k) => CASE_STUDIES.find((c) => c.key === k)!)
    .map((c) => ({
      n: c.meta,
      title: c.title,
      body: c.body,
      image: c.image,
      imageAlt: c.imageAlt,
      href: slugs[c.key] ? `/portfolio/${slugs[c.key]}` : undefined,
    }))
}
