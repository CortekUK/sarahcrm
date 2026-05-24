import { createClient } from '@/lib/supabase/server'
import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { VoicesCarousel, type CarouselTestimonial } from './VoicesCarousel'

// Member testimonials chapter. Server component — fetches from
// public.testimonials, falls back to placeholder data so the layout
// can be previewed before real testimonials are entered. The actual
// rotating display is handled by <VoicesCarousel /> (client).

// PLACEHOLDER testimonials — three clearly invented names + roles +
// generic-but-readable quote text. Replace via the dashboard at
// /dashboard/website/testimonials when real, permissioned member
// quotes are available.
const PLACEHOLDER_TESTIMONIALS: CarouselTestimonial[] = [
  {
    id: 'placeholder-1',
    person_name: 'Alexandra Cole',
    person_title: 'Chief Executive',
    company_name: 'Linwood & Co.',
    quote_text:
      'Each evening has been considered, each room quietly the right one. That is rarer than it should be — and it is the entire reason we keep coming back.',
  },
  {
    id: 'placeholder-2',
    person_name: 'Marcus Bell',
    person_title: 'Founding Partner',
    company_name: 'North Bridge Capital',
    quote_text:
      'The introductions have been thoughtful and entirely without agenda. Three of the most important relationships of the last few years began at one of these dinners.',
  },
  {
    id: 'placeholder-3',
    person_name: 'Sophie Linwood',
    person_title: 'Director of Strategy',
    company_name: 'Aurelia Group',
    quote_text:
      'A members club that doesn\'t feel like one. Curated, useful, and intentionally small — the standard is set by the room, not the brochure.',
  },
]

export async function VoicesChapter() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('testimonials')
    .select('id, person_name, person_title, company_name, quote_text')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  // Use real DB rows when present; otherwise show placeholders so the
  // layout is visible during development.
  const testimonials: CarouselTestimonial[] =
    data && data.length > 0 ? data : PLACEHOLDER_TESTIMONIALS

  return (
    <Chapter density="tight" bg="graphite">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <EditorialMeta label="In Their Own Words" align="center" />
        <h2 className="display-md mt-8 text-ivory">Members&apos; Voices.</h2>
      </div>

      <VoicesCarousel testimonials={testimonials} />
    </Chapter>
  )
}
