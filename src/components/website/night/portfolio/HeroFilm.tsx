'use client'

import { useEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────
// Full-bleed hero film loop.
//
// The still is always rendered first (fast paint, phones, reduced motion,
// and the fallback when there is no film). On wider screens without
// reduced-motion, a muted, looping, chrome-less YouTube embed is layered
// over it once mounted. A direct video file (.mp4/.webm) plays natively.
// ─────────────────────────────────────────────────────────────────────

function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

export function HeroFilm({
  filmUrl,
  stillUrl,
  alt,
  overlay = 0.55,
}: {
  filmUrl: string | null
  stillUrl: string | null
  alt: string
  overlay?: number
}) {
  const [showFilm, setShowFilm] = useState(false)

  useEffect(() => {
    if (!filmUrl) return
    const wide = window.matchMedia('(min-width: 768px)').matches
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (wide && !calm) setShowFilm(true)
  }, [filmUrl])

  const ytId = filmUrl ? youTubeId(filmUrl) : null
  const isFile = !!filmUrl && /\.(mp4|webm|mov)(\?|$)/i.test(filmUrl)

  return (
    <div className="absolute inset-0 overflow-hidden bg-ink">
      {stillUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={stillUrl} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      )}
      {showFilm && isFile && filmUrl && (
        <video
          src={filmUrl}
          poster={stillUrl ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {showFilm && !isFile && ytId && (
        // 16:9 iframe scaled to always cover the hero, whatever its ratio.
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&controls=0&modestbranding=1&playsinline=1&rel=0&showinfo=0&iv_load_policy=3&disablekb=1`}
          title=""
          aria-hidden
          tabIndex={-1}
          allow="autoplay; encrypted-media"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-0"
          style={{ width: 'max(100%, 177.78vh)', height: 'max(100%, 56.25vw)' }}
        />
      )}
      <div aria-hidden className="absolute inset-0 bg-ink pointer-events-none" style={{ opacity: overlay }} />
      <div className="film-grain-night" />
    </div>
  )
}
