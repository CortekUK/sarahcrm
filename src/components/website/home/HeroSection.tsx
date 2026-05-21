'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useTheme } from '../ThemeContext'
import { MagneticButton } from '../MagneticButton'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const themes = {
  evening: {
    bg: '#1C1917',
    text: '#FFFFFF',
    subtext: 'rgba(255,255,255,0.5)',
    border: 'rgba(255,255,255,0.06)',
    meta: 'rgba(255,255,255,0.25)',
    ctaOutline: 'rgba(255,255,255,0.2)',
    ctaOutlineHover: 'rgba(255,255,255,0.5)',
    ctaOutlineText: 'rgba(255,255,255,0.7)',
    scrollText: 'rgba(255,255,255,0.4)',
    image: 'https://images.unsplash.com/photo-1748551204300-f227d5af350f?w=1920&q=85',
    imageAlt: 'Elegant private dining room with gold chandelier',
  },
  day: {
    bg: '#FAFAF7',
    text: '#1A1714',
    subtext: '#6B6560',
    border: '#E5E0D8',
    meta: '#A09A93',
    ctaOutline: 'rgba(26,23,20,0.2)',
    ctaOutlineHover: 'rgba(26,23,20,0.5)',
    ctaOutlineText: 'rgba(26,23,20,0.7)',
    scrollText: 'rgba(26,23,20,0.3)',
    image: 'https://images.unsplash.com/photo-1747153634172-8caa81327ca6?w=1920&q=85',
    imageAlt: 'Grand European dining room with chandeliers and natural light',
  },
} as const

