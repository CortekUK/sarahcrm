import type { Metadata } from 'next'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { VideoGallery } from '@/components/website/night/VideoGallery'
import { HeroFilm } from '@/components/website/night/portfolio/HeroFilm'
import { PortfolioBrowser } from '@/components/website/night/portfolio/PortfolioBrowser'
import { RoomMosaic } from '@/components/website/night/portfolio/RoomMosaic'
import { Pill, SectionLabel } from '@/components/website/night/portfolio/Pill'
import { listCaseStudies, listPortfolioFilms } from '@/lib/cms/portfolio'

const TITLE = 'Portfolio | The Club by Sarah Restrick'
const DESCRIPTION =
  'Case studies from The Club: 200 events, from ten-guest round tables to 300-guest showcases. The brief, what we delivered and the results for brands, venues and partners.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/portfolio' },
  openGraph: { title: TITLE, description: DESCRIPTION, images: ['https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/portfolio-hero-dinner.jpg'] },
}

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// /portfolio — replaces Gallery. Case-study showcase: fewer, bigger
// stories, each with the brief, what we delivered and the result.
//
//   01 Hero          — full-bleed film loop (first Video Gallery film),
//                      still image underneath / on phones
//   02 Case studies  — filter chips + alternating full/half grid
//   03 Video Gallery — the four films as a showreel
//   04 Who you meet  — brochure guests & talent mosaic
//   05 CTA band      — Plan an event · Sponsor an event · Apply
// ─────────────────────────────────────────────────────────────────────

const HERO_STILL = 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/portfolio-hero-dinner.jpg'

export default async function PortfolioPage() {
  const [items, films] = await Promise.all([listCaseStudies(), listPortfolioFilms()])

  return (
    <>
      {/* ── 01 · Hero ─────────────────────────────────────────── */}
      <section className="relative min-h-[82vh] w-full always-night overflow-hidden bg-ink">
        <HeroFilm
          filmUrl={films[0]?.youtube_url ?? null}
          stillUrl={HERO_STILL}
          alt="A long dinner table laid for an evening with The Club"
          overlay={0.55}
        />
        <div className="absolute inset-x-0 bottom-0 h-[55%] hero-fade-bottom pointer-events-none" />
        <div className="relative z-10 min-h-[82vh] max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pt-32 pb-20 lg:pb-24">
          <Reveal type="up" delay={0}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
              Portfolio
            </p>
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h1 className="display-xl max-w-4xl">
              Our portfolio. <em className="text-bronze-light">Rooms that sell.</em>
            </h1>
          </Reveal>
          <Reveal type="up" delay={400}>
            <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.0625rem,1.3vw,1.3rem)] leading-[1.7] text-ivory-soft mt-6 max-w-2xl">
              200 events, from ten-guest round tables to 300-guest showcases.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── 02 · Case studies ─────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <div className="max-w-[1400px] mx-auto">
          <SectionLabel>Case studies</SectionLabel>
          <PortfolioBrowser items={items} />
        </div>
      </Chapter>

      {/* ── 03 · Video Gallery ────────────────────────────────── */}
      {films.length > 0 && (
        <Chapter density="tight" bg="graphite" className="always-night">
          <div className="max-w-[1400px] mx-auto">
            <SectionLabel>Video Gallery</SectionLabel>
            <Reveal type="clip" delay={0}>
              <h2 className="display-md text-ivory mb-10 lg:mb-14">
                The showreel<em className="text-bronze-light">.</em>
              </h2>
            </Reveal>
            <VideoGallery videos={films.slice(0, 4)} />
          </div>
        </Chapter>
      )}

      {/* ── 04 · Who you meet in the room ─────────────────────── */}
      <Chapter density="tight" bg="ink">
        <div className="max-w-[1400px] mx-auto">
          <SectionLabel>Previous events · Guests &amp; talent</SectionLabel>
          <Reveal type="clip" delay={0}>
            <h2 className="display-md mb-6">
              Who you meet in <em className="text-bronze-light">the room</em>
            </h2>
          </Reveal>
          <Reveal type="up" delay={150}>
            <p className="font-[family-name:var(--font-editorial)] text-[clamp(1rem,1.2vw,1.2rem)] leading-[1.75] text-ivory-soft max-w-2xl mb-10 lg:mb-14">
              Business owners, founders and C-suite decision makers across luxury, corporate and
              hospitality, alongside individuals, brands and HNW and UHNW guests.
            </p>
          </Reveal>
          <RoomMosaic />
        </div>
      </Chapter>

      {/* ── 05 · CTA band ─────────────────────────────────────── */}
      <section className="always-night relative overflow-hidden bg-plum py-20 md:py-28">
        <Aurora variant="dusk" z={0} />
        <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 text-center">
          <Reveal type="clip" delay={0}>
            <h2 className="display-md text-ivory">
              Your room, <em className="text-bronze-light">next.</em>
            </h2>
          </Reveal>
          <Reveal type="up" delay={250}>
            <div className="mt-10 flex flex-col md:flex-row items-stretch md:items-center justify-center gap-4 md:gap-5 max-w-sm md:max-w-none mx-auto">
              <Pill href="/concierge#event-services" variant="solid">
                Plan an event with us
              </Pill>
              <Pill href="/partner/sponsorship">Sponsor an event</Pill>
              <Pill href="/membership-application">Apply for membership</Pill>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
