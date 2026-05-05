'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { useReveal } from './useReveal'
import { useTheme, themeColors } from '../ThemeContext'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const locations = [
  {
    city: 'Manchester',
    tagline: 'Where it all began',
    description:
      'Our founding city. Intimate dinners at the finest private dining rooms in the Northern Quarter and beyond.',
    image:
      'https://images.unsplash.com/photo-1550945160-35ad09cb2186?w=1200&q=90',
    imageAlt: 'Manchester cityscape at sunset with trams and skyline',
  },
  {
    city: 'Leeds',
    tagline: 'The Northern Powerhouse',
    description:
      'A thriving community of founders and investors shaping the future of the North from Yorkshire\u2019s capital.',
    image:
      'https://images.unsplash.com/photo-1770847764886-8303052ad79e?w=1200&q=90',
    imageAlt: 'Leeds waterfront canal reflections at dusk',
  },
  {
    city: 'London',
    tagline: 'The newest chapter',
    description:
      'Exclusive gatherings at Mayfair\u2019s most prestigious private members\u2019 venues, connecting Northern ambition with the capital.',
    image:
      'https://images.unsplash.com/photo-1513026705753-bc3fffca8bf4?w=1200&q=90',
    imageAlt: 'Aerial view of London and the Thames at night',
  },
]

export function LocationsSection() {
  const { mode } = useTheme()
  const t = themeColors[mode].warm
  const heading = useReveal(0.2)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    if (prefersReducedMotion) return

    const ctx = gsap.context(() => {
      const cards = cardRefs.current.filter(Boolean)
      if (!cards.length) return

      gsap.from(cards, {
        y: 60,
        opacity: 0,
        duration: 1,
        stagger: 0.2,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top 80%',
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
        <div ref={heading.ref} className="mb-16 md:mb-20 text-center">
          <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
            Our Locations
          </span>
          <h2
            className="font-[family-name:var(--font-heading)] text-[clamp(2rem,4vw,3.5rem)] leading-[1.1] max-w-3xl mx-auto transition-colors duration-[400ms]"
            style={{ color: t.text, fontWeight: 400 }}
          >
            Experience luxury
            <br />
            <em className="italic text-[#B8975A]">by location</em>
          </h2>
        </div>

        {/* Location cards */}
        <div
          ref={containerRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8"
        >
          {locations.map((loc, i) => (
            <div
              key={loc.city}
              ref={(el) => {
                cardRefs.current[i] = el
              }}
              className="group"
            >
              {/* Image */}
              <div className="relative aspect-[4/3] overflow-hidden mb-6">
                <Image
                  src={loc.image}
                  alt={loc.imageAlt}
                  fill
                  className="object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.04]"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1714]/40 via-transparent to-transparent" />
                {/* City name overlay */}
                <div className="absolute bottom-5 left-5">
                  <span className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl text-white" style={{ fontWeight: 400 }}>
                    {loc.city}
                  </span>
                </div>
              </div>

              {/* Text content */}
              <div>
                <span className="font-[family-name:var(--font-label)] text-[0.6rem] uppercase tracking-[0.2em] text-[#B8975A] block mb-2">
                  {loc.tagline}
                </span>
                <p
                  className="font-[family-name:var(--font-body)] text-[0.95rem] leading-[1.85] font-light transition-colors duration-[400ms]"
                  style={{ color: t.textMuted }}
                >
                  {loc.description}
                </p>
              </div>

              {/* Divider */}
              <div
                className="mt-6 h-px group-hover:bg-[#B8975A] transition-colors duration-500"
                style={{ backgroundColor: t.border }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
