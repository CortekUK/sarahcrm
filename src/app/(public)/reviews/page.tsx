import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import {
  VoicesCarousel,
  type CarouselTestimonial,
} from '@/components/website/night/home/VoicesCarousel'
import { getPageHero } from '@/lib/cms/heroes'
import { ArrowUpRight, Quote } from 'lucide-react'

export const revalidate = 60

// /reviews — public review gallery.
//
// Renders ONE unified carousel that merges:
//   1. Admin-curated testimonials (from `public.testimonials`) —
//      the same source the homepage Members' Voices section reads.
//   2. Approved + active user reviews (from `public.reviews`) —
//      submitted via /share-your-experience and moderated in
//      /dashboard/reviews.
//
// Both sources are coerced into the CarouselTestimonial shape and
// passed to <VoicesCarousel /> together — visitors don't see a
// distinction between "official" testimonials and "user" reviews;
// they're all voices.
//
// Real-data only: when both sources are empty the gallery renders a
// tasteful prompt CTA pointing visitors to the submission form
// instead.

interface TestimonialRow {
  id: string
  person_name: string
  person_title: string | null
  company_name: string | null
  quote_text: string
}

interface ReviewRow {
  id: string
  first_name: string
  last_name: string
  company: string | null
  title: string | null
  body: string
}

const HERO_FALLBACK = {
  page_slug: 'reviews',
  media_type: 'image' as const,
  image_url: '/gallery/land1.png',
  alt_text: 'A members evening',
  video_url: null,
  video_poster_url: null,
  eyebrow: 'Reviews',
  headline: 'In our members’ words.',
  lede: 'A few real reflections from evenings shared.',
  cta_primary_label: null,
  cta_primary_href: null,
  cta_secondary_label: null,
  cta_secondary_href: null,
}

// Last-initial only on user reviews — they didn't consent to a
// last-name surface; the publishing model is editorial, not social.
function reviewerLabel(r: ReviewRow): string {
  const lastInitial = (r.last_name ?? '').trim().charAt(0).toUpperCase()
  return `${r.first_name}${lastInitial ? ` ${lastInitial}.` : ''}`
}

export default async function ReviewsPage() {
  const supabase = await createClient()

  const [testimonialsRes, reviewsRes, hero] = await Promise.all([
    supabase
      .from('testimonials')
      .select('id, person_name, person_title, company_name, quote_text')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('reviews')
      .select('id, first_name, last_name, company, title, body')
      .eq('status', 'approved')
      .eq('is_active', true)
      .order('approved_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    getPageHero('reviews', HERO_FALLBACK),
  ])

  const testimonials = (testimonialsRes.data ?? []) as TestimonialRow[]
  const reviews = (reviewsRes.data ?? []) as ReviewRow[]

  // Coerce both sources into a single CarouselTestimonial list. The
  // id prefix avoids collisions if a testimonial and a review ever
  // share the same UUID (and acts as a debugging breadcrumb).
  const voices: CarouselTestimonial[] = [
    ...testimonials.map((t) => ({
      id: `t:${t.id}`,
      person_name: t.person_name,
      person_title: t.person_title,
      company_name: t.company_name,
      quote_text: t.quote_text,
    })),
    ...reviews.map((r) => ({
      id: `r:${r.id}`,
      person_name: reviewerLabel(r),
      person_title: r.title,
      company_name: r.company,
      quote_text: r.body,
    })),
  ]

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative h-[60vh] min-h-[440px] w-full always-night overflow-hidden bg-ink">
        <PageHeroMedia
          mediaType={hero.media_type}
          imageUrl={hero.image_url}
          alt={hero.alt_text}
          videoUrl={hero.video_url}
          videoPosterUrl={hero.video_poster_url}
          overlay={0.55}
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-[45%] hero-fade-bottom pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-20">
          {hero.eyebrow && (
            <Reveal type="up" delay={0}>
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
                {hero.eyebrow}
              </p>
            </Reveal>
          )}
          {hero.headline && (
            <Reveal type="clip" delay={150}>
              <h1 className="display-xl max-w-4xl">{hero.headline}</h1>
            </Reveal>
          )}
          {hero.lede && (
            <Reveal type="up" delay={400}>
              <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.1875rem)] leading-[1.7] text-ivory-soft mt-6 max-w-2xl">
                {hero.lede}
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── Voices — merged carousel ─────────────────────────
           always-night because the carousel uses ivory text + bronze
           hairlines that only read on a dark surface. Same chapter
           treatment as the homepage Members' Voices section. */}
      {voices.length > 0 ? (
        <>
          <Chapter density="tight" bg="graphite" className="always-night">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <EditorialMeta label="In Their Own Words" align="center" />
              <h2 className="display-md mt-8 text-ivory">Members&apos; Voices.</h2>
            </div>

            <VoicesCarousel testimonials={voices} />
          </Chapter>

          {/* CTA in its own chapter that adapts to the active theme —
              cream block with dark editorial type in day mode, ink in
              night mode. Separated from the carousel above (which is
              pinned dark) so the visitor's "next step" doesn't read
              like a continuation of the dark island. */}
          <Chapter density="tight" bg="ink" className="relative">
            <div className="text-center max-w-2xl mx-auto">
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-4">
                Were you with us?
              </p>
              <h3 className="display-md text-text">
                Share your evening.
              </h3>
              <ShareReviewButton />
            </div>
          </Chapter>
        </>
      ) : (
        <Chapter density="tight" bg="ink" className="relative">
          <Aurora variant="soft" />
          <div className="relative z-10 max-w-2xl mx-auto">
            <EmptyState />
          </div>
        </Chapter>
      )}
    </>
  )
}

// Bronze pill CTA — same double-stroke pattern as the homepage Apply
// button. Used by the carousel-trailing block and the empty state.
function ShareReviewButton() {
  return (
    <Link
      href="/share-your-experience"
      className="group relative inline-block mt-8 transition-opacity duration-500"
    >
      <span className="block relative px-9 py-4 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
        <span
          aria-hidden
          className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover:border-ink/20"
        />
        <span
          aria-hidden
          className="absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out"
        />
        <span className="relative z-10 flex items-center gap-3 font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ivory group-hover:text-ink transition-colors duration-700">
          Share your review
          <ArrowUpRight
            size={14}
            strokeWidth={1.5}
            className="transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
          />
        </span>
      </span>
    </Link>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────
// Rendered only when both testimonials and approved reviews are empty.

function EmptyState() {
  return (
    <div className="text-center py-12 lg:py-16">
      <div className="w-14 h-14 mx-auto rounded-full border border-bronze/40 bg-bronze/10 flex items-center justify-center mb-6">
        <Quote size={22} strokeWidth={1.5} className="text-bronze-light" />
      </div>
      <h2 className="display-sm text-text mb-4">The first review is yours.</h2>
      <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-text-muted max-w-xl mx-auto leading-[1.7]">
        We&apos;ve only just opened this page for members and guests to share their reflections.
        If you&apos;ve been with us — be the first to write.
      </p>
      <ShareReviewButton />
    </div>
  )
}
