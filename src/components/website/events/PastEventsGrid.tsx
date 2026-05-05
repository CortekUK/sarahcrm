'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useReveal } from '../home/useReveal'
import { useTheme, themeColors } from '../ThemeContext'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Database } from '@/types/database'

gsap.registerPlugin(ScrollTrigger)

type Event = Database['public']['Tables']['events']['Row']

interface PastEventsGridProps {
  events: Event[]
}

export function PastEventsGrid({ events }: PastEventsGridProps) {
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
        y: 50,
        opacity: 0,
        duration: 1,
        stagger: 0.1,
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

  if (events.length === 0) return null

  const displayed = events.slice(0, 8)

  return (
    <section
      className="py-20 md:py-28 overflow-hidden transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      <div className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24">
        <div ref={heading.ref} className="mb-16 md:mb-20">
          <span
            className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block"
          >
            Past Events
          </span>
        </div>

        <div
          ref={cardsContainerRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6"
        >
          {displayed.map((event, i) => (
            <Link
              key={event.id}
              ref={(el) => { cardRefs.current[i] = el }}
              href={`/events/${event.slug}`}
              className="group block"
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                <Image
                  src={event.cover_image_url || 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400&q=80'}
                  alt={event.title}
                  fill
                  className="object-cover opacity-60 transition-all duration-[800ms] ease-out group-hover:scale-[1.04] group-hover:opacity-80"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              </div>
              <h3
                className="font-[family-name:var(--font-body)] text-sm mt-3 group-hover:text-[#B8975A] transition-colors duration-300"
                style={{ color: t.textMuted }}
              >
                {event.title}
              </h3>
              <p
                className="text-xs mt-1 transition-colors duration-[400ms]"
                style={{ color: t.textDim }}
              >
                {new Date(event.start_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
