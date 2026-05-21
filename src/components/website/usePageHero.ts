'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface HeroSlide {
  image_url: string
  alt_text: string
  overlay_text: string | null
}

/**
 * Loads the first active hero slide for a given page from Supabase.
 * Returns null until the request resolves; the caller is expected to render
 * a fallback image while loading and swap in the real image once it arrives.
 *
 * Usage:
 *   const heroOverride = usePageHero('about')
 *   const heroImage = heroOverride?.image_url ?? 'fallback-url'
 */
export function usePageHero(pageSlug: string): HeroSlide | null {
  const [hero, setHero] = useState<HeroSlide | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('hero_slides')
        .select('image_url, alt_text, overlay_text')
        .eq('page_slug', pageSlug)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!cancelled && data) setHero(data)
    })()
    return () => {
      cancelled = true
    }
  }, [pageSlug])

  return hero
}
