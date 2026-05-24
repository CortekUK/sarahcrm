'use client'

import { Children, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Infinite horizontal marquee with edge-fade masks. Pure CSS — uses a
// duplicated child track so the loop seams invisibly.
//
// Pass partner logos, press mentions, member names, or anything you
// want to scroll endlessly. The component duplicates the children
// once internally so a single source array gives a seamless loop.
//
// Variants:
//   - "logos" : padded gap, faded edges, slower drift — for partner strips
//   - "names" : tighter, faster, hairline separators — for member counts
//   - "press" : large editorial — for press mentions / "as featured in"

interface MarqueeProps {
  children: ReactNode
  variant?: 'logos' | 'names' | 'press'
  /** Animation duration in seconds. Default 40s (slow drift). */
  duration?: number
  /** Direction. Default left. */
  direction?: 'left' | 'right'
  /** Pause on hover. Default true. */
  pauseOnHover?: boolean
  className?: string
}

export function Marquee({
  children,
  variant = 'logos',
  duration = 40,
  direction = 'left',
  pauseOnHover = true,
  className,
}: MarqueeProps) {
  const items = Children.toArray(children)

  const gapClass = {
    logos: 'gap-16 px-8',
    names: 'gap-10 px-6',
    press: 'gap-24 px-8',
  }[variant]

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        // Fade mask on left/right
        '[mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center w-max marquee-track',
          gapClass,
          pauseOnHover && 'hover:[animation-play-state:paused]',
        )}
        style={{
          animation: `marquee-${direction} ${duration}s linear infinite`,
        }}
      >
        {items}
        {/* Duplicate for seamless loop */}
        {items.map((c, i) => (
          <div key={`dup-${i}`} aria-hidden>
            {c}
          </div>
        ))}
      </div>
      <style jsx>{`
        @keyframes marquee-left {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes marquee-right {
          from { transform: translate3d(-50%, 0, 0); }
          to   { transform: translate3d(0, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
