'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useReveal } from './useReveal'
import { useTheme, themeColors } from '../ThemeContext'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const upcomingEvents = [
  {
    title: 'Summer Soir\u00e9e',
    subtitle: 'at The Ivy',
    date: '14 Jun',
    venue: 'The Ivy, Manchester',
    image: 'https://images.unsplash.com/photo-1608538242779-113f7b19baa1?w=1200&q=90',
    slug: 'summer-soiree-ivy',
  },
  {
    title: 'Founders\u2019 Dinner',
    subtitle: 'London Edition',
    date: '28 Jun',
    venue: 'The Ned, London',
    image: 'https://images.unsplash.com/photo-1630484179285-076074c31cc0?w=1200&q=90',
    slug: 'founders-dinner-london',
  },
  {
    title: 'Luxury Retreat',
    subtitle: 'Lake District',
    date: '12 Jul',
    venue: 'Gilpin Hotel & Lake House',
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=90',
    slug: 'luxury-retreat-lake-district',
  },
]

export function EventsPreview() {
  const { mode } = useTheme()
  const t = themeColors[mode].dark
  const heading = useReveal(0.2)
  const cardsContainerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const ctx = gsap.context(() => {
      const cards = cardRefs.current.filter(Boolean)
      if (!cards.length) return

      gsap.from(cards, {
        y: 80,
        opacity: 0,
        scale: 0.95,
        duration: 1.2,
        stagger: 0.2,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: cardsContainerRef.current,
          start: 'top 85%',
          once: true,
        },
      })
    })

    return () => ctx.revert()
  }, [])

  return (
    <section
      className="py-24 md:py-36 overflow-hidden transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      <div className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24">
        {/* Section header */}
        <div
          ref={heading.ref}
          className="mb-16 md:mb-20"
        >
          <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
            Upcoming
          </span>
          <h2
            className="font-[family-name:var(--font-heading)] text-[clamp(2rem,4vw,3.5rem)] leading-[1.1] transition-colors duration-[400ms]"
            style={{ color: t.text, fontWeight: 400 }}
          >
            Extraordinary evenings,
            <br />
            unforgettable connections
          </h2>
          <Link
            href="/events"
            className="group mt-8 inline-flex items-center gap-3 font-[family-name:var(--font-label)] text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[#B8975A] hover:text-[#D4B978] transition-colors"
          >
            All events
            <div className="w-6 h-px bg-current transition-all duration-500 group-hover:w-10" />
          </Link>
        </div>

        {/* Events grid — staggered cards */}
        <div
          ref={cardsContainerRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6"
        >
          {upcomingEvents.map((event, i) => (
            <Link
              key={event.slug}
              ref={(el) => { cardRefs.current[i] = el }}
              href={`/events/${event.slug}`}
              className="group block"
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                <Image
                  src={event.image}
                  alt={event.title}
                  fill
                  className="object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.06]"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <div
                  className="absolute inset-0 transition-colors duration-[400ms]"
                  style={{ background: `linear-gradient(to top, ${t.overlayHeavy}, ${t.overlay} 40%, transparent)` }}
                />

                <div className="absolute top-5 left-5 border border-white/20 px-4 py-2">
                  <span className="font-[family-name:var(--font-label)] text-[0.6rem] uppercase tracking-[0.2em] text-white/80">
                    {event.date}
                  </span>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-6 pb-8">
                  <h3 className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl leading-tight group-hover:text-[#B8975A] transition-colors duration-500" style={{ color: '#FFFFFF', fontWeight: 400 }}>
                    {event.title}
                  </h3>
                  <span className="block font-[family-name:var(--font-heading)] text-lg md:text-xl font-light text-white/60 mt-1">
                    {event.subtitle}
                  </span>
                  <p className="font-[family-name:var(--font-label)] text-[0.6rem] uppercase tracking-[0.15em] text-white/40 mt-3">
                    {event.venue}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
