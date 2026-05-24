'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Element-level scroll reveal. Wraps any block in a div that animates
// in once it crosses the viewport. CSS lives in globals.css under
// `.reveal-up / .reveal-clip / .reveal-line / .reveal-scale`.
//
// Use sparingly. Stagger via the `delay` prop so multiple Reveals
// inside one section cascade rather than all popping at once.
//
// Examples:
//   <Reveal>          {/* fade + 28px slide-up */}
//   <Reveal type="clip" delay={200}>   {/* mask-reveal headline */}
//   <Reveal type="line" delay={0}>     {/* hairline drawing in from left */}
//   <Reveal type="scale" delay={400}>  {/* subtle scale-in (good for images) */}

type RevealType = 'up' | 'clip' | 'line' | 'scale'

interface RevealProps {
  children: ReactNode
  /** Animation variant. Default 'up'. */
  type?: RevealType
  /** Delay in milliseconds before the reveal animation runs. */
  delay?: number
  /** Class on the wrapper element. */
  className?: string
}

export function Reveal({ children, type = 'up', delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function reveal() {
      if (!el) return
      if (delay > 0) {
        const t = window.setTimeout(() => el.classList.add('is-revealed'), delay)
        cleanupRef.current = () => clearTimeout(t)
      } else {
        el.classList.add('is-revealed')
      }
    }

    const cleanupRef = { current: () => {} }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reveal()
      return
    }

    // Already in view on first paint? reveal immediately
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      reveal()
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            reveal()
            io.unobserve(el)
            break
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)

    // Safety: force reveal if observer hasn't fired by 1.6s
    const fallback = window.setTimeout(() => {
      if (el) el.classList.add('is-revealed')
    }, 1600)

    return () => {
      io.disconnect()
      clearTimeout(fallback)
      cleanupRef.current()
    }
  }, [delay])

  return (
    <div ref={ref} className={cn(`reveal-${type}`, className)}>
      {children}
    </div>
  )
}
