import Image from 'next/image'
import { createClient } from '@supabase/supabase-js'
import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { TracingBeam } from '@/components/website/night/effects/TracingBeam'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'
import { VideoGallery, type VideoEntry } from '@/components/website/night/VideoGallery'
import { StoryCarousel } from '@/components/website/night/StoryCarousel'
import { getPageHero } from '@/lib/cms/heroes'

// ─────────────────────────────────────────────────────────────────────
// /about — "The Club" page.
//
// All voice copy on this page is VERBATIM from Sarah's live site
// (theclubbysarahrestrick.com). No fabricated principles, quotes or
// press marquee. Placeholder images use existing /public assets until
// the real portrait + Clique 100 event photographs are dropped in.
//
// Composition:
//   01 Hero               — portrait + headline, restrained typography
//   02 Story (TracingBeam) — three editorial chapters down one column:
//                            Intro · Beyond Fashion · The Turning Point
//   03 Video Gallery      — fed by public.video_gallery (page_slug='about')
//   04 Closing reflection — editorial italic close
//   05 Apply close        — shared homepage CTA
// ─────────────────────────────────────────────────────────────────────

const HERO_PORTRAIT = '/gallery/potrait.png' // PLACEHOLDER — Sarah's real portrait
const STORY_IMAGE_1 = '/gallery/land2.png'   // PLACEHOLDER — Clique 100 / on-stage photo
const STORY_IMAGE_2 = '/gallery/land3.png'   // PLACEHOLDER — networking B&W photo

async function getVideos(): Promise<VideoEntry[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data } = await supabase
    .from('video_gallery')
    .select('id, youtube_url, title')
    .eq('page_slug', 'about')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  return (data as VideoEntry[]) ?? []
}

