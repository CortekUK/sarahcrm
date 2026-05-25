'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

// Auto-rotating event card. Sits in the Forthcoming chapter on the
// homepage. Same rhythm as VoicesCarousel — cross-fade between slides
// every ROTATE_MS, pause on hover, thicker bronze hairline indicators
// with active long / inactive short, clickable to jump.

export interface CarouselEvent {
  id: string
  slug: string
  title: string
  start_date: string
  venue_name: string | null
  venue_city: string | null
  event_type: string | null
  cover_image_url: string | null
  description: string | null
}

const ROTATE_MS = 3000

export function EventsCarousel({ events }: { events: CarouselEvent[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || events.length <= 1) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % events.length)
    }, ROTATE_MS)
    return () => clearInterval(t)
  }, [paused, events.length])

  if (events.length === 0) return null

  return (
    <div
      className="max-w-[1400px] mx-auto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slide stack — all slides occupy the same grid cell so the
          container sizes to the tallest, keeping the indicator bars
          clear of the artwork on every breakpoint. */}
      <div className="relative grid">
        {events.map((ev, i) => (
          <article
            key={ev.id}
            aria-hidden={i !== index}
            style={{ gridArea: '1 / 1' }}
            className={cn(
              'transition-opacity duration-1000 ease-out',
              i === index ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
          >
            <Link
              href={ev.slug && ev.slug !== '#' ? `/events/${ev.slug}` : '/events'}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center"
            >
              {/* Image column */}
              <div className="lg:col-span-7 relative aspect-[16/10] overflow-hidden bg-graphite">
                {ev.cover_image_url ? (
                  <Image
                    src={ev.cover_image_url}
                    alt={ev.title}
                    fill
                    sizes="(min-width: 1024px) 60vw, 100vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-[family-name:var(--font-display)] text-7xl text-slate-dim">
                      {ev.title.charAt(0)}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-ink/30 via-transparent to-transparent" />
                <div className="film-grain-night" />

                {/* Date pip — top-left of image */}
                <div className="absolute top-5 left-5 flex items-center gap-3 z-10">
                  <span className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory">
                    {formatDate(ev.start_date)}
                  </span>
                  <span className="h-px w-8 bg-bronze/60" />
                </div>

                {/* Bronze hairline corner brackets */}
                <span className="absolute top-4 left-4 w-6 h-px bg-bronze/70 pointer-events-none" />
                <span className="absolute top-4 left-4 w-px h-6 bg-bronze/70 pointer-events-none" />
                <span className="absolute bottom-4 right-4 w-6 h-px bg-bronze/70 pointer-events-none" />
                <span className="absolute bottom-4 right-4 w-px h-6 bg-bronze/70 pointer-events-none" />
              </div>

              {/* Copy column */}
              <div className="lg:col-span-5 lg:pl-4">
                {ev.event_type && (
                  <p className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light">
                    {ev.event_type.replace(/_/g, ' ')}
                  </p>
                )}
                <h3 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(1.75rem,2.6vw,2.5rem)] text-ivory leading-[1.1]">
                  {ev.title}
                </h3>
                {(ev.venue_name || ev.venue_city) && (
                  <p className="mt-4 text-[12.5px] text-slate-haze uppercase tracking-[0.22em]">
                    {[ev.venue_name, ev.venue_city].filter(Boolean).join(' · ')}
                  </p>
                )}
                {ev.description && (
                  <p className="mt-6 body-prose line-clamp-3 max-w-md">
                    {ev.description}
                  </p>
                )}
                <div className="mt-7 inline-flex items-center gap-3 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300">
                  Reserve
                  <ArrowUpRight size={13} strokeWidth={1.5} />
                </div>
              </div>
            </Link>
          </article>
        ))}
      </div>

      {/* Progress indicators — thicker bronze bars, active long */}
      <div className="flex justify-center items-center gap-3 mt-12">
        {events.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show event ${i + 1}`}
            className={cn(
              'h-[3px] rounded-full transition-all duration-700 ease-out',
              i === index
                ? 'w-16 bg-bronze'
                : 'w-5 bg-graphite-line hover:bg-bronze/50',
            )}
          />
        ))}
      </div>
    </div>
  )
}
