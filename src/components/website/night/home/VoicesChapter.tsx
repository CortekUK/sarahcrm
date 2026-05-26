import { createClient } from '@/lib/supabase/server'
import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { VoicesCarousel, type CarouselTestimonial } from './VoicesCarousel'

// Member testimonials chapter. Server component — reads real rows from
// `public.testimonials` (managed at /dashboard/website/testimonials).
//
// Real-data-only: when zero active testimonials exist, the whole
// section is hidden from the homepage rather than showing fabricated
// placeholder quotes. Adding a testimonial in the dashboard makes the
// section appear on the next public render (revalidate=60 or via the
// /api/admin/revalidate hook fired from the admin save flow).

export async function VoicesChapter() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('testimonials')
    .select('id, person_name, person_title, company_name, quote_text')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  const testimonials: CarouselTestimonial[] = data ?? []

  // No real testimonials yet → don't render the section. Hardcoded
  // placeholder quotes attributed to invented people would be a brand
  // (and ethical) failure on a private members club site.
  if (testimonials.length === 0) return null

  return (
    // always-night — the carousel uses ivory text + bronze hairlines that
    // only read on a dark surface. Without this the section flips to a
    // cream background in day mode and the quote text becomes invisible.
    <Chapter density="tight" bg="graphite" className="always-night">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <EditorialMeta label="In Their Own Words" align="center" />
        <h2 className="display-md mt-8 text-ivory">Members&apos; Voices.</h2>
      </div>

      <VoicesCarousel testimonials={testimonials} />
    </Chapter>
  )
}
