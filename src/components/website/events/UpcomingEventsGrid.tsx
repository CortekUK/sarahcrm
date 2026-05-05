'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useReveal } from '../home/useReveal'
import { useTheme, themeColors } from '../ThemeContext'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Database } from '@/types/database'

gsap.registerPlugin(ScrollTrigger)

type Event = Database['public']['Tables']['events']['Row']
type EventType = Database['public']['Enums']['event_type']

const filters: { label: string; value: EventType | 'all' }[] = [
  { label: 'All Events', value: 'all' },
  { label: 'Member Events', value: 'member_event' },
  { label: 'Curated Luxury', value: 'curated_luxury' },
  { label: 'Retreats', value: 'retreat' },
]

interface UpcomingEventsGridProps {
  events: Event[]
}

export function UpcomingEventsGrid({ events }: UpcomingEventsGridProps) {
  const { mode } = useTheme()
  const t = themeColors[mode].light
  const heading = useReveal(0.2)
  const cardsContainerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const [activeFilter, setActiveFilter] = useState<EventType | 'all'>('all')
  const [hasAnimated, setHasAnimated] = useState(false)

  const filtered = activeFilter === 'all'
    ? events
    : events.filter(e => e.event_type === activeFilter)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setHasAnimated(true)
      return
    }

    const ctx = gsap.context(() => {
      const cards = cardRefs.current.filter(Boolean)
      if (!cards.length) return

      gsap.from(cards, {
        y: 60,
        opacity: 0,
        scale: 0.97,
        duration: 1.2,
        stagger: 0.15,
        ease: 'power3.out',
        onComplete: () => setHasAnimated(true),
        scrollTrigger: {
          trigger: cardsContainerRef.current,
          start: 'top 85%',
          once: true,
        },
      })
    })

    return () => ctx.revert()
  }, [])

  // Animate cards on filter change (after initial animation)
  useEffect(() => {
    if (!hasAnimated) return
    const cards = cardRefs.current.filter(Boolean)
    if (!cards.length) return

    gsap.fromTo(cards,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' }
    )
  }, [activeFilter, hasAnimated])

  return (
    <section
      className="py-20 md:py-28 overflow-hidden transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      <div className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24">
        <div ref={heading.ref} className="mb-12 md:mb-16">
          <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-8 block">
            Upcoming Events
          </span>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {filters.map(({ label, value }) => {
              const isActive = activeFilter === value
              return (
                <button
                  key={value}
                  onClick={() => setActiveFilter(value)}
                  className="font-[family-name:var(--font-label)] text-[0.65rem] uppercase tracking-[0.15em] px-5 py-2.5 transition-all duration-300"
                  style={{
                    backgroundColor: isActive ? '#B8975A' : 'transparent',
                    color: isActive ? '#FFFFFF' : t.textMuted,
                    border: `1px solid ${isActive ? '#B8975A' : t.border}`,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p
            className="text-lg font-[family-name:var(--font-body)] transition-colors duration-[400ms]"
            style={{ color: t.textMuted }}
          >
            No events of this type are currently scheduled.
          </p>
        ) : (
          <div
            ref={cardsContainerRef}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6"
          >
            {filtered.map((event, i) => (
              <Link
                key={event.id}
                ref={(el) => { cardRefs.current[i] = el }}
                href={`/events/${event.slug}`}
                className="group block"
              >
                <div className="relative aspect-[3/4] overflow-hidden">
                  <Image
                    src={event.cover_image_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&q=80'}
                    alt={event.title}
                    fill
                    className="object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.06]"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, rgba(28,25,23,0.9), rgba(28,25,23,0.4) 40%, transparent)' }}
                  />

                  {/* Date badge */}
                  <div className="absolute top-5 left-5 bg-black/50 backdrop-blur-sm border border-white/15 px-4 py-2">
                    <span className="font-[family-name:var(--font-label)] text-[0.65rem] uppercase tracking-[0.2em] text-white">
                      {new Date(event.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>

                  {/* Event type badge */}
                  {event.event_type && event.event_type !== 'member_event' && (
                    <div className="absolute top-5 right-5 bg-black/50 backdrop-blur-sm border border-[#B8975A]/30 px-3 py-1.5">
                      <span className="font-[family-name:var(--font-label)] text-[0.55rem] uppercase tracking-[0.15em] text-[#B8975A]">
                        {event.event_type === 'curated_luxury' ? 'Curated' : 'Retreat'}
                      </span>
                    </div>
                  )}

                  {/* Title + venue overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-6 pb-8">
                    <h3 className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl leading-tight group-hover:text-[#B8975A] transition-colors duration-500 text-white" style={{ fontWeight: 400 }}>
                      {event.title}
                    </h3>
                    {event.venue_name && (
                      <p className="font-[family-name:var(--font-label)] text-[0.6rem] uppercase tracking-[0.15em] text-white/40 mt-3">
                        {event.venue_name}{event.venue_city ? `, ${event.venue_city}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
