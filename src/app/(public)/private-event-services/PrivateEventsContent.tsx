'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme, themeColors } from '@/components/website/ThemeContext'
import { useReveal } from '@/components/website/home/useReveal'
import { MagneticButton } from '@/components/website/MagneticButton'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePageHero } from '@/components/website/usePageHero'
import { Resources } from '@/components/website/Resources'

gsap.registerPlugin(ScrollTrigger)

// Real bookable private events from the `events` table (event_type ∈
// {curated_luxury, retreat}). Each one has its own /events/[slug] page.
interface PrivateEvent {
  id: string
  slug: string
  title: string
  description: string | null
  cover_image_url: string | null
  venue_name: string | null
  venue_city: string | null
  start_date: string
  event_type: string
  member_price_pence: number
  guest_price_pence: number
  capacity: number | null
}

// Legacy CMS tiles from `curated_experiences` — kept as a "past highlights"
// showcase below the bookable list. Marketing illustrations of the kind of
// experiences the club has run; not bookable themselves.
interface ShowcaseTile {
  id: string
  title: string
  description: string | null
  image_url: string | null
  link_url: string | null
}

interface Video {
  id: string
  title: string
  youtube_url: string
}

interface PrivateEventsContentProps {
  privateEvents: PrivateEvent[]
  showcase: ShowcaseTile[]
  videos: Video[]
}

function formatPrice(pence: number): string {
  if (pence === 0) return 'Complimentary'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
  }).format(pence / 100)
}

function formatEventDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?#]+)/)
  return match ? match[1] : null
}

