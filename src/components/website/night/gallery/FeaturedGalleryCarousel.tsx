'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// Featured gallery showcase — sits above the filterable bento on
// /gallery, highlighting recent gatherings.
//
// Layout adapts to the number of galleries available:
//   1 gallery   → single full-width tile (no carousel)
//   2 galleries → 50/50 split (no carousel)
//   3+         → big tile (col-span-8) + stack of small tiles on the
//                 right. Stack size = min(items - 1, 4). Auto-rotates
//                 every 4.5s — each tile takes a turn as the hero.
//                 Right-column tiles animate in with a "marquee upward"
//                 feel (rise from below + fade), staggered 120ms each.
//                 The big tile crossfades in place.
//                 Controls: prev/next arrows + bar indicators below.
//                 Pauses on hover.
// ─────────────────────────────────────────────────────────────────────

export interface FeaturedGalleryItem {
  id: string
  slug: string
  title: string
  category: string | null
  event_date: string | null
  venue_name: string | null
  location: string | null
  cover_image_url: string | null
}

function formatCategory(c: string | null) {
  if (!c) return 'Gathering'
  return c
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// 3-second auto-rotate (matches the .animate-bar-fill keyframe in
// globals.css so the progress bar empties exactly as the next slide
// takes over).
const ROTATE_MS = 3000

export function FeaturedGalleryCarousel({ items }: { items: FeaturedGalleryItem[] }) {
  if (items.length === 0) return null

  // ── 1 item: full width
  if (items.length === 1) {
    return (
      <div className="grid grid-cols-1">
        <BigTile g={items[0]} className="h-[clamp(420px,62vh,640px)]" />
      </div>
    )
  }

  // ── 2 items: split 50/50
  if (items.length === 2) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
        <BigTile g={items[0]} className="h-[clamp(360px,52vh,560px)]" />
        <BigTile g={items[1]} className="h-[clamp(360px,52vh,560px)]" />
      </div>
    )
  }

  // ── 3+ items: featured carousel with stacked right column
  return <CarouselWithStack items={items} />
}

// ─── 3+ items carousel ────────────────────────────────────────────

