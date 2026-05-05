'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useReveal } from './useReveal'
import { useTheme, themeColors } from '../ThemeContext'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const stats = [
  { number: 150, suffix: '+', label: 'Curated members' },
  { number: 3, suffix: '', label: 'Cities' },
  { number: 50, suffix: '+', label: 'Events per year' },
  { number: 92, suffix: '%', label: 'Renewal rate' },
]

export function IntroSection() {
  const { mode } = useTheme()
  const t = themeColors[mode].light
  const a = themeColors[mode].accent
  const heading = useReveal(0.2)
  const image1 = useReveal(0.15)
  const image2 = useReveal({ threshold: 0.15, scale: 0.95 })
  const statsRef = useRef<HTMLDivElement>(null)
  const numberRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      stats.forEach((stat, i) => {
        const el = numberRefs.current[i]
        if (el) el.textContent = `${stat.number}${stat.suffix}`
      })
      return
    }

    const ctx = gsap.context(() => {
      stats.forEach((stat, i) => {
        const el = numberRefs.current[i]
        if (!el) return

        const counter = { value: 0 }
        gsap.to(counter, {
          value: stat.number,
          duration: 2,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: statsRef.current,
            start: 'top 85%',
            once: true,
          },
          onUpdate: () => {
            el.textContent = `${Math.round(counter.value)}${stat.suffix}`
          },
        })
      })

      gsap.from(statsRef.current, {
        opacity: 0,
        duration: 1,
        scrollTrigger: {
          trigger: statsRef.current,
          start: 'top 85%',
          once: true,
        },
      })
    })

    return () => ctx.revert()
  }, [])

  return (
    <section
      className="relative transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      {/* Manifesto strip */}
      <div
        className="py-24 md:py-36 border-b transition-colors duration-[400ms]"
        style={{ borderColor: t.border }}
      >
        <div
          ref={heading.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
            A Different Kind of Club
          </span>
          <h2
            className="font-[family-name:var(--font-heading)] text-[clamp(1.75rem,4.5vw,4.5rem)] font-light leading-[1.05] tracking-[-0.01em] max-w-5xl transition-colors duration-[400ms]"
            style={{ color: t.text }}
          >
            We don&apos;t do networking.
            <br />
            We architect{' '}
            <em className="italic text-[#B8975A]">relationships</em>.
          </h2>
        </div>
      </div>

      {/* Asymmetric image + text section */}
      <div className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24 py-20 md:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-center">
          {/* Left column */}
          <div className="lg:col-span-6 relative">
            <div
              ref={image1.ref}
              className="relative aspect-[3/4] overflow-hidden"
            >
              <Image
                src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=85"
                alt="Fine dining at a Club event"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
            <div
              ref={image2.ref}
              className="absolute -bottom-12 -right-6 lg:right-[-60px] w-[200px] md:w-[260px] aspect-square overflow-hidden border-8 shadow-xl hidden md:block transition-colors duration-[400ms]"
              style={{ borderColor: t.imageBorder }}
            >
              <Image
                src="https://images.unsplash.com/photo-1665575061295-bd3aa839ff8c?w=400&q=85"
                alt="Candlelit table with flowers"
                fill
                className="object-cover"
                sizes="260px"
              />
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-5 lg:col-start-8">
            <p
              className="font-[family-name:var(--font-body)] text-base md:text-lg leading-[1.85] mb-6 transition-colors duration-[400ms]"
              style={{ color: t.textSecondary }}
            >
              The Club by Sarah Restrick is a carefully curated community of
              exceptional individuals&thinsp;&mdash;&thinsp;founders, CEOs, investors, and
              creative leaders&thinsp;&mdash;&thinsp;who value discretion, quality, and
              meaningful connection above all else.
            </p>
            <p
              className="font-[family-name:var(--font-body)] text-base md:text-lg leading-[1.85] mb-10 transition-colors duration-[400ms]"
              style={{ color: t.textMuted }}
            >
              Through intimate dinners at extraordinary venues, luxury retreats,
              and bespoke introductions, we create the conditions for
              relationships that transform businesses and enrich lives.
              Membership is by invitation and application only.
            </p>
            <Link
              href="/about"
              className="group inline-flex items-center gap-3 font-[family-name:var(--font-label)] text-[0.7rem] font-medium uppercase tracking-[0.2em] hover:text-[#B8975A] transition-colors duration-500"
              style={{ color: t.text }}
            >
              Meet our founder
              <div className="w-8 h-px bg-current transition-all duration-500 group-hover:w-12" />
            </Link>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div
        ref={statsRef}
        className="transition-colors duration-[400ms]"
        style={{ backgroundColor: a.bg }}
      >
        <div className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24">
          <div
            className="grid grid-cols-2 md:grid-cols-4 divide-x transition-colors duration-[400ms]"
            style={{ borderColor: a.border }}
          >
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className="py-10 md:py-14 text-center"
                style={{ borderColor: a.border }}
              >
                <span
                  ref={(el) => { numberRefs.current[i] = el }}
                  className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light text-[#B8975A] block"
                >
                  0{stat.suffix}
                </span>
                <span
                  className="font-[family-name:var(--font-label)] text-[0.6rem] uppercase tracking-[0.2em] mt-2 block transition-colors duration-[400ms]"
                  style={{ color: a.textMuted }}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
