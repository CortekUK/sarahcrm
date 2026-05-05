'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { MagneticButton } from '../MagneticButton'
import { useTheme, themeColors } from '../ThemeContext'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function CTASection() {
  const { mode } = useTheme()
  const t = themeColors[mode].light
  const sectionRef = useRef<HTMLElement>(null)
  const goldLineRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const subtextRef = useRef<HTMLParagraphElement>(null)
  const ctasRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'power3.out' },
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 70%',
          once: true,
        },
      })

      tl.fromTo(goldLineRef.current, { scaleX: 0, transformOrigin: 'center' }, { scaleX: 1, duration: 0.8 })
        .fromTo(labelRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.3')
        .fromTo(headingRef.current, { clipPath: 'inset(0 0 100% 0)', y: 30 }, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1 }, '-=0.2')
        .fromTo(subtextRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.5')
        .fromTo(ctasRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.4')
        .fromTo(detailRef.current, { opacity: 0 }, { opacity: 1, duration: 0.6 }, '-=0.3')
    })

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative py-36 md:py-52 overflow-hidden transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      {/* Grain overlay */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
        backgroundSize: '128px 128px',
      }} />

      {/* Content */}
      <div className="relative max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24 text-center">
        <div ref={goldLineRef} className="w-12 h-px bg-[#B8975A] mx-auto mb-10" style={{ transform: 'scaleX(0)' }} />

        <span ref={labelRef} className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-8 block" style={{ opacity: 0 }}>
          By Invitation &amp; Application
        </span>

        <h2
          ref={headingRef}
          className="font-[family-name:var(--font-heading)] text-[clamp(2rem,5vw,5rem)] leading-[1.05] tracking-[-0.01em] max-w-4xl mx-auto transition-colors duration-[400ms]"
          style={{ clipPath: 'inset(0 0 100% 0)', color: t.text, fontWeight: 400 }}
        >
          Your network is your
          <br />
          <em className="italic text-[#B8975A]">net worth</em>
        </h2>

        <p
          ref={subtextRef}
          className="font-[family-name:var(--font-body)] text-[clamp(1rem,1.25vw,1.25rem)] mt-8 max-w-lg mx-auto leading-relaxed font-light transition-colors duration-[400ms]"
          style={{ opacity: 0, color: t.textMuted }}
        >
          Membership of The Club is reserved for exceptional individuals.
          Apply today to begin your journey.
        </p>

        {/* CTAs */}
        <div ref={ctasRef} className="mt-12 flex flex-wrap items-center justify-center gap-5" style={{ opacity: 0 }}>
          <MagneticButton strength={0.3}>
            <Link
              href="/membership-application"
              className="group inline-flex items-center gap-3 px-10 py-4.5 bg-[#B8975A] text-white text-[0.8rem] font-medium tracking-[0.1em] uppercase transition-all duration-500 hover:bg-[#D4B978] hover:tracking-[0.15em]"
            >
              Apply for Membership
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform duration-500 group-hover:translate-x-1">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </MagneticButton>
          <MagneticButton strength={0.3}>
            <Link
              href="/contact-us"
              className="inline-flex items-center px-10 py-4.5 text-[0.8rem] font-medium tracking-[0.1em] uppercase border hover:border-[#B8975A] hover:text-[#B8975A] transition-all duration-500"
              style={{ color: t.ctaOutlineText, borderColor: t.ctaOutlineBorder }}
            >
              Get in Touch
            </Link>
          </MagneticButton>
        </div>

        <p
          ref={detailRef}
          className="mt-16 font-[family-name:var(--font-label)] text-[0.55rem] uppercase tracking-[0.35em] transition-colors duration-[400ms]"
          style={{ opacity: 0, color: t.textDim }}
        >
          Manchester &middot; Leeds &middot; London
        </p>
      </div>
    </section>
  )
}
