'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function StickyCTA() {
  const ref = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Start hidden off-screen
    gsap.set(el, { x: 80, opacity: 0 })

    if (prefersReducedMotion) {
      ScrollTrigger.create({
        start: 'top -100vh',
        once: true,
        onEnter: () => gsap.set(el, { x: 0, opacity: 1 }),
      })
      return
    }

    ScrollTrigger.create({
      start: 'top -100vh',
      once: true,
      onEnter: () => {
        gsap.to(el, { x: 0, opacity: 1, duration: 0.8, ease: 'power3.out' })
      },
    })
  }, [])

  return (
    <Link
      ref={ref}
      href="/membership-application"
      className="fixed right-0 top-1/2 -translate-y-1/2 z-30 hidden lg:flex items-center justify-center bg-[#B8975A] hover:bg-[#96793F] transition-colors"
      style={{
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
      }}
    >
      <span className="font-[family-name:var(--font-label)] text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-white px-3 py-6">
        Become a Member
      </span>
    </Link>
  )
}
