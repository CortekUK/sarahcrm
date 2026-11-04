import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { Pill, SectionLabel } from '@/components/website/night/portfolio/Pill'
import { StoryQuotes, type StoryQuote } from '@/components/website/night/stories/StoryQuotes'
import { getPageHero } from '@/lib/cms/heroes'
import { listCaseStudiesBySlugs } from '@/lib/cms/portfolio'

const TITLE = 'Success Stories | The Club by Sarah Restrick'
const DESCRIPTION =
  'Proven commercial return from The Club: case studies, results and what The Club Members, partners and venues say.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/success-stories' },
  openGraph: { title: TITLE, description: DESCRIPTION },
}

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// /success-stories — replaces Testimonials (/reviews redirects here).
// The brochure's Section V, with real, permissioned quotes only.
//
//   01 Hero
//   02 Proven commercial return — ten stat tiles, verbatim from the brief
//   03 Case studies — four cards linking to their Portfolio pages
//   04 What our members say           — testimonials, type = member
//   05 What our partners and venues say — type = partner | venue
//   06 Share your experience — the existing moderated form
// ─────────────────────────────────────────────────────────────────────

// Verbatim from the brief (figure · label · detail).
// The £800k figure is pending Sarah's confirmation (brochure £800k vs
// PITCH decks £700k) — shown as the brief writes it.
const STATS: { figure: string; label: string; detail: string }[] = [
  { figure: '8 cars', label: 'Luxury car dealer', detail: 'Sold in 12 months, from £90k invested' },
  { figure: '£500k', label: 'Heritage jeweller', detail: 'One watch, one introduction' },
  { figure: '£10m', label: 'Private lender', detail: 'Loans referred, from £100k invested' },
  { figure: '£3m', label: 'Property developer', detail: 'From £50k invested' },
  { figure: '£1.5m', label: 'Property sourcing', detail: 'From £100k invested' },
  { figure: '£800k', label: 'Tech start-up', detail: 'Raised since PITCH' },
  { figure: '£100k', label: 'Luxury jeweller', detail: 'From £40k invested' },
  { figure: '£140k', label: 'Tennis event', detail: 'Profit from £35k invested' },
  { figure: '£50k', label: 'Interior design', detail: 'From £10k invested' },
  { figure: '30', label: 'Luxury concierge', detail: 'New clients introduced' },
]

// The four case studies, in the brief's order. Each links to its
// Portfolio page once that page is published; until then a short
// card from the brochure stands in (no unconfirmed figures).
const CASE_STUDIES: {
  slug: string
  title: string
  eyebrow: string
  line: string
  image: string
  fallbackHref: string
}[] = [
  {
    slug: 'hr-owen-activations',
    title: 'Introductions that sell',
    eyebrow: 'HR Owen',
    line: '3 Lamborghinis and 5 cars across Lotus, Maserati and Bentley, from £90k invested.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/hr-owen-lamborghini.jpg',
    fallbackHref: '/portfolio',
  },
  {
    slug: 'pitch-co-op-live-bentley-lounge',
    title: 'From one pitch to investment',
    eyebrow: 'PITCH × Parced IO',
    line: '£600k raised directly through investors introduced by The Club.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/pitch-parced-erin-short.jpg',
    fallbackHref: '/pitch',
  },
  {
    slug: 'brand-and-influence-harvey-nichols-manchester',
    title: 'Brand & Influence',
    eyebrow: 'Harvey Nichols Manchester',
    line: '60 attendees, 10 celebrities and a Manchester Evening News cover story.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/brand-influence-harvey-nichols.jpg',
    fallbackHref: '/portfolio',
  },
  {
    slug: 'gleneagles-golf-tennis-hospitality',
    title: 'Three days at Gleneagles, and what it sold',
    eyebrow: 'Gleneagles',
    line: '£1.5m in sales for Gleneagles across three days.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/gleneagles-hotel.jpg',
    fallbackHref: '/portfolio',
  },
]

const HERO_FALLBACK = {
  page_slug: 'success-stories',
  media_type: 'image' as const,
  image_url: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/hr-owen-drive-day.jpg',
  alt_text: 'A guest at the wheel during a drive day with The Club',
  eyebrow: 'Success Stories',
  headline: 'Proof, measured by the right introduction.',
  lede: 'Commercial return, case studies and track record, in the words of The Club Members, partners and venues.',
}

interface TestimonialRow extends StoryQuote {
  testimonial_type: string
}

