'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// Auto-rotating testimonial carousel — text only, no portraits.
// Premium behaviour:
//   • Auto-advances every 7s with a 1s opacity cross-fade
//   • Pauses on hover so the user can finish reading
//   • Bronze hairline progress indicators beneath; clicking jumps
//     to that slide (also acts as a manual nav without arrows)
//   • One row of attribution: NAME · ROLE · COMPANY

export interface CarouselTestimonial {
  id: string
  person_name: string
  person_title: string | null
  company_name: string | null
  quote_text: string
}

const ROTATE_MS = 3000

export function VoicesCarousel({ testimonials }: { testimonials: CarouselTestimonial[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || testimonials.length <= 1) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % testimonials.length)
    }, ROTATE_MS)
    return () => clearInterval(t)
  }, [paused, testimonials.length])

  if (testimonials.length === 0) return null

  return (
    <div
      className="max-w-4xl mx-auto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Stack of slides. Only one is visible at a time — the others
          are at opacity-0 so the layout doesn't jump as they swap. */}
      <div className="relative min-h-[240px] lg:min-h-[200px]">
        {testimonials.map((t, i) => (
          <article
            key={t.id}
            aria-hidden={i !== index}
            className={cn(
              'absolute inset-0 transition-opacity duration-1000 ease-out',
              i === index ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
          >
            {/* Hairline above the quote */}
            <div className="flex justify-center mb-6">
              <span className="block h-px w-16 bg-bronze/50" />
            </div>

            {/* Quote */}
            <blockquote className="text-center max-w-3xl mx-auto">
              <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.375rem,2.4vw,2rem)] leading-[1.5] text-ivory">
                <span aria-hidden className="text-bronze/40 mr-1 not-italic">
                  “
                </span>
                {t.quote_text}
                <span aria-hidden className="text-bronze/40 ml-1 not-italic">
                  ”
                </span>
              </p>
            </blockquote>

            {/* Attribution row: NAME · ROLE · COMPANY */}
            <div className="mt-8 flex justify-center">
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-center">
                <span className="text-bronze-light">{t.person_name}</span>
                {t.person_title && (
                  <>
                    <span className="text-slate-haze">·</span>
                    <span className="text-ivory-soft">{t.person_title}</span>
                  </>
                )}
                {t.company_name && (
                  <>
                    <span className="text-slate-haze">·</span>
                    <span className="text-ivory-soft/80">{t.company_name}</span>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Progress indicators — thicker bars (3px instead of 1px) so the
          length swap reads at a glance. Active one is long + bronze;
          inactive are short + graphite. Clickable jumps to that slide;
          the bar widths animate over 700ms when the active index moves
          so the transition between long-and-short is part of the rhythm. */}
      <div className="flex justify-center items-center gap-3 mt-10">
        {testimonials.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show testimonial ${i + 1}`}
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