export default async function AboutPage() {
  const [videos, hero] = await Promise.all([
    getVideos(),
    getPageHero('about', {
      page_slug: 'about',
      media_type: 'image',
      image_url: HERO_PORTRAIT,
      alt_text: 'Sarah Restrick',
      eyebrow: 'The Club · Founder',
      headline: 'A visionary in luxury and connections.',
      lede: 'Sarah Restrick’s journey.',
    }),
  ])

  return (
    <>
      {/* ── 01 · Hero ────────────────────────────────────────────────
         Eyebrow + headline + lede are CMS-driven (hero_slides table,
         page_slug='about'). The hardcoded fallback above keeps the
         page looking right if the DB row is removed or fails to load. */}
      <section className="relative h-[78vh] min-h-[560px] w-full overflow-hidden bg-ink">
        <PageHeroMedia
          mediaType={hero.media_type}
          imageUrl={hero.image_url}
          alt={hero.alt_text}
          videoUrl={hero.video_url}
          videoPosterUrl={hero.video_poster_url}
          overlay={0.62}
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-24">
          {hero.eyebrow && (
            <Reveal type="up" delay={0}>
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
                {hero.eyebrow}
              </p>
            </Reveal>
          )}
          {hero.headline && (
            <Reveal type="clip" delay={150}>
              <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,4.4vw,4.25rem)] leading-[1.1] tracking-[-0.01em] text-ivory max-w-3xl">
                {hero.headline}
              </h1>
            </Reveal>
          )}
          {hero.lede && (
            <Reveal type="up" delay={400}>
              <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.25rem,1.8vw,1.75rem)] text-bronze-light mt-5">
                {hero.lede}
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── 02 · Story (TracingBeam) ─────────────────────────────────
         All three editorial chapters live inside a single TracingBeam
         so the bronze hairline runs uninterrupted down the side of
         the page as Sarah's story unfolds. Each chapter follows the
         same shape: eyebrow → headline OR italic lead → image. Image
         sizes are deliberately modest so they don't overpower the
         copy. */}
      <section className="bg-ink py-24 lg:py-32">
        <TracingBeam className="max-w-5xl mx-auto px-6 lg:px-10">
          <div className="space-y-28 lg:space-y-36">
            {/* Chapter 1 — Introduction
               Headline pulled from the paragraph: "exclusive luxury
               events" is verbatim in the body below. items-center on
               the grid balances the empty space above and below the
               (shorter) text against the portrait. */}
            <article>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-14 items-center">
                <div className="md:col-span-7">
                  <Reveal type="up" delay={0}>
                    <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
                      A private members club
                    </p>
                  </Reveal>
                  <Reveal type="clip" delay={150}>
                    <h2 className="display-md mt-7 max-w-xl">
                      Exclusive luxury events.
                    </h2>
                  </Reveal>
                  <div className="mt-10 space-y-7">
                    <Reveal type="up" delay={300}>
                      <p className="font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.75] text-ivory-soft">
                        The Club by Sarah Restrick is a private members club, curating invaluable
                        networking opportunities through exclusive luxury events.
                      </p>
                    </Reveal>
                    <Reveal type="up" delay={450}>
                      <p className="font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.75] text-ivory-soft">
                        More than just networking, connecting business leaders, owners, high level
                        executives and HNWIs through a calendar of luxury events at{' '}
                        <em className="italic text-bronze-light">five star venues across the UK and beyond</em>.
                      </p>
                    </Reveal>
                  </div>
                </div>

                <div className="md:col-span-5">
                  <Reveal type="scale" delay={300}>
                    {/* aspect-[3/4] is shorter than the prior 4/5 — keeps
                       the portrait portrait-shaped without towering
                       over the (relatively short) two-paragraph body. */}
                    <div className="relative aspect-[3/4] overflow-hidden border border-graphite-line/40">
                      <Image
                        src={HERO_PORTRAIT}
                        alt="Sarah Restrick"
                        fill
                        sizes="(min-width: 768px) 40vw, 100vw"
                        className="object-cover"
                      />
                      <div className="film-grain-night" />
                    </div>
                    <div className="mt-5 flex items-center gap-3">
                      <span className="h-px w-8 bg-bronze/55" />
                      <p className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light">
                        Sarah Restrick
                      </p>
                      <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.24em] text-slate-haze">
                        Founder
                      </p>
                    </div>
                  </Reveal>
                </div>
              </div>
            </article>

            {/* Chapter 2 — Beyond Fashion
               Headline "Beyond the fashion scene." is verbatim from
               the paragraph's opening clause — clear textual anchor. */}
            <article>
              <Reveal type="up" delay={0}>
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
                  Beyond Fashion
                </p>
              </Reveal>
              <Reveal type="clip" delay={150}>
                <h2 className="display-md mt-7 max-w-2xl">
                  Beyond the fashion scene.
                </h2>
              </Reveal>

              <Reveal type="up" delay={300}>
                <p className="mt-10 max-w-3xl font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.8] text-ivory-soft">
                  Her influence extended beyond the fashion scene as she spearheaded external
                  events for <em className="italic text-bronze-light">Flannels</em>, including
                  prestigious gatherings such as the{' '}
                  <em className="italic text-bronze-light">Boodles and Berry&apos;s tennis events</em>
                  . These experiences not only showcased her prowess in event management but also
                  provided a fertile ground for cultivating a network of influential connections.
                </p>
              </Reveal>
            </article>

            {/* Chapter 3 — The Turning Point
               Two-column composition: image carousel on the left,
               eyebrow + headline + paragraph on the right, both
               columns aligned to the same top so the text reads at
               the same height as the carousel rather than stacking
               above it. Auto-rotating crossfade carousel feeds from
               existing /public/gallery assets. */}
            <article>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
                {/* Carousel — left */}
                <div className="lg:col-span-7 order-2 lg:order-1">
                  <Reveal type="scale" delay={250}>
                    <StoryCarousel
                      images={[
                        { src: STORY_IMAGE_1, alt: 'A Clique 100 evening' },
                        { src: STORY_IMAGE_2, alt: "Sarah at a members' evening" },
                        { src: '/gallery/bigland.png', alt: 'A panel discussion at The Club' },
                        { src: '/gallery/land1.png', alt: 'Networking at The Club' },
                        { src: '/gallery/potrait.png', alt: 'A dining moment' },
                      ]}
                      aspect="4/5"
                    />
                  </Reveal>
                </div>

                {/* Text — right, aligned to image top. Headline
                   "A defining moment." is verbatim from the
                   paragraph's opening — clear textual anchor. */}
                <div className="lg:col-span-5 order-1 lg:order-2">
                  <Reveal type="up" delay={0}>
                    <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
                      The Turning Point
                    </p>
                  </Reveal>
                  <Reveal type="clip" delay={150}>
                    <h2 className="display-md mt-7">
                      A defining moment.
                    </h2>
                  </Reveal>
                  <Reveal type="up" delay={300}>
                    <p className="mt-10 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.8] text-ivory-soft">
                      In a defining moment, Sarah assumed the role of running the{' '}
                      <em className="italic text-bronze-light">Clique 100 Club</em> in Manchester
                      and Leeds, marking a pivotal shift in her career.
                    </p>
                  </Reveal>
                  <Reveal type="up" delay={450}>
                    <p className="mt-6 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.8] text-ivory-soft">
                      As her leadership flourished, the members club underwent a transformation,
                      evolving into{' '}
                      <em className="italic text-bronze-light">The Club by Sarah Restrick</em> under
                      her sole guidance.
                    </p>
                  </Reveal>
                </div>
              </div>
            </article>
          </div>
        </TracingBeam>
      </section>

      {/* ── 03 · Video Gallery ──────────────────────────────────────
         Only renders if Sarah has rows in video_gallery for the
         'about' page slug. The empty state hides the whole section so
         the page never looks half-built. */}
      {videos.length > 0 && (
        <Chapter density="tight" bg="graphite" className="relative">
          <Aurora variant="dusk" />
          <div className="relative z-10 max-w-[1400px] mx-auto">
            {/* Section header — title left, YouTube CTA right. Inline
               composition kills the wasted vertical gap the centred
               footer button created. */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 mb-14">
              <div>
                <Reveal type="up" delay={0}>
                  <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
                    In Their Own Words
                  </p>
                </Reveal>
                <Reveal type="clip" delay={150}>
                  <h2 className="display-md">Video gallery.</h2>
                </Reveal>
              </div>
              <Reveal type="up" delay={250}>
                <a
                  href="https://www.youtube.com/@theclubbysarahrestrick"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-3 px-7 py-3.5 border border-bronze hover:bg-bronze rounded-full font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ink transition-all duration-500 self-start md:self-end"
                  aria-label="Open The Club by Sarah Restrick on YouTube"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="currentColor"
                    className="text-bronze-light group-hover:text-ink transition-colors duration-500"
                  >
                    <path d="M23.498 6.186a2.999 2.999 0 0 0-2.112-2.122C19.612 3.5 12 3.5 12 3.5s-7.612 0-9.386.564A2.999 2.999 0 0 0 .502 6.186C0 7.962 0 12 0 12s0 4.038.502 5.814a2.999 2.999 0 0 0 2.112 2.122C4.388 20.5 12 20.5 12 20.5s7.612 0 9.386-.564a2.999 2.999 0 0 0 2.112-2.122C24 16.038 24 12 24 12s0-4.038-.502-5.814zM9.546 15.568V8.432L15.818 12l-6.272 3.568z" />
                  </svg>
                  Watch on YouTube
                </a>
              </Reveal>
            </div>

            <VideoGallery videos={videos} />
          </div>
        </Chapter>
      )}

      {/* ── 04 · Closing reflection ─────────────────────────────────
         The four phrases in italic bronze are the same ones the live
         site highlights — preserved verbatim, only the styling is
         editorial. */}
      <Chapter density="tight" bg="ink">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal type="up" delay={0}>
            <span className="block h-px w-12 bg-bronze/55 mx-auto mb-10" />
          </Reveal>
          <Reveal type="up" delay={150}>
            <p className="font-[family-name:var(--font-editorial)] text-[clamp(1.25rem,1.55vw,1.625rem)] leading-[1.8] text-ivory-soft">
              Sarah&apos;s journey is defined by a profound{' '}
              <em className="italic text-bronze-light">passion for luxury experiences</em> and a
              commitment to <em className="italic text-bronze-light">connecting people</em>. Her
              vision has shaped The Club into an exclusive platform where like-minded individuals
              converge, creating a space where{' '}
              <em className="italic text-bronze-light">luxury meets meaningful connections</em>.
              Join us as we celebrate Sarah Restrick&apos;s vision, a story woven with threads of
              fashion, client relations, and{' '}
              <em className="italic text-bronze-light">
                the art of bringing people together in the lap of luxury
              </em>
              .
            </p>
          </Reveal>
        </div>
      </Chapter>

      {/* ── 05 · Apply close (shared) ────────────────────────────── */}
      <ApplyClose />
    </>
  )
}
