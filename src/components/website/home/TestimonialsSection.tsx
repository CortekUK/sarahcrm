'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useReveal } from './useReveal'
import { useTheme, themeColors } from '../ThemeContext'
import { gsap } from 'gsap'

const testimonials = [
  {
    quote: 'The Club has introduced me to people who have genuinely changed the trajectory of my business. The quality of connections here is unlike anything else I\u2019ve experienced.',
    name: 'James Hartley',
    role: 'CEO, Hartley Ventures',
  },
  {
    quote: 'Sarah has an extraordinary gift for knowing exactly who you need to meet. Within my first quarter, I\u2019d secured two partnerships that would have taken years to build organically.',
    name: 'Victoria Chen',
    role: 'Founder, Maison Chen',
  },
  {
    quote: 'It\u2019s not networking \u2014 it\u2019s relationship architecture. The events are impeccable, the members are genuine, and the introductions are always considered.',
    name: 'Oliver Bradshaw',
    role: 'MD, Northern Capital Group',
  },
]

export function TestimonialsSection() {
  const { mode } = useTheme()
  const t = themeColors[mode].light
  const [active, setActive] = useState(0)
  const section = useReveal(0.2)
  const quoteRefs = useRef<(HTMLDivElement | null)[]>([])
  const isAnimating = useRef(false)

  const animateTo = useCallback((nextIndex: number) => {
    if (isAnimating.current || nextIndex === active) return
    isAnimating.current = true

    const currentEl = quoteRefs.current[active]
    const nextEl = quoteRefs.current[nextIndex]

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReducedMotion || !currentEl || !nextEl) {
      setActive(nextIndex)
      isAnimating.current = false
      return
    }

    gsap.to(currentEl, {
      opacity: 0,
      y: -20,
      duration: 0.4,
      ease: 'power2.in',
      onComplete: () => {
        setActive(nextIndex)
        gsap.fromTo(nextEl,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: 'power2.out',
            onComplete: () => { isAnimating.current = false },
          }
        )
      },
    })
  }, [active])

  const next = useCallback(() => {
    animateTo((active + 1) % testimonials.length)
  }, [active, animateTo])

  useEffect(() => {
    const timer = setInterval(next, 8000)
    return () => clearInterval(timer)
  }, [next])

  return (
    <section
      className="relative overflow-hidden transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=1920&q=80"
          alt=""
          fill
          className="object-cover opacity-[0.04]"
          sizes="100vw"
        />
      </div>

      <div
        ref={section.ref}
        className="relative max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24 py-28 md:py-40"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left */}
          <div className="lg:col-span-3">
            <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
              Testimonials
            </span>
            <h2
              className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light leading-[1.15] transition-colors duration-[400ms]"
              style={{ color: t.text }}
            >
              In their
              <br />
              own words
            </h2>

            {/* Indicators */}
            <div className="flex items-center gap-3 mt-8">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => animateTo(i)}
                  className="relative h-5 flex items-center"
                  aria-label={`Testimonial ${i + 1}`}
                >
                  <div
                    className="h-px transition-all duration-700"
                    style={{
                      width: i === active ? '40px' : '20px',
                      backgroundColor: i === active ? '#B8975A' : t.border,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Right — quote */}
          <div className="lg:col-span-8 lg:col-start-5">
            <div className="relative min-h-[200px]">
              <span className="absolute -top-6 -left-3 font-[family-name:var(--font-heading)] text-[10rem] leading-none text-[#B8975A]/[0.06] pointer-events-none select-none">
                &ldquo;
              </span>

              {testimonials.map((item, i) => (
                <div
                  key={i}
                  ref={(el) => { quoteRefs.current[i] = el }}
                  className={`${
                    i === active
                      ? 'relative'
                      : 'absolute inset-0 opacity-0'
                  }`}
                >
                  <blockquote>
                    <p
                      className="font-[family-name:var(--font-heading)] text-[clamp(1.25rem,2.5vw,2rem)] font-light leading-[1.5] italic transition-colors duration-[400ms]"
                      style={{ color: t.text }}
                    >
                      &ldquo;{item.quote}&rdquo;
                    </p>
                    <footer className="mt-8 flex items-center gap-4">
                      <div className="w-10 h-px bg-[#B8975A]" />
                      <div>
                        <cite
                          className="font-[family-name:var(--font-body)] text-sm font-semibold not-italic tracking-wide transition-colors duration-[400ms]"
                          style={{ color: t.text }}
                        >
                          {item.name}
                        </cite>
                        <p
                          className="font-[family-name:var(--font-body)] text-xs mt-0.5 transition-colors duration-[400ms]"
                          style={{ color: t.textMuted }}
                        >
                          {item.role}
                        </p>
                      </div>
                    </footer>
                  </blockquote>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
