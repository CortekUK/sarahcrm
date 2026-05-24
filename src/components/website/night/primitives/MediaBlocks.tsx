'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// KenBurnsImage — slow-pan/zoom on a still photograph.
// Used in hero and scene sequences where a static photo would feel
// inert. The pan direction is configurable; default is a slow zoom-in.
// ─────────────────────────────────────────────────────────────────────

interface KenBurnsImageProps {
  src: string
  alt: string
  /** Direction of the slow drift. 'in' = zoom in, 'out' = zoom out. */
  motion?: 'in' | 'out' | 'left' | 'right'
  /** Duration in seconds. Default 18s — slow enough to feel cinematic. */
  duration?: number
  /** Optional black overlay opacity (0–1) for legibility of text on top. */
  overlay?: number
  className?: string
  priority?: boolean
}

export function KenBurnsImage({
  src,
  alt,
  motion = 'in',
  duration = 18,
  overlay = 0,
  className,
  priority = false,
}: KenBurnsImageProps) {
  const animClass = {
    in: 'kb-in',
    out: 'kb-out',
    left: 'kb-left',
    right: 'kb-right',
  }[motion]

  return (
    <div className={cn('relative overflow-hidden bg-ink', className)}>
      <div className={cn('absolute inset-0 will-change-transform', animClass)}>
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes="100vw"
          priority={priority}
        />
      </div>
      {overlay > 0 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `rgba(14, 16, 20, ${overlay})` }}
        />
      )}
      <div className="film-grain-night" />
      <style jsx>{`
        @keyframes kbIn {
          from { transform: scale(1.04); }
          to   { transform: scale(1.18); }
        }
        @keyframes kbOut {
          from { transform: scale(1.18); }
          to   { transform: scale(1.04); }
        }
        @keyframes kbLeft {
          from { transform: scale(1.12) translateX(2%); }
          to   { transform: scale(1.12) translateX(-2%); }
        }
        @keyframes kbRight {
          from { transform: scale(1.12) translateX(-2%); }
          to   { transform: scale(1.12) translateX(2%); }
        }
        .kb-in    { animation: kbIn    ${duration}s ease-in-out infinite alternate; }
        .kb-out   { animation: kbOut   ${duration}s ease-in-out infinite alternate; }
        .kb-left  { animation: kbLeft  ${duration}s ease-in-out infinite alternate; }
        .kb-right { animation: kbRight ${duration}s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) {
          .kb-in, .kb-out, .kb-left, .kb-right { animation: none; }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// VideoLoop — silent autoplay hero video with poster fallback.
// Defaults to muted, loop, playsinline so it works on mobile.
// ─────────────────────────────────────────────────────────────────────

interface VideoLoopProps {
  src: string
  poster: string
  /** Black overlay opacity for legibility. Default 0.35. */
  overlay?: number
  className?: string
}

export function VideoLoop({ src, poster, overlay = 0.35, className }: VideoLoopProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    // Some mobile browsers refuse autoplay until they see the user has
    // interacted with the page at least once. Try to play() on mount;
    // if it rejects, we fall back to the poster image silently.
    const v = videoRef.current
    if (!v) return
    v.play().catch(() => {
      /* ignore — poster will remain visible, no broken UI */
    })
  }, [])

  return (
    <div className={cn('relative overflow-hidden bg-ink', className)}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="absolute inset-0 w-full h-full object-cover"
      />
      {overlay > 0 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `rgba(14, 16, 20, ${overlay})` }}
        />
      )}
      <div className="film-grain-night" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// FullBleed — edge-to-edge media wrapper.
// Breaks out of any max-width constraint above it by going 100vw
// translated from the page centre.
// ─────────────────────────────────────────────────────────────────────

interface FullBleedProps {
  children: ReactNode
  /** Height. 'screen' = 100vh, 'tall' = 80vh, 'short' = 60vh. */
  height?: 'screen' | 'tall' | 'short' | 'auto'
  className?: string
}

export function FullBleed({ children, height = 'tall', className }: FullBleedProps) {
  const heightClass = {
    screen: 'h-screen',
    tall: 'h-[80vh]',
    short: 'h-[60vh]',
    auto: '',
  }[height]

  return (
    <div
      className={cn(
        'relative w-screen left-1/2 -translate-x-1/2 overflow-hidden',
        heightClass,
        className,
      )}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// MemberVoice — testimonial with portrait, name, and quiet detail.
// Editorial layout: portrait on the left, quote breathing on the right.
// ─────────────────────────────────────────────────────────────────────

interface MemberVoiceProps {
  portrait?: string
  name: string
  detail?: string
  quote: string
  align?: 'left' | 'right'
  className?: string
}

export function MemberVoice({
  portrait,
  name,
  detail,
  quote,
  align = 'left',
  className,
}: MemberVoiceProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-14 items-center',
        align === 'right' && 'md:[&>*:first-child]:order-2',
        className,
      )}
    >
      <div className="md:col-span-5">
        <div className="aspect-[4/5] relative overflow-hidden bg-graphite-2">
          {portrait ? (
            <Image src={portrait} alt={name} fill className="object-cover" sizes="(min-width: 768px) 40vw, 100vw" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-[family-name:var(--font-display)] text-6xl text-slate-dim">
                {name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
              </span>
            </div>
          )}
          <div className="film-grain-night" />
        </div>
      </div>
      <div className="md:col-span-7">
        <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.25rem,2vw,1.625rem)] leading-[1.55] text-ivory">
          <span aria-hidden className="text-bronze/50 mr-1 not-italic">“</span>
          {quote}
          <span aria-hidden className="text-bronze/50 ml-1 not-italic">”</span>
        </p>
        <div className="mt-8 flex items-center gap-4">
          <span className="h-px w-10 bg-bronze/50" />
          <p className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light">
            {name}
          </p>
          {detail && (
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.24em] text-slate-haze">
              {detail}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
