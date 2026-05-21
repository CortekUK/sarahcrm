'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme, themeColors } from '@/components/website/ThemeContext'
import { useReveal } from '@/components/website/home/useReveal'
import { MagneticButton } from '@/components/website/MagneticButton'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { supabase } from '@/lib/supabase/client'
import { usePageHero } from '@/components/website/usePageHero'

gsap.registerPlugin(ScrollTrigger)

interface VideoItem {
  id: string
  title: string
}

const FALLBACK_VIDEOS: VideoItem[] = [
  { id: 'qIn7RdZYlWU', title: 'Lamborghini Experience' },
  { id: 'q9sSM1Oy-1Y', title: 'Boxing Gala Night' },
  { id: 'D8tPEyzZtjs', title: 'Gleneagles Retreat' },
]

// Extract a YouTube video ID from any of the common URL shapes:
//   youtube.com/watch?v=XYZ, youtu.be/XYZ, youtube.com/embed/XYZ
function extractYouTubeId(url: string): string | null {
  if (!url) return null
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{6,})/,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

export default function AboutPage() {
  const { mode } = useTheme()
  const dark = themeColors[mode].dark
  const light = themeColors[mode].light
  const warm = themeColors[mode].warm
  const sectionRef = useRef<HTMLElement>(null)
  const imageWrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const bioReveal = useReveal({ threshold: 0.05, y: 40 })
  const careerReveal = useReveal({ threshold: 0.05, y: 30 })
  const videoReveal = useReveal({ threshold: 0.05, y: 30 })
  const statsReveal = useReveal({ threshold: 0.2, y: 20 })
  const closingReveal = useReveal({ threshold: 0.15, y: 30 })
  const ctaReveal = useReveal(0.2)

  const [activeVideo, setActiveVideo] = useState(0)
  const [videos, setVideos] = useState<VideoItem[]>(FALLBACK_VIDEOS)
  const heroOverride = usePageHero('about')

  // Load the About-page video gallery from Supabase. Falls back to the curated
  // YouTube list when the admin hasn't published any rows under page_slug='about'.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('video_gallery')
        .select('id, title, youtube_url')
        .eq('is_active', true)
        .eq('page_slug', 'about')
        .order('display_order', { ascending: true })
        .limit(12)
      if (cancelled) return
      const real = (data ?? [])
        .map((v) => {
          const id = extractYouTubeId(v.youtube_url)
          return id ? { id, title: v.title } : null
        })
        .filter((v): v is VideoItem => !!v)
      if (real.length > 0) {
        setVideos(real)
        setActiveVideo(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
      tl.fromTo('.about-hero-label', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 })
        .fromTo(
          '.about-hero-headline',
          { clipPath: 'inset(0 0 100% 0)', y: 30 },
          { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1 },
          '-=0.2'
        )
        .fromTo('.about-hero-sub', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
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
            src={heroOverride?.image_url ?? 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1920&q=80'}
            alt={heroOverride?.alt_text ?? 'Elegant event venue'}
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
            className="about-hero-label font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block"
            style={{ opacity: 0 }}
          >
            Our Founder &amp; CEO
          </span>
          <h1
            className="about-hero-headline font-[family-name:var(--font-heading)] text-4xl md:text-5xl lg:text-6xl font-light text-white leading-[1.1]"
            style={{ clipPath: 'inset(0 0 100% 0)' }}
          >
            Sarah Restrick
          </h1>
          <p
            className="about-hero-sub mt-5 text-lg text-white/60 max-w-lg"
            style={{ opacity: 0 }}
          >
            A visionary in luxury and connections.
          </p>
        </div>
      </section>

      {/* Portrait & Bio */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={bioReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
            <div className="lg:col-span-5">
              <div className="relative aspect-[3/4] overflow-hidden">
                <Image
                  src="/images/sarah-restrick.png"
                  alt="Sarah Restrick"
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 1024px) 100vw, 40vw"
                />
              </div>
              <p
                className="mt-4 text-xs italic transition-colors duration-[400ms]"
                style={{ color: warm.textDim }}
              >
                Sarah Restrick, Founder &amp; CEO of The Club
              </p>
            </div>

            <div className="lg:col-span-6 lg:col-start-7 flex flex-col justify-center">
              <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
                The Story
              </span>
              <h2
                className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-light leading-[1.3] mb-8 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                A visionary in luxury and connections: Sarah Restrick&apos;s journey.
              </h2>

              <div
                className="space-y-5 text-[0.95rem] leading-[1.85] transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>
                  The Club by Sarah Restrick is a private members club, curating
                  invaluable networking opportunities through exclusive luxury events.
                </p>
                <p>
                  More than just networking — connecting business leaders, owners,
                  high-level executives and HNWIs through a calendar of luxury events
                  at five-star venues across the UK and beyond.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Career & Evolution */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: light.bg }}
      >
        <div
          ref={careerReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
            <div className="lg:col-span-7">
              <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
                The Path
              </span>
              <div
                className="space-y-6 text-[0.95rem] leading-[1.85] transition-colors duration-[400ms]"
                style={{ color: light.textMuted }}
              >
                <p>
                  Her influence extended beyond the fashion scene as she spearheaded
                  external events for Flannels, including prestigious gatherings such
                  as the Boodles and Berry&apos;s tennis events. These experiences not
                  only showcased her prowess in event management but also provided a
                  fertile ground for cultivating a network of influential connections.
                </p>
                <p>
                  In a defining moment, Sarah assumed the role of running the Clique
                  100 Club in Manchester and Leeds, marking a pivotal shift in her
                  career. As her leadership flourished, the members club underwent a
                  transformation, evolving into The Club by Sarah Restrick under her
                  sole guidance.
                </p>
              </div>
            </div>

            <div className="lg:col-span-4 lg:col-start-9 flex flex-col justify-center">
              <div className="relative aspect-[4/5] overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1703565426315-4209c2e88eea?w=800&q=80"
                  alt="Private members club"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 33vw"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Video Gallery */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div ref={videoReveal.ref} className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24">
          <div className="text-center mb-12">
            <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
              In Motion
            </span>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light text-white">
              Video Gallery
            </h2>
          </div>

          <div className="relative max-w-4xl mx-auto">
            <div className="relative w-full aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${videos[activeVideo].id}?rel=0&modestbranding=1`}
                title={videos[activeVideo].title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
                style={{ border: 'none' }}
              />
            </div>

            <button
              onClick={() => setActiveVideo((p) => (p - 1 + videos.length) % videos.length)}
              className="absolute left-0 md:-left-16 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-[#B8975A] hover:text-[#D4B978] transition-colors"
              aria-label="Previous video"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={() => setActiveVideo((p) => (p + 1) % videos.length)}
              className="absolute right-0 md:-right-16 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-[#B8975A] hover:text-[#D4B978] transition-colors"
              aria-label="Next video"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {/* Dots */}
          <div className="flex justify-center gap-3 mt-6">
            {videos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => setActiveVideo(i)}
                className="w-2 h-2 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: i === activeVideo ? '#B8975A' : 'rgba(184,151,90,0.3)',
                  transform: i === activeVideo ? 'scale(1.3)' : 'scale(1)',
                }}
                aria-label={v.title}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={statsReveal.ref}
          className="max-w-[1080px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {[
              { value: '150+', label: 'Members' },
              { value: '3', label: 'Cities' },
              { value: '50+', label: 'Events per year' },
              { value: '2024', label: 'Founded' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <span className="font-[family-name:var(--font-heading)] text-4xl md:text-5xl font-light text-[#B8975A]">
                  {stat.value}
                </span>
                <span
                  className="block text-xs mt-2 font-[family-name:var(--font-label)] uppercase tracking-[0.15em] transition-colors duration-[400ms]"
                  style={{ color: warm.textMuted }}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: light.bg }}
      >
        <div
          ref={closingReveal.ref}
          className="max-w-3xl mx-auto px-6 md:px-16 lg:px-24 text-center"
        >
          <div className="flex justify-center mb-8">
            <svg width="40" height="32" viewBox="0 0 40 32" fill="none">
              <path d="M0 32V19.2C0 6.4 8.8 0 17.6 0l-1.6 6.4C10.4 8 8 12.8 8 19.2h8V32H0zM24 32V19.2C24 6.4 32.8 0 41.6 0L40 6.4C34.4 8 32 12.8 32 19.2h8V32H24z" fill="#B8975A" opacity="0.15" />
            </svg>
          </div>
          <p
            className="font-[family-name:var(--font-heading)] text-xl md:text-2xl font-light leading-relaxed transition-colors duration-[400ms]"
            style={{ color: light.text }}
          >
            Sarah&apos;s journey is defined by a profound{' '}
            <em className="italic text-[#B8975A]">passion for luxury experiences</em>{' '}
            and a commitment to{' '}
            <em className="italic text-[#B8975A]">connecting people</em>.
            Her vision has shaped The Club into an exclusive platform where
            like-minded individuals converge, creating a space where{' '}
            <em className="italic text-[#B8975A]">luxury meets meaningful connections</em>.
          </p>
          <p
            className="mt-6 text-sm leading-relaxed transition-colors duration-[400ms]"
            style={{ color: light.textMuted }}
          >
            A story woven with threads of fashion, client relations,
            and the art of bringing people together in the lap of luxury.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div ref={ctaReveal.ref} className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light text-white mb-4">
            Join the <em className="italic text-[#B8975A]">conversation</em>
          </h2>
          <p
            className="mb-10 transition-colors duration-[400ms]"
            style={{ color: dark.textMuted }}
          >
            Ready to connect with exceptional people? Applications are reviewed
            personally by Sarah and the team.
          </p>
          <MagneticButton strength={0.3}>
            <Link
              href="/membership-application"
              className="inline-flex items-center gap-3 px-10 py-4 bg-[#B8975A] hover:bg-[#D4B978] text-white text-sm font-medium tracking-[0.1em] uppercase transition-all duration-500 hover:tracking-[0.15em]"
            >
              Apply for Membership
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </MagneticButton>
        </div>
      </section>
    </>
  )
}
