'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// Asymmetric 5-tile bento grid with cinematic animation.
//
// Layout (12-col grid):
//   ┌──────────────┬────────┐
//   │              │   2    │  Top:    Tile 1 spans 8×2, Tile 2 spans 4×2
//   │      1       │  tall  │
//   │   (large)    │        │
//   ├──────┬───────┼────────┤
//   │  3   │   4   │   5    │  Bottom: Three equal tiles, each 4×1
//   └──────┴───────┴────────┘
//
// Behaviours per tile:
//   • Scroll reveal — staggered fade+rise as the section enters view
//   • Hover — image scale (1.06), dark overlay clears, caption + arrow
//             slide up from bottom
//   • Border — bronze hairline brightens on hover
//   • Mouse tracking — subtle bronze glow follows the cursor across the
//     whole grid (a soft spotlight, not a per-tile gimmick)

export interface BentoPhoto {
  id: string
  src: string
  caption: string
}

// Span/aspect classes per tile position (0-indexed).
const TILE_LAYOUT = [
  'col-span-12 lg:col-span-8 row-span-2', // tile 0 — large left
  'col-span-12 lg:col-span-4 row-span-2', // tile 1 — tall right
  'col-span-6 lg:col-span-4 row-span-1', // tile 2 — bottom left
  'col-span-6 lg:col-span-4 row-span-1', // tile 3 — bottom middle
  'col-span-12 lg:col-span-4 row-span-1', // tile 4 — bottom right
] as const

export function GalleryBentoGrid({ photos }: { photos: BentoPhoto[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null)

  // Stagger-reveal once the grid crosses into view
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setRevealed(true)
            io.unobserve(el)
            break
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Track cursor across the grid for a subtle bronze spotlight
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    setSpot({ x: e.clientX - r.left, y: e.clientY - r.top })
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setSpot(null)}
      className="relative grid grid-cols-12 auto-rows-[clamp(180px,18vw,260px)] gap-3 md:gap-4"
    >
      {/* Global spotlight cursor — desktop only via mousemove */}
      {spot && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[5] transition-opacity duration-300"
          style={{
            background: `radial-gradient(420px circle at ${spot.x}px ${spot.y}px, rgba(192,152,112,0.10), transparent 70%)`,
            mixBlendMode: 'screen',
          }}
        />
      )}

      {photos.map((p, i) => (
        <Tile
          key={p.id}
          photo={p}
          span={TILE_LAYOUT[i] ?? TILE_LAYOUT[TILE_LAYOUT.length - 1]}
          index={i}
          revealed={revealed}
        />
      ))}
    </div>
  )
}

function Tile({
  photo,
  span,
  index,
  revealed,
}: {
  photo: BentoPhoto
  span: string
  index: number
  revealed: boolean
}) {
  // Stagger: 120ms between tiles
  const delay = revealed ? `${index * 120}ms` : '0ms'

  return (
    <Link
      href="/gallery"
      className={cn(
        'group relative overflow-hidden bg-graphite-2',
        'border border-graphite-line/40 hover:border-bronze/60',
        'transition-all duration-700 will-change-transform',
        span,
      )}
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'translateY(0)' : 'translateY(28px)',
        transitionProperty: 'opacity, transform, border-color',
        transitionDuration: '1000ms, 1000ms, 500ms',
        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
        transitionDelay: delay,
      }}
    >
      {/* Image — slow zoom on hover */}
      <Image
        src={photo.src}
        alt={photo.caption}
        fill
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06]"
      />

      {/* Base bottom gradient (always present for caption legibility) */}
      <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/15 to-transparent" />

      {/* Hover-only dark wash that lifts (image is brighter on hover) */}
      <div className="absolute inset-0 bg-ink/15 opacity-100 group-hover:opacity-0 transition-opacity duration-700" />

      {/* Grain texture */}
      <div className="film-grain-night" />

      {/* Bronze corner accent — appears on hover */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <span className="block w-6 h-px bg-bronze-light" />
        <span className="absolute top-0 right-0 w-px h-6 bg-bronze-light" />
      </div>

      {/* Caption row — sits at the bottom, slides up + reveals an arrow
          on hover. Hidden by default; gradient handles the empty state. */}
      <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 flex items-end justify-between gap-3 translate-y-2 group-hover:translate-y-0 transition-transform duration-500 ease-out">
        <p className="font-[family-name:var(--font-editorial)] italic text-[13px] md:text-[15px] leading-snug text-ivory">
          {photo.caption}
        </p>
        <span className="flex items-center justify-center w-8 h-8 rounded-full border border-bronze/60 group-hover:bg-bronze group-hover:border-bronze transition-all duration-500 flex-shrink-0">
          <span className="text-bronze-light group-hover:text-ink text-[14px] leading-none transition-colors duration-500 -translate-y-px">
            ↗
          </span>
        </span>
      </div>
    </Link>
  )
}
