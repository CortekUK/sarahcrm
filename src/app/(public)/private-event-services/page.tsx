import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import {
  VideoGallery,
  type VideoEntry,
} from '@/components/website/night/VideoGallery'
import { ArrowUpRight, BookOpen, Mail, Phone } from 'lucide-react'

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// /private-event-services
//
// Voice copy is verbatim from Sarah's live site screenshots.
//   01 Hero
//   02 Your Vision · Our Expertise  — image left, paragraph right
//   03 Curated Luxury Events        — cards (curated_experiences),
//                                       each opens its link_url in a
//                                       new tab — no internal detail
//                                       page
//   04 Plan Your Perfect Event      — enquire CTA → /contact-us
//   05 Explore More                 — view events brochure → /events
//   06 Video Gallery                — page_slug = 'private-events'
//   07 Contact line                 — email + phone, verbatim
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/theclub-section.png' // PLACEHOLDER
const VISION_IMAGE = '/gallery/bigland.png' // PLACEHOLDER

const CONTACT_EMAIL = 'events@theclubsarahrestrick.com'
const CONTACT_PHONE = '+44 7880 351 645'

export default async function PrivateEventServicesPage() {
  const supabase = await createClient()

  const [{ data: curated }, { data: videoRows }] = await Promise.all([
    supabase
      .from('curated_experiences')
      .select('id, title, description, image_url, link_url')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('video_gallery')
      .select('id, youtube_url, title')
      .eq('page_slug', 'private-events')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ])

  const videos: VideoEntry[] = (videoRows as VideoEntry[]) ?? []

  return (
    <>
      {/* ── 01 · Hero ─────────────────────────────────────────── */}
      <section className="relative min-h-[68vh] w-full overflow-hidden bg-ink">
        <KenBurnsImage
          src={HERO_IMAGE}
          alt="A private dining setup"
          motion="in"
          duration={32}
          overlay={0.55}
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 min-h-[68vh] max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pt-32 pb-24">
          <Reveal type="up" delay={0}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
              At The Club
            </p>
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,4.4vw,4rem)] leading-[1.1] tracking-[-0.01em] text-ivory max-w-3xl">
              Private Events.
            </h1>
          </Reveal>
        </div>
      </section>

      {/* ── 02 · Your Vision · Our Expertise ─────────────────── */}
      <Chapter density="tight" bg="ink">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center max-w-[1400px] mx-auto">
          {/* Image */}
          <div className="lg:col-span-6">
            <Reveal type="scale" delay={0}>
              <div className="relative aspect-[5/4] overflow-hidden border border-graphite-line/40">
                <Image
                  src={VISION_IMAGE}
                  alt="A private dining table set"
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
                <div className="film-grain-night pointer-events-none" />
              </div>
            </Reveal>
          </div>

          {/* Copy */}
          <div className="lg:col-span-6">
            <Reveal type="clip" delay={150}>
              <h2 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3vw,2.875rem)] leading-[1.1] text-ivory">
                Your Vision
                <br />
                <em className="italic text-bronze-light">Our Expertise</em>
              </h2>
            </Reveal>
            <Reveal type="up" delay={350}>
              <p className="mt-9 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.2vw,1.25rem)] leading-[1.8] text-ivory max-w-prose">
                Host an unforgettable private event with The Club. Whether you&apos;re planning a
                luxury celebration, an intimate gathering, or a corporate retreat, we bring your
                vision to life with elegance and precision. With access to exclusive venues and a
                team of seasoned event professionals, we ensure your event is nothing short of
                extraordinary.
              </p>
            </Reveal>
          </div>
        </div>
      </Chapter>

      {/* ── 03 · Curated Luxury Events ─────────────────────────
         Each card is an external link (link_url) opening in a new
         tab — no internal detail page per Sarah's existing flow. */}
      {curated && curated.length > 0 && (
        <Chapter density="tight" bg="graphite" className="relative">
          <Aurora variant="soft" />
          <div className="relative z-10 max-w-[1400px] mx-auto">
            <div className="text-center mb-14">
              <Reveal type="up" delay={0}>
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
                  Recent Commissions
                </p>
              </Reveal>
              <Reveal type="clip" delay={150}>
                <h2 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3vw,2.875rem)] leading-tight text-ivory">
                  Curated <em className="italic text-bronze-light">Luxury</em> Events.
                </h2>
              </Reveal>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
              {curated.map((c) => {
                const isExternal = c.link_url && /^https?:\/\//.test(c.link_url)
                const props = isExternal
                  ? {
                      href: c.link_url!,
                      target: '_blank',
                      rel: 'noopener noreferrer',
                    }
                  : { href: c.link_url || '#' }
                return (
                  <a
                    key={c.id}
                    {...props}
                    className="group block bg-ink/60 border border-graphite-line/40 hover:border-bronze/55 transition-colors duration-500 overflow-hidden"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-graphite">
                      {c.image_url ? (
                        <Image
                          src={c.image_url}
                          alt={c.title}
                          fill
                          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                          className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06]"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="font-[family-name:var(--font-display)] text-6xl text-slate-dim">
                            {c.title.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="film-grain-night pointer-events-none" />
                      {/* External-link arrow hint */}
                      <ArrowUpRight
                        size={16}
                        strokeWidth={1.2}
                        className="absolute top-4 right-4 text-bronze opacity-0 group-hover:opacity-100 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-500"
                      />
                    </div>
                    <div className="p-7">
                      <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.25rem,1.5vw,1.5rem)] leading-tight text-bronze-light group-hover:text-ivory transition-colors duration-500">
                        {c.title}
                      </h3>
                      {c.description && (
                        <p className="mt-4 font-[family-name:var(--font-editorial)] text-[14.5px] leading-[1.7] text-ivory-soft">
                          {c.description}
                        </p>
                      )}
                    </div>
                  </a>
                )
              })}
            </div>
          </div>
        </Chapter>
      )}

      {/* ── 06 · Video Gallery — only renders if videos exist ─ */}
      {videos.length > 0 && (
        <Chapter density="tight" bg="graphite" className="relative">
          <Aurora variant="dusk" />
          <div className="relative z-10 max-w-[1400px] mx-auto">
            <div className="text-center mb-12">
              <Reveal type="up" delay={0}>
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
                  On Camera
                </p>
              </Reveal>
              <Reveal type="clip" delay={150}>
                <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.75rem,2.6vw,2.5rem)] leading-tight text-ivory">
                  Video Gallery.
                </h2>
              </Reveal>
            </div>
            <VideoGallery videos={videos} />
          </div>
        </Chapter>
      )}

      {/* ── 07 · Unified close — Plan, Explore, Contact ───────
         Three editorial moments combined into one plum + dusk
         aurora section so the page closes on a single premium
         beat instead of three smaller ones. Same bg as the
         homepage ApplyClose newsletter section. */}
      <section className="relative overflow-hidden bg-plum py-24 md:py-32">
        <Aurora variant="dusk" z={0} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 text-center">
          {/* Primary moment — the enquiry CTA */}
          <Reveal type="up" delay={0}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-7">
              Begin a Commission
            </p>
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h2 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,3.4vw,3.25rem)] leading-tight text-ivory">
              Plan Your <em className="italic text-bronze-light">Perfect Event</em>.
            </h2>
          </Reveal>
          <Reveal type="up" delay={350}>
            <p className="mt-7 font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.1875rem)] leading-[1.75] text-ivory-soft">
              To help us create a bespoke experience tailored to your needs, please click on the
              button below.
            </p>
          </Reveal>
          <Reveal type="up" delay={500}>
            <Link href="/contact-us" className="group relative inline-block mt-10">
              <span className="block relative px-9 py-4 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
                <span
                  aria-hidden
                  className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover:border-ink/20"
                />
                <span
                  aria-hidden
                  className="absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out"
                />
                <span className="relative z-10 flex items-center gap-3 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-ivory group-hover:text-ink transition-colors duration-700">
                  Enquire Now
                  <ArrowUpRight
                    size={14}
                    strokeWidth={1.5}
                    className="transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
                  />
                </span>
              </span>
            </Link>
          </Reveal>

          {/* Bronze hairline divides the primary CTA from the
             secondary contact / brochure block */}
          <Reveal type="up" delay={650}>
            <span className="block h-px w-16 bg-bronze/55 mx-auto my-14 lg:my-16" />
          </Reveal>

          {/* Contact paragraph — verbatim, with email + phone as
             inline bronze links. */}
          <Reveal type="up" delay={750}>
            <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.1875rem)] leading-[1.85] text-ivory-soft max-w-2xl mx-auto">
              Get inspired by past events and discover how we can tailor each element to your need.
              For enquiries and further details, email{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="not-italic text-bronze-light hover:text-ivory transition-colors duration-300 underline underline-offset-4 decoration-bronze/40 hover:decoration-bronze"
              >
                {CONTACT_EMAIL}
              </a>{' '}
              or call,{' '}
              <a
                href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`}
                className="not-italic text-bronze-light hover:text-ivory transition-colors duration-300 underline underline-offset-4 decoration-bronze/40 hover:decoration-bronze"
              >
                {CONTACT_PHONE}
              </a>
              .
            </p>
          </Reveal>

          {/* Three quick-glance actions — Events brochure, email,
             call. Same vocabulary (bronze icon circle + meta
             label), evenly spaced. */}
          <Reveal type="up" delay={900}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-9 gap-y-4">
              <Link
                href="/events"
                className="group inline-flex items-center gap-3 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
              >
                <span className="w-9 h-9 rounded-full bg-bronze/15 border border-bronze/45 flex items-center justify-center group-hover:bg-bronze group-hover:text-ink transition-colors duration-300">
                  <BookOpen size={13} strokeWidth={1.5} />
                </span>
                Events Brochure
              </Link>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="group inline-flex items-center gap-3 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
              >
                <span className="w-9 h-9 rounded-full bg-bronze/15 border border-bronze/45 flex items-center justify-center group-hover:bg-bronze group-hover:text-ink transition-colors duration-300">
                  <Mail size={13} strokeWidth={1.5} />
                </span>
                Email the team
              </a>
              <a
                href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`}
                className="group inline-flex items-center gap-3 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
              >
                <span className="w-9 h-9 rounded-full bg-bronze/15 border border-bronze/45 flex items-center justify-center group-hover:bg-bronze group-hover:text-ink transition-colors duration-300">
                  <Phone size={13} strokeWidth={1.5} />
                </span>
                Call the team
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