function CarouselWithStack({ items }: { items: FeaturedGalleryItem[] }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  // Right column: as many tiles as we have remaining items, max 4
  const stackSize = Math.min(items.length - 1, 4)

  useEffect(() => {
    if (paused || items.length < 2) return
    const id = setInterval(() => {
      setActive((i) => (i + 1) % items.length)
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [items.length, paused])

  function go(delta: number) {
    setActive((i) => (i + delta + items.length) % items.length)
  }

  const featured = items[active]
  const stack = Array.from({ length: stackSize }, (_, i) => items[(active + 1 + i) % items.length])

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Carousel row — big tile + right stack BOTH get the full
         container height (equal in place). The bars sit in a
         separate row below, spanning only the big tile width. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 h-[clamp(560px,80vh,780px)]">
        {/* ── Big featured (left) ─────────────────────────────── */}
        <div className="lg:col-span-8 relative h-full min-h-0">
          <BigTile
            key={`hero-${featured.id}`}
            g={featured}
            className="absolute inset-0 animate-gallery-feature-fade"
          />

          {/* Prev / Next arrows on big tile edges */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              go(-1)
            }}
            aria-label="Previous"
            className="absolute left-5 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-graphite/70 border border-bronze/40 backdrop-blur flex items-center justify-center text-bronze-light hover:bg-bronze hover:text-ink transition-colors duration-300"
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              go(1)
            }}
            aria-label="Next"
            className="absolute right-5 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-graphite/70 border border-bronze/40 backdrop-blur flex items-center justify-center text-bronze-light hover:bg-bronze hover:text-ink transition-colors duration-300"
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* ── Right stack — marquee upward, with peek-in/peek-out
           at the top and bottom of the column. */}
        <div className="lg:col-span-4 relative h-full min-h-0 overflow-hidden">
          <div className="absolute inset-x-0 -top-12 -bottom-12 flex flex-col gap-4 lg:gap-5">
            {stack.map((g, i) => (
              <div
                key={`stack-${active}-${i}-${g.id}`}
                className="flex-1 min-h-0 animate-gallery-tile-rise"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <SmallTile g={g} className="h-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bars row — below the carousel row, spans only col-span-8
         (the big tile width), centred. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 mt-5">
        <div className="lg:col-span-8 flex items-center justify-center py-1">
          {items.map((_, i) => (
            <ProgressBar
              key={i}
              state={i === active ? 'active' : 'inactive'}
              paused={paused}
              onClick={() => setActive(i)}
              runKey={active}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Single progress bar dot/pill ──────────────────────────────────
//
// Two states only: `active` = wide bronze pill with the fill animation
// inside; `inactive` = small dim dot. Past/future are visually the
// same — only the moment matters.

function ProgressBar({
  state,
  paused,
  onClick,
  runKey,
}: {
  state: 'active' | 'inactive'
  paused: boolean
  onClick: () => void
  runKey: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Show this gathering"
      className="group cursor-pointer p-1"
    >
      <span
        className={cn(
          'relative block h-[3px] rounded-full overflow-hidden transition-all duration-500',
          state === 'active'
            ? 'w-14 bg-graphite-line/60'
            : 'w-1.5 bg-graphite-line/60 group-hover:bg-bronze/55',
        )}
      >
        {state === 'active' && (
          // key={runKey} remounts on every advance so the CSS
          // animation restarts cleanly. Paused when the user hovers
          // the carousel (paused state).
          <span
            key={runKey}
            className={cn(
              'absolute inset-y-0 left-0 bg-bronze rounded-full animate-bar-fill',
              paused && '[animation-play-state:paused]',
            )}
          />
        )}
      </span>
    </button>
  )
}

// ─── Tiles ───────────────────────────────────────────────────────────

function BigTile({
  g,
  className,
}: {
  g: FeaturedGalleryItem
  className?: string
}) {
  const date = formatDate(g.event_date)
  return (
    <Link
      href={`/gallery/${g.slug}`}
      className={cn(
        'group relative block w-full overflow-hidden border border-graphite-line/40 hover:border-bronze/55 transition-colors duration-500 bg-graphite-2',
        className,
      )}
    >
      {g.cover_image_url ? (
        <Image
          src={g.cover_image_url}
          alt={g.title}
          fill
          sizes="(min-width: 1024px) 66vw, 100vw"
          className="object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-[1.04]"
          priority
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-[family-name:var(--font-display)] text-[10rem] text-slate-dim">
            {g.title.charAt(0)}
          </span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/30 to-transparent" />
      <div className="film-grain-night pointer-events-none" />

      {/* Caption — bottom-left */}
      <div className="absolute inset-x-0 bottom-0 p-8 lg:p-10">
        <p className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.4em] text-bronze-light">
          {formatCategory(g.category)}
          {date && <span className="text-slate-haze ml-3">· {date}</span>}
        </p>
        <h3 className="mt-5 font-[family-name:var(--font-display)] text-[clamp(1.75rem,2.6vw,2.5rem)] leading-[1.15] text-ivory group-hover:text-bronze-light transition-colors duration-500 max-w-2xl">
          {g.title}
        </h3>
        {(g.venue_name || g.location) && (
          <p className="mt-3 text-[13px] text-ivory-soft/80 uppercase tracking-[0.22em]">
            {[g.venue_name, g.location].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </Link>
  )
}

function SmallTile({
  g,
  className,
  style,
}: {
  g: FeaturedGalleryItem
  className?: string
  style?: React.CSSProperties
}) {
  const date = formatDate(g.event_date)
  return (
    <Link
      href={`/gallery/${g.slug}`}
      className={cn(
        'group relative block w-full h-full overflow-hidden border border-graphite-line/40 hover:border-bronze/55 transition-colors duration-500 bg-graphite-2',
        className,
      )}
      style={style}
    >
      {g.cover_image_url ? (
        <Image
          src={g.cover_image_url}
          alt={g.title}
          fill
          sizes="(min-width: 1024px) 25vw, 100vw"
          className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-[family-name:var(--font-display)] text-5xl text-slate-dim">
            {g.title.charAt(0)}
          </span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/40 to-transparent" />
      <div className="film-grain-night pointer-events-none" />

      <div className="absolute inset-x-0 bottom-0 p-5">
        <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light">
          {formatCategory(g.category)}
          {date && <span className="text-slate-haze ml-2">· {date}</span>}
        </p>
        <h4 className="mt-2 font-[family-name:var(--font-display)] text-[clamp(0.95rem,1.1vw,1.125rem)] leading-tight text-ivory group-hover:text-bronze-light transition-colors duration-500 line-clamp-2">
          {g.title}
        </h4>
      </div>
    </Link>
  )
}

