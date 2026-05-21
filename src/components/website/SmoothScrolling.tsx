'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Lenis from 'lenis'
import { gsap } from 'gsap'

// Routes that should keep NATIVE scrolling. Lenis intercepts wheel events at
// the document level and breaks nested scroll containers — the dashboard
// sidebars, the AI panel, modals, dropdowns. So we only enable Lenis on the
// public marketing site.
const NATIVE_SCROLL_PREFIXES = ['/dashboard', '/portal', '/login']

export function SmoothScrolling({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    const isAppRoute = NATIVE_SCROLL_PREFIXES.some((p) => pathname?.startsWith(p))
    if (isAppRoute) return

    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    // Only enable on non-touch devices (native scroll is better on mobile)
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    if (isTouch) return

    const lenis = new Lenis({
      lerp: 0.12,
      duration: 0.8,
      touchMultiplier: 0,
    })
    lenisRef.current = lenis

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000)
    })
    gsap.ticker.lagSmoothing(0)

    return () => {
      lenis.destroy()
      lenisRef.current = null
    }
  }, [pathname])

  return <>{children}</>
}
