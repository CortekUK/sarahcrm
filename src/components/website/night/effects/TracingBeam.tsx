'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Scroll-tracked vertical beam down the left side of a narrative section.
// The beam fill height tracks scroll position frame-accurately.
//
// Why no React state + CSS transition:
//   - setState on every scroll event re-renders the whole component
//   - A CSS `transition: height 80ms` adds another 80ms lag on top
//   - Combined with Lenis smooth-scroll's own RAF loop, the beam ends up
//     ~150ms behind the cursor — visibly drifty.
//
// Fix: ref-based direct DOM writes, batched via requestAnimationFrame.
// No re-renders, no CSS transitions. Beam reads the latest scroll
// position once per frame and writes height/top to the DOM directly.

interface TracingBeamProps {
  children: ReactNode
  className?: string
}

export function TracingBeam({ children, className }: TracingBeamProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const pipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    const fill = fillRef.current
    const pip = pipRef.current
    if (!section || !fill || !pip) return

    let raf = 0

    function update() {
      raf = 0
      if (!section || !fill || !pip) return
      const rect = section.getBoundingClientRect()
      const vh = window.innerHeight
      const total = rect.height + vh
      const scrolled = Math.max(0, Math.min(total, vh - rect.top))
      const progress = total > 0 ? scrolled / total : 0
      const pct = `${progress * 100}%`
      fill.style.height = pct
      pip.style.top = `calc(${pct} - 5px)`
      pip.style.opacity = progress > 0.02 && progress < 0.98 ? '1' : '0'
    }

    function onScroll() {
      if (!raf) raf = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={sectionRef} className={cn('relative', className)}>
      {/* Beam rail (desktop only) */}
      <div
        aria-hidden
        className="hidden lg:block absolute left-6 top-0 bottom-0 w-px"
      >
        {/* Faint track */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-graphite-line to-transparent" />
        {/* Active fill — height set imperatively via ref */}
        <div
          ref={fillRef}
          className="absolute top-0 left-0 w-px bg-gradient-to-b from-transparent via-bronze to-bronze-light"
          style={{ height: '0%' }}
        />
        {/* Pip at the leading edge — top set imperatively via ref */}
        <div
          ref={pipRef}
          className="absolute -left-1 w-2.5 h-2.5 rounded-full bg-bronze ring-4 ring-bronze/15"
          style={{ top: '-5px', opacity: 0 }}
        />
      </div>

      {/* Content offset right of the beam on desktop */}
      <div className="lg:pl-20">{children}</div>
    </div>
  )
}
