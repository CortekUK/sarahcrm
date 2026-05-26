'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// Photo bento — used on /gallery/[slug] to render an event's photos.
//
// Layout: 12-col asymmetric bento with cycled span pattern. Each tile
// reveals as it scrolls into view (IntersectionObserver, opacity +
// translateY fade). Click any tile → lightbox modal with prev/next
// arrows, Escape to close, click-outside to close. Body scroll-lock
// while open.
// ─────────────────────────────────────────────────────────────────────

export interface BentoPhoto {
  id: string
  url: string
  caption: string | null
}

// Aspect ratios — full mix of landscape, portrait + square so the
// masonry reads as a real photo wall. Cycled deterministically per
// photo (seeded by photo ID + index) so the layout looks shuffled
// but stays stable across renders.
const ASPECT_PATTERNS = [
  'aspect-[3/4]', // portrait
  'aspect-[4/3]', // landscape
  'aspect-square', // square
  'aspect-[2/3]', // tall portrait
  'aspect-[3/2]', // wide landscape
  'aspect-[4/5]', // soft portrait
  'aspect-square',
  'aspect-[4/3]', // landscape
  'aspect-[3/4]',
  'aspect-[3/2]', // landscape
  'aspect-[2/3]',
  'aspect-square',
]

// Deterministic hash so the "shuffle" is stable on every render
// (avoids SSR / client mismatch and means the same photo always
// gets the same aspect).
function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function PhotoBento({ photos }: { photos: BentoPhoto[] }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  const close = useCallback(() => setActiveIdx(null), [])
  const next = useCallback(() => {
    setActiveIdx((i) => (i === null ? null : (i + 1) % photos.length))
  }, [photos.length])
  const prev = useCallback(() => {
    setActiveIdx((i) => (i === null ? null : (i - 1 + photos.length) % photos.length))
  }, [photos.length])

  // Body scroll lock + keyboard while lightbox is open
  useEffect(() => {
    if (activeIdx === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [activeIdx, close, prev, next])

  if (photos.length === 0) return null

  return (
    <>
      {/* CSS columns masonry — tiles flow vertically through 2/3/4
         columns depending on viewport. Each tile keeps its natural
         aspect ratio (portrait or square — never landscape), giving
         a real photo-wall feel rather than a uniform grid. */}
      <div className="always-night columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-3 md:gap-4 [column-fill:_balance]">
        {photos.map((p, i) => {
          const seed = (hashSeed(p.id) + i) % ASPECT_PATTERNS.length
          return (
            <BentoTile
              key={p.id}
              photo={p}
              aspect={ASPECT_PATTERNS[seed]}
              onOpen={() => setActiveIdx(i)}
            />
          )
        })}
      </div>

      {/* ── Lightbox ───────────────────────────────────────── */}
      {activeIdx !== null && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={close}
          className="always-night fixed inset-0 z-[100] bg-ink/95 backdrop-blur-md flex items-center justify-center px-4 md:px-12 animate-receipt-unfold"
        >
          {/* Close */}
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute top-6 right-6 w-11 h-11 rounded-full bg-graphite/80 border border-bronze/40 backdrop-blur flex items-center justify-center text-bronze-light hover:bg-bronze hover:text-ink transition-colors duration-300 z-10"
          >
            <X size={18} strokeWidth={1.5} />
          </button>

          {/* Counter */}
          <p className="absolute top-7 left-6 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.42em] tabular-nums text-bronze-light z-10">
            {String(activeIdx + 1).padStart(2, '0')}
            <span className="text-slate-haze mx-2">/</span>
            <span className="text-slate-haze">
              {String(photos.length).padStart(2, '0')}
            </span>
          </p>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  prev()
                }}
                aria-label="Previous photo"
                className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-graphite/80 border border-bronze/40 backdrop-blur flex items-center justify-center text-bronze-light hover:bg-bronze hover:text-ink transition-colors duration-300 z-10"
              >
                <ChevronLeft size={18} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  next()
                }}
                aria-label="Next photo"
                className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-graphite/80 border border-bronze/40 backdrop-blur flex items-center justify-center text-bronze-light hover:bg-bronze hover:text-ink transition-colors duration-300 z-10"
              >
                <ChevronRight size={18} strokeWidth={1.5} />
              </button>
            </>
          )}

          <div
            className="relative w-full max-w-6xl max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full aspect-[3/2] max-h-[80vh]">
              <Image
                key={photos[activeIdx].id}
                src={photos[activeIdx].url}
                alt={photos[activeIdx].caption ?? ''}
                fill
                sizes="(min-width: 1024px) 80vw, 100vw"
                className="object-contain"
                priority
              />
            </div>
            {photos[activeIdx].caption && (
              <p className="mt-5 text-center font-[family-name:var(--font-editorial)] italic text-[14.5px] text-ivory-soft">
                {photos[activeIdx].caption}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ─── Tile with intersection-based reveal ───────────────────────────

function BentoTile({
  photo,
  aspect,
  onOpen,
}: {
  photo: BentoPhoto
  aspect: string
  onOpen: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const el = ref.current
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
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    )
    io.observe(el)
    // Safety: reveal after 1.6s regardless
    const t = window.setTimeout(() => setRevealed(true), 1600)
    return () => {
      io.disconnect()
      clearTimeout(t)
    }
  }, [])

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={photo.caption ?? 'Open photo'}
      className={cn(
        // break-inside-avoid keeps the tile in one column piece, mb-X
        // adds vertical gap between stacked tiles within a column
        // (the CSS columns gap only handles horizontal spacing).
        'block w-full mb-3 md:mb-4 break-inside-avoid',
        'group relative overflow-hidden bg-graphite-2 border border-graphite-line/40 hover:border-bronze/55',
        aspect,
        // Pop-in animation runs once IntersectionObserver fires.
        // While hidden (pre-reveal) we keep opacity 0 so tiles
        // don't flash in before scrolling.
        revealed ? 'animate-photo-pop-in' : 'opacity-0',
      )}
    >
      <Image
        src={photo.url}
        alt={photo.caption ?? ''}
        fill
        sizes="(min-width: 1024px) 40vw, (min-width: 640px) 50vw, 100vw"
        className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06]"
      />
      <div className="absolute inset-0 bg-ink/15 group-hover:bg-ink/0 transition-colors duration-700" />
      <div className="film-grain-night pointer-events-none" />

      {/* Bronze corner brackets on hover */}
      <span aria-hidden className="absolute top-3 left-3 w-4 h-px bg-bronze-light opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <span aria-hidden className="absolute top-3 left-3 w-px h-4 bg-bronze-light opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <span aria-hidden className="absolute bottom-3 right-3 w-4 h-px bg-bronze-light opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <span aria-hidden className="absolute bottom-3 right-3 w-px h-4 bg-bronze-light opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </button>
  )
}
