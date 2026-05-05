'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme, themeColors } from '../ThemeContext'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Database } from '@/types/database'

gsap.registerPlugin(ScrollTrigger)

type Event = Database['public']['Tables']['events']['Row']

const eventTypeLabels: Record<string, string> = {
  member_event: 'Member Event',
  curated_luxury: 'Curated Luxury',
  retreat: 'Retreat',
}

interface EventDetailHeroProps {
  event: Event
}

export function EventDetailHero({ event }: EventDetailHeroProps) {
  const { mode } = useTheme()
  const t = themeColors[mode].dark
  const sectionRef = useRef<HTMLElement>(null)
  const imageWrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLSpanElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const backRef = useRef<HTMLAnchorElement>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)

  const eventDate = new Date(event.start_date)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

      tl.fromTo(backRef.current, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.6 })
        .fromTo(dateRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.2')
        .fromTo(headlineRef.current, { clipPath: 'inset(0 0 100% 0)', y: 30 }, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1 }, '-=0.3')

      if (badgeRef.current) {
        tl.fromTo(badgeRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5 }, '-=0.6')
      }

      // Parallax
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

      // Content fade-out on scroll
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
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      {/* Grain texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
        backgroundSize: '128px 128px',
      }} />

      {/* Background image */}
      <div ref={imageWrapRef} className="absolute inset-0">
        <Image
          src={event.cover_image_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1920&q=80'}
          alt={event.title}
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div
          className="absolute inset-0 transition-all duration-[400ms]"
          style={{ background: `linear-gradient(to top, ${t.bg}, ${t.overlay || 'rgba(28,25,23,0.5)'} 50%, transparent)` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        className="relative max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24 pb-16 md:pb-20 w-full"
      >
        <Link
          ref={backRef}
          href="/events"
          className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors mb-6"
          style={{ opacity: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M13 7H1M6 2L1 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All events
        </Link>

        {event.event_type && (
          <span
            ref={badgeRef}
            className="inline-block border border-white/20 px-4 py-1.5 mb-5 font-[family-name:var(--font-label)] text-[0.6rem] uppercase tracking-[0.2em] text-white/70"
            style={{ opacity: 0 }}
          >
            {eventTypeLabels[event.event_type] || event.event_type}
          </span>
        )}

        <span
          ref={dateRef}
          className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block"
          style={{ opacity: 0 }}
        >
          {eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
        <h1
          ref={headlineRef}
          className="font-[family-name:var(--font-heading)] text-4xl md:text-5xl lg:text-6xl font-light text-white leading-[1.1]"
          style={{ clipPath: 'inset(0 0 100% 0)' }}
        >
          {event.title}
        </h1>
      </div>
    </section>
  )
}
