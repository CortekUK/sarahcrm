'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Wraps a homepage / page "chapter" — a narrative section with its own
// title, eyebrow, and body block. Provides consistent vertical rhythm
// (large) and a quiet scroll-fade entrance for the entire chapter so
// individual children don't need to wire up their own GSAP.
//
// Three densities:
//   - "default": 12–14 rem of vertical breathing room
//   - "tight":    6–8 rem  — for shorter chapters / inter-chapter beats
//   - "epic":   18–22 rem  — for the most cinematic moments (chapter
//                            openings, the final apply close)
//
// Three alignments:
//   - "left"  (default)   — for editorial body copy
//   - "center"            — for chapter titles, manifestos
//   - "split"             — explicit grid: use the `aside` slot for the
//                           secondary column on the right

interface ChapterProps {
  children: ReactNode
  density?: 'default' | 'tight' | 'epic'
  align?: 'left' | 'center' | 'split'
  bg?: 'ink' | 'graphite' | 'plum'
  className?: string
  id?: string
}

export function Chapter({
  children,
  density = 'default',
  align = 'left',
  bg = 'ink',
  className,
  id,
}: ChapterProps) {
  const ref = useRef<HTMLElement>(null)

  // Lightweight IntersectionObserver-based reveal. Adds `.is-visible`
  // to the chapter section once it crosses the viewport. The CSS for
  // the reveal lives in globals.css (`.chapter-reveal` / `.is-visible`)
  // — that lets the runtime class override the default opacity:0 state
  // without styled-jsx specificity issues.
  //
  // Safety net: if the observer never fires (e.g. element already in
  // view at mount on a short page, or Lenis smooth-scroll intercepts
  // the scroll position), force the reveal after 1.4s. The class is
  // idempotent — adding it twice is harmless.
  useEffect(() => {
    const el = ref.current
    if (!el) return

    function reveal() {
      el?.classList.add('is-visible')
    }

    // Already visible at first paint? reveal immediately
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      reveal()
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reveal()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            reveal()
            io.unobserve(el)
          }
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)

    // Fail-safe: if for any reason the observer hasn't fired by 1.4s,
    // reveal anyway. Better a missed animation than an invisible page.
    const fallback = window.setTimeout(reveal, 1400)

    return () => {
      io.disconnect()
      clearTimeout(fallback)
    }
  }, [])

  const densityClass = {
    tight: 'py-20 md:py-28',
    default: 'py-32 md:py-48',
    epic: 'py-44 md:py-72',
  }[density]

  const alignClass = {
    left: '',
    center: 'text-center',
    split: '',
  }[align]

  const bgClass = {
    ink: 'bg-ink',
    graphite: 'bg-graphite',
    plum: 'bg-plum',
  }[bg]

  return (
    <section
      ref={ref}
      id={id}
      className={cn(
        // `overflow-clip` instead of `overflow-hidden`: both clip
        // visual overflow (Aurora / Sparkles bleed), but `clip`
        // doesn't create a scroll context. Critical for any
        // descendant using `position: sticky` (the IntroChapter's
        // 3-scene image swap, the MembershipsPage StickyScrollReveal
        // tier reveal). With `overflow-hidden` they'd stick to the
        // non-scrolling section and never move.
        'relative chapter-reveal overflow-clip',
        bgClass,
        densityClass,
        alignClass,
        className,
      )}
    >
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10">{children}</div>
    </section>
  )
}

// Eyebrow + chapter number rendered above a section title. Use inside
// Chapter to mark the start of a narrative beat.
interface EditorialMetaProps {
  /** Two-digit chapter / scene marker like "01" or "iv". Optional. */
  number?: string
  /** Small-caps label, e.g. "Chapter One" or "An Introduction". */
  label: string
  /** Optional locale stamp, e.g. "London, 2026". Right-aligned counter. */
  stamp?: string
  align?: 'left' | 'center'
  className?: string
}

export function EditorialMeta({
  number,
  label,
  stamp,
  align = 'left',
  className,
}: EditorialMetaProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 text-bronze-light',
        align === 'center' && 'justify-center',
        className,
      )}
    >
      {number && (
        <span className="font-[family-name:var(--font-meta)] text-[11px] font-medium tracking-[0.25em] tabular-nums opacity-80">
          {number}
        </span>
      )}
      {number && <span className="h-px w-8 bg-bronze/40" />}
      <span className="font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em]">
        {label}
      </span>
      {stamp && (
        <>
          <span className="h-px w-8 bg-bronze/40 ml-auto" />
          <span className="font-[family-name:var(--font-meta)] text-[10px] font-medium tracking-[0.28em] uppercase text-slate-haze">
            {stamp}
          </span>
        </>
      )}
    </div>
  )
}
