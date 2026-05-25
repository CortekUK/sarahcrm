'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Editorial image carousel for story sections — auto-rotates with a
// slow crossfade + subtle ken-burns. Pauses on hover, supports
// keyboard-style prev/next arrows, and uses bronze hairline indicators
// (active bar grows wide, inactive sit short — same vocabulary as
// VoicesCarousel / EventsCarousel on the homepage).

export interface StoryImage {
  src: string
  alt: string
}

export function StoryCarousel({
  images,
  aspect = '4/5',
  intervalMs = 4500,
}: {
  images: StoryImage[]
  /** CSS aspect-ratio value (e.g. '4/5', '3/4', '16/9'). */
  aspect?: string
  /** Auto-rotate interval. Set to 0 to disable. */
  intervalMs?: number
}) {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || intervalMs <= 0 || images.length < 2) return
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % images.length)
    }, intervalMs)
    return () => clearInterval(id)
  }, [paused, intervalMs, images.length])

  function go(delta: number) {
    setIdx((i) => (i + delta + images.length) % images.length)
  }

  if (images.length === 0) return null

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Stage — slow crossfade between slides, ken-burns scale on the
          active image so the still frame feels alive without
          screaming. */}
      <div
        className="relative overflow-hidden border border-graphite-line/40"
        style={{ aspectRatio: aspect }}
      >
        {images.map((img, i) => (
          <div
            key={i}
            aria-hidden={i !== idx}
            className={cn(
              'absolute inset-0 transition-opacity duration-[1200ms] ease-out',
              i === idx ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
          >
            <Image
              src={img.src}
              alt={img.alt}
              fill
              sizes="(min-width: 1024px) 55vw, 100vw"
              className={cn(
                'object-cover transition-transform ease-out',
                i === idx
                  ? 'scale-[1.04] duration-[7000ms]'
                  : 'scale-100 duration-0',
              )}
            />
          </div>
        ))}

        {/* Film grain */}
        <div aria-hidden className="film-grain-night pointer-events-none" />

        {/* Subtle vignette so the controls have something to sit on
            without darkening the whole image. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_55%,_rgba(14,16,20,0.35)_100%)]"
        />

        {/* Counter — top-left, tabular */}
        <div className="absolute top-5 left-5 z-10">
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-ivory/85 tabular-nums">
            {String(idx + 1).padStart(2, '0')}
            <span className="text-ivory/45 mx-2">/</span>
            <span className="text-ivory/45">
              {String(images.length).padStart(2, '0')}
            </span>
          </p>
        </div>

        {/* Prev / next — only render when there's more than one image */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="absolute left-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-ink/55 border border-bronze/45 backdrop-blur flex items-center justify-center text-bronze-light hover:bg-bronze hover:text-ink transition-colors duration-300 z-10"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className="absolute right-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-ink/55 border border-bronze/45 backdrop-blur flex items-center justify-center text-bronze-light hover:bg-bronze hover:text-ink transition-colors duration-300 z-10"
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {/* Indicator bars — bronze active, dim inactive */}
      {images.length > 1 && (
        <div className="flex items-center justify-center gap-3 mt-7">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Show image ${i + 1}`}
              className={cn(
                'h-[3px] transition-all duration-500',
                i === idx
                  ? 'w-12 bg-bronze'
                  : 'w-5 bg-graphite-line hover:bg-bronze/55',
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
