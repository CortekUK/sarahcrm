'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Two-column scroll experience: a left column that updates its content
// in sync with which "scene" the right column has scrolled into view.
// Used on the homepage for the "what we offer" reveal, on memberships
// for tier comparison, and on events for the experience-of-attending
// scroll.
//
// Each scene gets:
//   - A "left" visual (image, video, key art)
//   - A "right" copy block (headline + body)
//
// As the user scrolls, the right column flows normally; the left
// column sticks and cross-fades between visuals as each scene
// crosses the centre of the viewport.

export interface RevealScene {
  /** Stable key. Used for fade transitions. */
  key: string
  /** Left-column content. Usually <Image> or <KenBurnsImage>. */
  visual: ReactNode
  /** Right-column eyebrow text. */
  eyebrow?: string
  /** Right-column scene title. */
  title: string
  /** Right-column body copy. */
  body: ReactNode
}

interface StickyScrollRevealProps {
  scenes: RevealScene[]
  /** Background colour for the visual column. */
  visualBg?: 'ink' | 'graphite' | 'plum'
  className?: string
}

export function StickyScrollReveal({
  scenes,
  visualBg = 'graphite',
  className,
}: StickyScrollRevealProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const sceneRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const io = new IntersectionObserver(
      (entries) => {
        // Find the entry with the highest intersection ratio
        let topIndex = activeIndex
        let topRatio = 0
        for (const entry of entries) {
          const idx = sceneRefs.current.findIndex((el) => el === entry.target)
          if (idx >= 0 && entry.intersectionRatio > topRatio) {
            topRatio = entry.intersectionRatio
            topIndex = idx
          }
        }
        if (topRatio > 0) setActiveIndex(topIndex)
      },
      {
        // Trigger when scene crosses the middle band of the viewport
        rootMargin: '-40% 0px -40% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    )
    sceneRefs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
    // activeIndex intentionally not a dep — IO callback uses ref-style closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes.length])

  const bgClass = {
    ink: 'bg-ink',
    graphite: 'bg-graphite-2',
    plum: 'bg-plum',
  }[visualBg]

  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16', className)}>
      {/* Sticky left visual column */}
      <div className="lg:col-span-6 lg:sticky lg:top-32 self-start">
        <div className={cn('relative aspect-[4/5] overflow-hidden', bgClass)}>
          {scenes.map((scene, i) => (
            <div
              key={scene.key}
              className={cn(
                'absolute inset-0 transition-opacity duration-700 ease-out',
                i === activeIndex ? 'opacity-100' : 'opacity-0',
              )}
            >
              {scene.visual}
            </div>
          ))}
          {/* Scene counter overlay */}
          <div className="absolute top-5 left-5 flex items-center gap-3 pointer-events-none">
            <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-ivory/80 tabular-nums">
              {String(activeIndex + 1).padStart(2, '0')} / {String(scenes.length).padStart(2, '0')}
            </span>
            <span className="h-px w-8 bg-bronze/50" />
          </div>
        </div>
      </div>

      {/* Scrolling right copy column */}
      <div className="lg:col-span-6 flex flex-col">
        {scenes.map((scene, i) => (
          <div
            key={scene.key}
            ref={(el) => {
              sceneRefs.current[i] = el
            }}
            className="min-h-[80vh] flex flex-col justify-center py-12"
          >
            {scene.eyebrow && (
              <span className="eyebrow mb-6">{scene.eyebrow}</span>
            )}
            <h3 className="display-md text-ivory mb-6">{scene.title}</h3>
            <div className="body-prose max-w-prose">{scene.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