export default async function SuccessStoriesPage() {
  const supabase = await createClient()
  const [testimonialsRes, published, hero] = await Promise.all([
    supabase
      .from('testimonials')
      .select('id, person_name, person_title, company_name, quote_text, photo_url, testimonial_type')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    listCaseStudiesBySlugs(CASE_STUDIES.map((c) => c.slug)),
    getPageHero('success-stories', HERO_FALLBACK),
  ])

  const testimonials = (testimonialsRes.data ?? []) as TestimonialRow[]
  const memberQuotes = testimonials.filter((t) => t.testimonial_type === 'member')
  const partnerQuotes = testimonials.filter((t) => t.testimonial_type === 'partner' || t.testimonial_type === 'venue')
  const publishedSlugs = new Set(published.map((p) => p.slug))

  return (
    <>
      {/* ── 01 · Hero ─────────────────────────────────────────── */}
      <section className="relative min-h-[70vh] w-full always-night overflow-hidden bg-ink">
        <PageHeroMedia
          mediaType={hero.media_type}
          imageUrl={hero.image_url}
          alt={hero.alt_text}
          videoUrl={hero.video_url}
          videoPosterUrl={hero.video_poster_url}
          overlay={0.6}
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-[55%] hero-fade-bottom pointer-events-none" />
        <div className="relative z-10 min-h-[70vh] max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pt-32 pb-20">
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

      {/* ── 02 · Proven commercial return ─────────────────────── */}
      <Chapter density="tight" bg="ink">
        <div className="max-w-[1400px] mx-auto">
          <SectionLabel>Proof · Measured by the right introduction</SectionLabel>
          <Reveal type="clip" delay={0}>
            <h2 className="display-md mb-10 lg:mb-14">
              Proven <em className="text-bronze-light">commercial return</em>
            </h2>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-graphite-line/50 border border-graphite-line/50">
            {STATS.map((s, i) => (
              <Reveal key={s.label} type="up" delay={(i % 5) * 70} className="bg-ink">
                <div className="h-full p-5 sm:p-7">
                  <p className="font-[family-name:var(--font-display)] text-[clamp(1.75rem,3vw,2.75rem)] leading-none text-bronze-light tabular-nums">
                    {s.figure}
                  </p>
                  <p className="mt-4 font-[family-name:var(--font-meta)] text-[9.5px] sm:text-[10px] uppercase tracking-[0.28em] text-ivory">
                    {s.label}
                  </p>
                  <p className="mt-2 font-[family-name:var(--font-editorial)] text-[13.5px] sm:text-[14.5px] leading-[1.55] text-ivory-soft">
                    {s.detail}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Chapter>

      {/* ── 03 · Case studies ─────────────────────────────────── */}
      <Chapter density="tight" bg="graphite">
        <div className="max-w-[1400px] mx-auto">
          <SectionLabel>Case studies</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {CASE_STUDIES.map((c, i) => {
              const href = publishedSlugs.has(c.slug) ? `/portfolio/${c.slug}` : c.fallbackHref
              return (
                <Reveal key={c.slug} type="up" delay={i * 90} className="h-full">
                  <Link
                    href={href}
                    className="group flex h-full flex-col border border-graphite-line/50 bg-graphite-2 hover:border-bronze/55 transition-colors duration-500 overflow-hidden"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-graphite">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.image}
                        alt={`${c.eyebrow}, a case study from The Club`}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-105"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
                        Case study · {c.eyebrow}
                      </p>
                      <h3 className="mt-3 font-[family-name:var(--font-display)] text-[22px] leading-[1.2] text-ivory">
                        {c.title}
                      </h3>
                      <p className="mt-3 flex-1 font-[family-name:var(--font-editorial)] text-[14.5px] leading-[1.65] text-ivory-soft">
                        {c.line}
                      </p>
                      <span className="mt-6 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-ivory group-hover:text-bronze-light transition-colors">
                        {publishedSlugs.has(c.slug) ? 'Read the case study' : c.fallbackHref === '/pitch' ? 'About PITCH' : 'See the portfolio'}
                        <ArrowUpRight size={13} strokeWidth={1.5} />
                      </span>
                    </div>
                  </Link>
                </Reveal>
              )
            })}
          </div>
        </div>
      </Chapter>

      {/* ── 04 · What our members say ─────────────────────────── */}
      {memberQuotes.length > 0 && (
        <Chapter density="tight" bg="ink">
          <div className="max-w-[1400px] mx-auto">
            <SectionLabel>Proof · In their own words</SectionLabel>
            <Reveal type="clip" delay={0}>
              <h2 className="display-md mb-10 lg:mb-14">
                What our <em className="text-bronze-light">members</em> say
              </h2>
            </Reveal>
            <StoryQuotes quotes={memberQuotes} />
          </div>
        </Chapter>
      )}

      {/* ── 05 · What our partners and venues say ─────────────── */}
      {partnerQuotes.length > 0 && (
        <Chapter density="tight" bg="ink" className="pt-0 md:pt-0">
          <div className="max-w-[1400px] mx-auto">
            <Reveal type="clip" delay={0}>
              <h2 className="display-md mb-10 lg:mb-14">
                What our <em className="text-bronze-light">partners and venues</em> say
              </h2>
            </Reveal>
            <StoryQuotes quotes={partnerQuotes} />
          </div>
        </Chapter>
      )}

      {/* ── 06 · Share your experience ────────────────────────── */}
      <section className="always-night relative overflow-hidden bg-plum py-20 md:py-28">
        <Aurora variant="dusk" z={0} />
        <div className="relative z-10 max-w-2xl mx-auto px-6 lg:px-10 text-center">
          <Reveal type="up" delay={0}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
              Were you with us?
            </p>
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h2 className="display-md text-ivory">Share your experience.</h2>
          </Reveal>
          <Reveal type="up" delay={300}>
            <p className="mt-6 font-[family-name:var(--font-editorial)] text-[clamp(1rem,1.2vw,1.15rem)] leading-[1.75] text-ivory-soft">
              Tell us about your evening or the business it led to. Every submission is read by our
              team before anything is published.
            </p>
          </Reveal>
          <Reveal type="up" delay={450}>
            <div className="mt-10">
              <Pill href="/share-your-experience" variant="solid">
                Share your experience
              </Pill>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
