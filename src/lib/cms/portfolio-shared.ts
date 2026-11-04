// Portfolio types + pure helpers, safe to import from client components
// (no Supabase client in here). Server readers live in ./portfolio.ts.

export type PortfolioCategory =
  | 'member_event'
  | 'brand_activation'
  | 'curated_experience'
  | 'private_corporate'
  | 'pitch'

// Filter chips, in the brief's order.
export const PORTFOLIO_CATEGORIES: { value: PortfolioCategory; label: string }[] = [
  { value: 'member_event', label: 'Member Events' },
  { value: 'brand_activation', label: 'Brand Activations' },
  { value: 'curated_experience', label: 'Curated Experiences' },
  { value: 'private_corporate', label: 'Private & Corporate' },
  { value: 'pitch', label: 'PITCH' },
]

export function portfolioCategoryLabel(value: string | null | undefined): string {
  return PORTFOLIO_CATEGORIES.find((c) => c.value === value)?.label ?? 'Portfolio'
}

export interface PortfolioResult {
  figure: string
  label: string
}

export interface CaseStudySummary {
  id: string
  slug: string
  title: string
  partner_names: string | null
  category: PortfolioCategory
  location: string | null
  event_date: string | null
  date_label: string | null
  headline_result: string | null
  hero_image_url: string | null
  layout: 'full' | 'half'
  display_order: number
  is_featured: boolean
}

export interface CaseStudy extends CaseStudySummary {
  hero_video_url: string | null
  brief: string | null
  delivered: string[]
  results: PortfolioResult[]
  gallery_urls: string[]
  partner_quote: string | null
  partner_quote_by: string | null
  event_id: string | null
}

export function youTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

/** "Sep 2025" / "12 months" first; otherwise the event date as "Month YYYY". */
export function caseStudyWhen(cs: Pick<CaseStudySummary, 'date_label' | 'event_date'>): string | null {
  if (cs.date_label) return cs.date_label
  if (!cs.event_date) return null
  try {
    return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'Europe/London' }).format(
      new Date(cs.event_date),
    )
  } catch {
    return null
  }
}