export function PrivateEventsContent({ privateEvents, showcase, videos }: PrivateEventsContentProps) {
  const { mode } = useTheme()
  const dark = themeColors[mode].dark
  const light = themeColors[mode].light
  const warm = themeColors[mode].warm
  const sectionRef = useRef<HTMLElement>(null)
  const imageWrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const introReveal = useReveal({ threshold: 0.1, y: 40 })
  const experiencesReveal = useReveal({ threshold: 0.05, y: 40 })
  const processReveal = useReveal({ threshold: 0.15, y: 30 })
  const videoReveal = useReveal({ threshold: 0.1, y: 30 })
  const ctaReveal = useReveal(0.2)
  const heroOverride = usePageHero('private-event-services')
  const [activeVideo, setActiveVideo] = useState(0)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const ctx = gsap.context(() => {
      if (imageWrapRef.current) {
        ScrollTrigger.create({
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => {
            gsap.set(imageWrapRef.current, { y: self.progress * 100 })
          },
        })
      }

      if (contentRef.current) {
        ScrollTrigger.create({
          trigger: sectionRef.current,
          start: 'top top',
          end: '60% top',
          scrub: true,
          onUpdate: (self) => {
            gsap.set(contentRef.current, {
              opacity: 1 - self.progress,
              y: self.progress * 50,
            })
          },
        })
      }

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.fromTo('.pes-hero-label', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 })
        .fromTo('.pes-hero-headline', { clipPath: 'inset(0 0 100% 0)', y: 30 }, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1 }, '-=0.2')
        .fromTo('.pes-hero-sub', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <>
      {/* Hero */}
      <section
        ref={sectionRef}
        className="relative h-[60vh] min-h-[500px] flex items-end overflow-hidden transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }} />

        <div ref={imageWrapRef} className="absolute inset-0">
          <Image
            src={heroOverride?.image_url ?? 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=1920&q=80'}
            alt={heroOverride?.alt_text ?? ''}
            fill
            className="object-cover"
            priority
            sizes="100vw"
            unoptimized={!!heroOverride}
          />
          <div
            className="absolute inset-0 transition-all duration-[400ms]"
            style={{ background: `linear-gradient(to top, ${dark.bg}, ${dark.overlay || 'rgba(28,25,23,0.5)'} 50%, transparent)` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        </div>

        <div
          ref={contentRef}
          className="relative max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24 pb-16 md:pb-20 w-full"
        >
          <span
            className="pes-hero-label font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block"
            style={{ opacity: 0 }}
          >
            Private Event Services
          </span>
          <h1
            className="pes-hero-headline font-[family-name:var(--font-heading)] text-4xl md:text-5xl lg:text-6xl font-light text-white leading-[1.1] max-w-4xl"
            style={{ clipPath: 'inset(0 0 100% 0)' }}
          >
            Bespoke experiences,
            <br />
            <em className="italic text-[#B8975A]">flawlessly</em> executed
          </h1>
          <p
            className="pes-hero-sub mt-5 text-lg text-white/60 max-w-xl"
            style={{ opacity: 0 }}
          >
            Whether you&apos;re a member or not, our events team creates extraordinary
            private gatherings for discerning clients.
          </p>
        </div>
      </section>

      {/* Your Vision, Our Expertise */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={introReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">
            <div className="lg:col-span-5">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80"
                  alt="Private dining table setting"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 40vw"
                />
              </div>
            </div>
            <div className="lg:col-span-6 lg:col-start-7">
              <h2
                className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light leading-[1.15] mb-2 transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                Your Vision
              </h2>
              <h2
                className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light leading-[1.15] italic mb-8 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                Our Expertise
              </h2>
              <p
                className="text-[0.95rem] leading-[1.85] transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                Host an unforgettable private event with The Club. Whether you&apos;re planning
                a luxury celebration, an intimate gathering, or a corporate retreat, we bring
                your vision to life with elegance and precision. With access to exclusive venues
                and a team of seasoned event professionals, we ensure your event is nothing short
                of extraordinary.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Curated Luxury Events — real bookable events */}
      {privateEvents.length > 0 && (
        <section
          className="py-20 md:py-28 transition-colors duration-[400ms]"
          style={{ backgroundColor: light.bg }}
        >
          <div
            ref={experiencesReveal.ref}
            className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
          >
            <div className="text-center mb-14">
              <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
                Upcoming
              </span>
              <h2
                className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light transition-colors duration-[400ms]"
                style={{ color: light.text }}
              >
                Curated <em className="italic text-[#B8975A]">Luxury</em> Events
              </h2>
              <p
                className="mt-4 max-w-xl mx-auto text-[0.95rem] leading-[1.85]"
                style={{ color: light.textMuted }}
              >
                Bookable directly from your member portal. Tap any event for full details, venue, and ticket options.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {privateEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className="group flex flex-col transition-all duration-[400ms] hover:shadow-[0_24px_60px_rgba(44,40,37,0.18)] hover:-translate-y-1"
                  style={{
                    backgroundColor: mode === 'evening' ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                    border: `1px solid ${mode === 'evening' ? 'rgba(255,255,255,0.06)' : '#E5E0D8'}`,
                  }}
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={
                        event.cover_image_url ||
                        'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&q=80'
                      }
                      alt={event.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      unoptimized
                    />
                    <div className="absolute top-3 left-3 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] rounded-full bg-black/45 backdrop-blur-sm text-white">
                      {event.event_type === 'retreat' ? 'Retreat' : 'Curated Luxury'}
                    </div>
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <p
                      className="font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.2em] mb-2 transition-colors duration-[400ms]"
                      style={{ color: light.textDim }}
                    >
                      {formatEventDate(event.start_date)}
                      {event.venue_city && ` · ${event.venue_city}`}
                    </p>
                    <h3
                      className="font-[family-name:var(--font-heading)] text-xl font-normal mb-2 transition-colors duration-[400ms] group-hover:text-[#B8975A]"
                      style={{ color: light.text }}
                    >
                      {event.title}
                    </h3>
                    {event.description && (
                      <p
                        className="text-sm leading-relaxed flex-1 line-clamp-3 transition-colors duration-[400ms]"
                        style={{ color: light.textMuted }}
                      >
                        {event.description}
                      </p>
                    )}
                    <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: light.border }}>
                      <span
                        className="font-[family-name:var(--font-heading)] text-base"
                        style={{ color: '#B8975A' }}
                      >
                        {formatPrice(event.member_price_pence)}
                        <span
                          className="ml-1 text-[10px] uppercase tracking-[0.15em]"
                          style={{ color: light.textDim }}
                        >
                          / Member
                        </span>
                      </span>
                      <span
                        className="font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.2em] inline-flex items-center gap-1 group-hover:gap-2 transition-all"
                        style={{ color: '#B8975A' }}
                      >
                        View
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Past curated experiences — legacy showcase tiles. Not bookable;
          marketing illustrations of the kind of experience The Club runs. */}
      {showcase.length > 0 && (
        <section
          className="py-20 md:py-28 transition-colors duration-[400ms]"
          style={{
            backgroundColor: privateEvents.length > 0 ? warm.bg : light.bg,
          }}
        >
          <div className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24">
            <div className="text-center mb-14">
              <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
                Past Highlights
              </span>
              <h2
                className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light"
                style={{ color: warm.text }}
              >
                A taste of what we&apos;ve curated
              </h2>
              <p
                className="mt-4 max-w-xl mx-auto text-[0.95rem] leading-[1.85]"
                style={{ color: warm.textMuted }}
              >
                Past experiences we&apos;ve hosted. The next curated event could be tailored to your group — get in touch to discuss a bespoke programme.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {showcase.map((tile) => (
                <div
                  key={tile.id}
                  className="group flex flex-col transition-all duration-[400ms]"
                  style={{
                    backgroundColor: mode === 'evening' ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                    border: `1px solid ${mode === 'evening' ? 'rgba(255,255,255,0.06)' : '#E5E0D8'}`,
                  }}
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={
                        tile.image_url ||
                        'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&q=80'
                      }
                      alt={tile.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      unoptimized
                    />
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <h3
                      className="font-[family-name:var(--font-heading)] text-xl font-normal mb-3 transition-colors duration-[400ms]"
                      style={{ color: '#B8975A' }}
                    >
                      {tile.title}
                    </h3>
                    {tile.description && (
                      <p
                        className="text-sm leading-relaxed flex-1 transition-colors duration-[400ms]"
                        style={{ color: warm.textMuted }}
                      >
                        {tile.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Empty state — no events AND no showcase. Renders a "coming soon"
          panel + clear path to the contact form. */}
      {privateEvents.length === 0 && showcase.length === 0 && (
        <section
          className="py-24 md:py-32 transition-colors duration-[400ms]"
          style={{ backgroundColor: light.bg }}
        >
          <div className="max-w-2xl mx-auto px-6 text-center">
            <p
              className="font-[family-name:var(--font-heading)] text-2xl mb-3"
              style={{ color: light.text }}
            >
              New private experiences in the works.
            </p>
            <p className="text-sm" style={{ color: light.textMuted }}>
              Get in touch and we&apos;ll add you to the first-look list for the next curated programme.
            </p>
          </div>
        </section>
      )}

      {/* Plan Your Perfect Event CTA */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div className="max-w-2xl mx-auto px-6 md:px-16 lg:px-24 text-center">
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light text-white mb-4">
            Plan Your <em className="italic text-[#B8975A]">Perfect</em> Event
          </h2>
          <p
            className="mb-10 transition-colors duration-[400ms]"
            style={{ color: dark.textMuted }}
          >
            To help us create a bespoke experience tailored to your needs,
            get in touch with our events team.
          </p>
          <MagneticButton strength={0.3}>
            <Link
              href="/contact-us"
              className="inline-flex items-center gap-3 px-10 py-4 bg-[#B8975A] hover:bg-[#D4B978] text-white text-sm font-medium tracking-[0.1em] uppercase transition-all duration-500 hover:tracking-[0.15em]"
            >
              Enquire Now
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform duration-500 group-hover:translate-x-1">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </MagneticButton>
        </div>
      </section>

      {/* Our Process */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={processReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="text-center mb-16">
            <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
              Our Process
            </span>
            <h2
              className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light transition-colors duration-[400ms]"
              style={{ color: warm.text }}
            >
              From vision to reality
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Discovery', desc: 'We learn about your vision, audience, and objectives through an in-depth consultation.' },
              { step: '02', title: 'Curation', desc: 'Our team curates every detail — venue, menu, entertainment, guest list, and flow.' },
              { step: '03', title: 'Production', desc: 'Flawless execution with our trusted network of premium suppliers and partners.' },
              { step: '04', title: 'Legacy', desc: 'Post-event content, introductions, and follow-up that extends the impact.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <span className="font-[family-name:var(--font-heading)] text-4xl font-light text-[#B8975A]/30">
                  {item.step}
                </span>
                <h3
                  className="font-[family-name:var(--font-heading)] text-lg mt-3 mb-2 transition-colors duration-[400ms]"
                  style={{ color: warm.text }}
                >
                  {item.title}
                </h3>
                <p
                  className="text-sm leading-relaxed transition-colors duration-[400ms]"
                  style={{ color: warm.textMuted }}
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Explore More */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: light.bg }}
      >
        <div className="max-w-2xl mx-auto px-6 md:px-16 lg:px-24 text-center">
          <h2
            className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-light italic mb-3 transition-colors duration-[400ms]"
            style={{ color: light.text }}
          >
            Explore <em>More</em>
          </h2>
          <p
            className="mb-8 transition-colors duration-[400ms]"
            style={{ color: light.textMuted }}
          >
            View our upcoming events and past experiences
          </p>
          <MagneticButton strength={0.2}>
            <Link
              href="/events"
              className="inline-flex items-center px-8 py-3.5 text-sm font-medium tracking-[0.1em] uppercase transition-all duration-300 border border-[#B8975A] text-[#B8975A] hover:bg-[#B8975A] hover:text-white"
            >
              Events
            </Link>
          </MagneticButton>
        </div>
      </section>

      {/* Video Gallery */}
      {videos.length > 0 && (
        <section
          className="py-20 md:py-28 transition-colors duration-[400ms]"
          style={{ backgroundColor: dark.bg }}
        >
          <div
            ref={videoReveal.ref}
            className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
          >
            <div className="text-center mb-12">
              <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light text-white">
                Video Gallery
              </h2>
            </div>

            {/* Active video */}
            <div className="max-w-4xl mx-auto mb-8">
              <div className="relative aspect-video overflow-hidden">
                {getYouTubeId(videos[activeVideo].youtube_url) && (
                  <iframe
                    src={`https://www.youtube.com/embed/${getYouTubeId(videos[activeVideo].youtube_url)}`}
                    title={videos[activeVideo].title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                )}
              </div>
              <p className="text-sm text-white/60 mt-3 text-center">
                {videos[activeVideo].title}
              </p>
            </div>

            {/* Thumbnails */}
            {videos.length > 1 && (
              <div className="flex justify-center gap-4 flex-wrap">
                {videos.map((video, i) => (
                  <button
                    key={video.id}
                    onClick={() => setActiveVideo(i)}
                    className={`text-xs font-medium px-4 py-2 transition-all duration-300 ${
                      i === activeVideo
                        ? 'bg-[#B8975A] text-white'
                        : 'border border-white/20 text-white/60 hover:border-[#B8975A] hover:text-[#B8975A]'
                    }`}
                  >
                    {video.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Resources / downloads (brochures, sample menus, etc.) */}
      <Resources
        pageSlug="private-event-services"
        heading="Event brochures"
        subheading="Sample menus, venue specs, and partner sheets — for a closer look before you enquire."
      />

      {/* Contact */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={ctaReveal.ref}
          className="max-w-2xl mx-auto px-6 md:px-16 lg:px-24 text-center"
        >
          <p
            className="font-[family-name:var(--font-heading)] text-lg md:text-xl font-light italic leading-relaxed mb-6 transition-colors duration-[400ms]"
            style={{ color: warm.textMuted }}
          >
            Get inspired by past events and discover how we can tailor each element to your need.
          </p>
          <p
            className="text-sm transition-colors duration-[400ms]"
            style={{ color: warm.textMuted }}
          >
            For enquiries and further details, email{' '}
            <a href="mailto:events@theclubsarahrestrick.com" className="text-[#B8975A] hover:underline">
              events@theclubsarahrestrick.com
            </a>
            {' '}or call{' '}
            <a href="tel:+447880351645" className="text-[#B8975A] hover:underline">
              +44 7880 351 645
            </a>
          </p>
        </div>
      </section>
    </>
  )
}
