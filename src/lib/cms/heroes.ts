// Server-side helper for fetching the active hero for a given page.
//
// Each public page calls `getPageHero('memberships')` etc. inside its
// async server component. The helper returns the row from hero_slides
// (display_order=0, is_active=true) merged with the hardcoded fallback
// for that page — so the public site never blanks even if the DB row
// is missing, has empty fields, or the Supabase fetch fails.
//
// The fallback is the source of truth for the editorial copy. The DB
// row only overrides fields that the admin has filled in. A blank
// admin field means "use the fallback" not "leave blank on screen".

import { createClient } from '@/lib/supabase/server'

export type HeroMediaType = 'image' | 'video'

export interface HeroData {
  page_slug: string
  media_type: HeroMediaType
  image_url: string | null
  alt_text: string
  video_url: string | null
  video_poster_url: string | null
  eyebrow: string | null
  headline: string | null
  lede: string | null
  cta_primary_label: string | null
  cta_primary_href: string | null
  cta_secondary_label: string | null
  cta_secondary_href: string | null
}

// Fallback shape — every field is optional and explicitly allows null
// (the row coming from Supabase has nullable columns). The `page_slug`
// is required because the resolver uses it as the canonical reference.
export type HeroFallback = {
  [K in keyof HeroData]?: HeroData[K]
} & {
  page_slug: string
}

/**
 * Fetch the active default hero (display_order=0) for a page and merge
 * with a fallback so callers always get a fully-populated object.
 *
 * Field-level merge — if the DB row has `headline = NULL`, the fallback's
 * headline shows, not blank. So admins can clear individual fields by
 * editing them, but they have to actively type an empty string + save
 * (the form coerces empty strings to NULL, so blank means "use default").
 */
export async function getPageHero(
  slug: string,
  fallback: HeroFallback,
): Promise<HeroData> {
  let row: HeroFallback | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('hero_slides')
      .select(
        'page_slug, media_type, image_url, alt_text, video_url, video_poster_url, eyebrow, headline, lede, cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href',
      )
      .eq('page_slug', slug)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (data) {
      // Cast to HeroFallback — the DB row's nullable-text columns line up
      // with the optional + null fields in HeroFallback. The media_type
      // column is plain text in the DB so we narrow it here.
      row = {
        ...data,
        media_type: (data.media_type as HeroMediaType) ?? 'image',
        alt_text: data.alt_text ?? undefined,
      } as HeroFallback
    }
  } catch {
    // Fetch errors fall through to fallback — never blank the page.
    row = null
  }

  // Resolve each field: DB row wins if non-null; otherwise fallback.
  const resolved: HeroData = {
    page_slug: slug,
    media_type: (row?.media_type as HeroMediaType) ?? fallback.media_type ?? 'image',
    image_url: row?.image_url ?? fallback.image_url ?? null,
    alt_text: row?.alt_text ?? fallback.alt_text ?? '',
    video_url: row?.video_url ?? fallback.video_url ?? null,
    video_poster_url: row?.video_poster_url ?? fallback.video_poster_url ?? null,
    eyebrow: row?.eyebrow ?? fallback.eyebrow ?? null,
    headline: row?.headline ?? fallback.headline ?? null,
    lede: row?.lede ?? fallback.lede ?? null,
    cta_primary_label: row?.cta_primary_label ?? fallback.cta_primary_label ?? null,
    cta_primary_href: row?.cta_primary_href ?? fallback.cta_primary_href ?? null,
    cta_secondary_label:
      row?.cta_secondary_label ?? fallback.cta_secondary_label ?? null,
    cta_secondary_href: row?.cta_secondary_href ?? fallback.cta_secondary_href ?? null,
  }
  return resolved
}
