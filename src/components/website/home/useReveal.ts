'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface RevealOptions {
  threshold?: number
  y?: number
  scale?: number
  duration?: number
  delay?: number
  stagger?: number
}

export function useReveal(thresholdOrOptions: number | RevealOptions = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  // Normalize options
  const opts: RevealOptions = typeof thresholdOrOptions === 'number'
    ? { threshold: thresholdOrOptions }
    : thresholdOrOptions

  const {
    threshold = 0.15,
    y = 40,
    scale,
    duration = 1.2,
    delay = 0,
  } = opts

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Respect prefers-reduced-motion — fall back to instant reveal
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setVisible(true)
      return
    }

    // Set initial hidden state explicitly so it works on both
    // hard loads and client-side (soft) navigations
    const setVars: gsap.TweenVars = { opacity: 0, y }
    if (scale !== undefined) setVars.scale = scale
    gsap.set(el, setVars)

    const toVars: gsap.TweenVars = {
      opacity: 1,
      y: 0,
      duration,
      delay,
      ease: 'power3.out',
      onComplete: () => setVisible(true),
    }
    if (scale !== undefined) toVars.scale = 1

    let trigger: ScrollTrigger | null = null

    // Defer ScrollTrigger creation by one frame so layout is settled
    // after client-side navigation (fixes onEnter not firing)
    const rafId = requestAnimationFrame(() => {
      ScrollTrigger.refresh()
      trigger = ScrollTrigger.create({
        trigger: el,
        start: `top ${100 - threshold * 100}%`,
        once: true,
        onEnter: () => {
          gsap.to(el, toVars)
        },
      })
    })

    return () => {
      cancelAnimationFrame(rafId)
      trigger?.kill()
      gsap.set(el, { clearProps: 'all' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ref, visible }
}