export function HeroSection() {
  const { mode } = useTheme()
  const sectionRef = useRef<HTMLElement>(null)
  const imageWrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const goldLineRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const wordsRef = useRef<(HTMLSpanElement | null)[]>([])
  const connectRef = useRef<HTMLSpanElement>(null)
  const subtextRef = useRef<HTMLParagraphElement>(null)
  const ctasRef = useRef<HTMLDivElement>(null)
  const scrollIndicatorRef = useRef<HTMLDivElement>(null)

  const t = themes[mode]

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const ctx = gsap.context(() => {
      // Entry timeline
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

      tl.fromTo(goldLineRef.current, { scaleX: 0, transformOrigin: 'left' }, { scaleX: 1, duration: 0.8 })
        .fromTo(labelRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.3')
        .fromTo(
          wordsRef.current.filter(Boolean),
          { clipPath: 'inset(0 0 100% 0)', y: 20 },
          { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 0.9, stagger: 0.12 },
          '-=0.2'
        )
        .fromTo(connectRef.current, { clipPath: 'inset(0 0 100% 0)', y: 20 }, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 0.9 }, '-=0.5')
        .fromTo(subtextRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.4')
        .fromTo(ctasRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.5')
        .fromTo(scrollIndicatorRef.current, { opacity: 0 }, { opacity: 0.4, duration: 1 }, '-=0.3')

      // Parallax on scroll (direct DOM, no re-renders)
      if (imageWrapRef.current) {
        ScrollTrigger.create({
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => {
            const progress = self.progress
            gsap.set(imageWrapRef.current, { y: progress * 120 })
          },
        })
      }

      // Content fade-out on scroll
      if (contentRef.current) {
        ScrollTrigger.create({
          trigger: sectionRef.current,
          start: 'top top',
          end: '60% top',
          scrub: true,
          onUpdate: (self) => {
            const progress = self.progress
            gsap.set(contentRef.current, {
              opacity: 1 - progress,
              y: progress * 60,
            })
          },
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative h-[100dvh] overflow-hidden transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      {/* Grain texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
        backgroundSize: '128px 128px',
      }} />

      {/* Images — both loaded, opacity toggles for crossfade */}
      <div
        ref={imageWrapRef}
        className="absolute inset-0 lg:left-[50%] lg:top-[72px]"
      >
        {/* Evening image */}
        <div
          className="absolute inset-0 transition-opacity duration-[400ms]"
          style={{ opacity: mode === 'evening' ? 1 : 0 }}
        >
          <Image
            src={themes.evening.image}
            alt={themes.evening.imageAlt}
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
        </div>
        {/* Day image */}
        <div
          className="absolute inset-0 transition-opacity duration-[400ms]"
          style={{ opacity: mode === 'day' ? 1 : 0 }}
        >
          <Image
            src={themes.day.image}
            alt={themes.day.imageAlt}
            fill
            className="object-cover"
            sizes="100vw"
          />
        </div>

        {/* Mobile overlay */}
        <div
          className="absolute inset-0 lg:hidden transition-colors duration-[400ms]"
          style={{ backgroundColor: mode === 'evening' ? 'rgba(28,25,23,0.80)' : 'rgba(250,250,247,0.80)' }}
        />
        {/* Desktop: feather left edge */}
        <div
          className="hidden lg:block absolute inset-y-0 left-0 w-[30%] transition-all duration-[400ms]"
          style={{ background: `linear-gradient(to right, ${t.bg}, transparent)` }}
        />
        {/* Desktop: top fade */}
        <div
          className="hidden lg:block absolute inset-x-0 top-0 h-32 transition-all duration-[400ms]"
          style={{ background: `linear-gradient(to bottom, ${mode === 'evening' ? 'rgba(28,25,23,0.8)' : 'rgba(250,250,247,0.6)'}, transparent)` }}
        />
        {/* Desktop: bottom fade */}
        <div
          className="hidden lg:block absolute inset-x-0 bottom-0 h-40 transition-all duration-[400ms]"
          style={{ background: `linear-gradient(to top, ${mode === 'evening' ? 'rgba(28,25,23,0.9)' : 'rgba(250,250,247,0.7)'}, transparent)` }}
        />
      </div>

      {/* Content.
          `min-h-0` lets the flex column shrink under the natural height of
          its children — otherwise the huge headline pushes the top of the
          content past the hero, clipping "Where". */}
      <div
        ref={contentRef}
        className="relative h-full max-w-[1440px] mx-auto px-6 md:px-12 lg:px-24 flex flex-col justify-end pb-20 sm:pb-24 md:pb-32 lg:pb-36 min-h-0"
      >
        {/* Gold accent + label */}
        <div>
          <div ref={goldLineRef} className="w-10 sm:w-12 h-px bg-[#B8975A] mb-4 sm:mb-6" style={{ transform: 'scaleX(0)' }} />
          <span ref={labelRef} className="font-[family-name:var(--font-label)] text-[0.55rem] sm:text-[0.6rem] font-medium uppercase tracking-[0.25em] sm:tracking-[0.3em] text-[#B8975A]" style={{ opacity: 0 }}>
            By Invitation &amp; Application
          </span>
        </div>

        {/*
          Headline — clipPath word reveal.
          Font-size scaling was too aggressive: `clamp(2.8rem, 7.5vw, 7rem)`
          hit 7rem (112px) at any viewport ≥ 932px, which made
          "exceptional" too wide for the 55% column on common laptop
          breakpoints and pushed the first word ("Where") off the top of
          the 100dvh hero. New ramp tops out at 5.5rem (88px) and grows
          more gradually — fits comfortably on 1024–1920px wide screens
          while still reading hero-scale on ultrawides.
        */}
        <h1 className="mt-6 sm:mt-8 max-w-[88%] sm:max-w-[80%] md:max-w-[70%] lg:max-w-[55%]">
          {['Where', 'exceptional', 'minds'].map((word, i) => (
            <span
              key={word}
              ref={(el) => { wordsRef.current[i] = el }}
              className="block font-[family-name:var(--font-heading)] text-[clamp(2.25rem,5.5vw,5.5rem)] font-light leading-[0.95] tracking-[-0.02em] transition-colors duration-[400ms]"
              style={{
                color: t.text,
                clipPath: 'inset(0 0 100% 0)',
              }}
            >
              {word}
            </span>
          ))}
          <span
            ref={connectRef}
            className="block font-[family-name:var(--font-heading)] text-[clamp(2.25rem,5.5vw,5.5rem)] font-light italic text-[#B8975A] leading-[0.95] tracking-[-0.02em]"
            style={{ clipPath: 'inset(0 0 100% 0)' }}
          >
            connect
          </span>
        </h1>

        {/* Subtext */}
        <p
          ref={subtextRef}
          className="mt-5 sm:mt-7 md:mt-8 font-[family-name:var(--font-body)] text-[clamp(0.9rem,1.15vw,1.15rem)] max-w-md leading-relaxed font-light lg:max-w-[40%] transition-colors duration-[400ms]"
          style={{ color: t.subtext, opacity: 0 }}
        >
          A private members club for business leaders,
          entrepreneurs, and high-net-worth individuals.
        </p>

        {/* CTAs */}
        <div
          ref={ctasRef}
          className="mt-6 sm:mt-8 md:mt-10 flex flex-wrap items-center gap-3 sm:gap-5"
          style={{ opacity: 0 }}
        >
          <MagneticButton strength={0.3}>
            <Link
              href="/membership-application"
              className="group inline-flex items-center gap-3 px-6 sm:px-8 md:px-10 py-3 sm:py-3.5 md:py-4 bg-[#B8975A] text-white text-[0.7rem] sm:text-[0.75rem] md:text-[0.8rem] font-medium tracking-[0.1em] uppercase transition-all duration-500 hover:bg-[#D4B978] hover:tracking-[0.15em]"
            >
              Apply for Membership
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform duration-500 group-hover:translate-x-1">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </MagneticButton>
          <Link
            href="/events"
            className="inline-flex items-center px-5 sm:px-6 md:px-8 py-3 sm:py-3.5 md:py-4 text-[0.7rem] sm:text-[0.75rem] md:text-[0.8rem] font-medium tracking-[0.1em] uppercase transition-all duration-[400ms]"
            style={{
              color: t.ctaOutlineText,
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: t.ctaOutline,
            }}
          >
            View Events
          </Link>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-all duration-[400ms]"
        style={{ borderTop: `1px solid ${t.border}` }}
      >
        <div className="flex items-center justify-center px-6 md:px-16 lg:px-24 py-5">
          <span
            className="font-[family-name:var(--font-label)] text-[0.55rem] uppercase tracking-[0.35em] transition-colors duration-[400ms]"
            style={{ color: t.meta }}
          >
            Est. 2024
          </span>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        ref={scrollIndicatorRef}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
        style={{ opacity: 0 }}
      >
        <span
          className="font-[family-name:var(--font-label)] text-[0.5rem] uppercase tracking-[0.3em] transition-colors duration-[400ms]"
          style={{ color: t.scrollText }}
        >
          Scroll
        </span>
        <div
          className="w-px h-10 animate-pulse transition-all duration-[400ms]"
          style={{
            background: `linear-gradient(to bottom, ${t.scrollText}, transparent)`,
          }}
        />
      </div>
    </section>
  )
}
