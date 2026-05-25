'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Play, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// Editorial video gallery.
//
// Composition (desktop):
//   ┌────────────────────────┬──────────────┐
//   │                        │ 01           │
//   │   [Large 16:9 poster]  │ Title one    │
//   │   [▷ play medallion]   │ ── ── ── ─── │
//   │                        │ 02           │
//   │                        │ Title two    │
//   │  01 / 04               │ ── ── ── ─── │
//   │  Active video title    │ 03           │
//   └────────────────────────┴──────────────┘
//
// One large preview on the left, numbered playlist on the right. The
// 3-up thumbnail grid we had before read as a YouTube playlist —
// fine, but not premium. This treatment gives one video at a time
// the weight it deserves and turns the others into an editorial
// table of contents.
//
// Click the preview (or the active playlist row) → lightbox modal
// with autoplay. Escape / click-outside to close. Body scroll-locked
// while open.
// ─────────────────────────────────────────────────────────────────────

export interface VideoEntry {
  id: string
  youtube_url: string
  title: string
}

function getYouTubeId(url: string): string | null {
  if (!url) return null
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  )
  return m ? m[1] : null
}

export function VideoGallery({ videos }: { videos: VideoEntry[] }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [playing, setPlaying] = useState<string | null>(null)
  // Hover-preview state for the large poster — after a short
  // delay the static thumbnail is swapped for a muted autoplay
  // iframe (lazy mount so we never load four iframes at once).
  const [previewing, setPreviewing] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Body scroll lock + Escape close while the lightbox is open
  useEffect(() => {
    if (!playing) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPlaying(null)
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [playing])

  // Cancel hover preview whenever the active video changes — otherwise
  // an in-progress preview iframe would persist while the title and
  // poster swap, looking glitchy.
  useEffect(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setPreviewing(false)
  }, [activeIdx])

  function onPosterEnter() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    // Small delay so brief mouse-overs don't fire the iframe.
    hoverTimerRef.current = setTimeout(() => setPreviewing(true), 450)
  }
  function onPosterLeave() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setPreviewing(false)
  }

  const playable = videos
    .map((v) => ({ ...v, ytId: getYouTubeId(v.youtube_url) }))
    .filter((v): v is VideoEntry & { ytId: string } => !!v.ytId)

  if (playable.length === 0) return null

  const idx = Math.min(activeIdx, playable.length - 1)
  const active = playable[idx]
  // maxresdefault is the 1280×720 thumbnail YouTube generates for HD
  // uploads — best quality for a large hero. hqdefault is the safe
  // fallback if a particular video isn't HD-tagged.
  const poster = `https://i.ytimg.com/vi/${active.ytId}/maxresdefault.jpg`
  const fallback = `https://i.ytimg.com/vi/${active.ytId}/hqdefault.jpg`

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
        {/* Left — active preview ─────────────────────────────────── */}
        <div className="lg:col-span-8">
          <button
            type="button"
            onClick={() => setPlaying(active.ytId)}
            onMouseEnter={onPosterEnter}
            onMouseLeave={onPosterLeave}
            className="group relative block w-full aspect-video overflow-hidden border border-bronze/30 hover:border-bronze/60 transition-all duration-500 shadow-[0_0_60px_-20px_rgba(192,152,112,0.45)]"
            aria-label={`Play ${active.title}`}
          >
            {/* Static poster — base layer, always rendered. */}
            <Image
              key={active.id}
              src={poster}
              alt={active.title}
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="object-cover transition-transform duration-1000 ease-out group-hover:scale-[1.02]"
              onError={(e) => {
                const t = e.currentTarget as HTMLImageElement
                if (!t.src.endsWith('hqdefault.jpg')) t.src = fallback
              }}
              unoptimized
            />

            {/* Hover-preview iframe — lazy mounted on sustained hover.
               Muted + autoplay + loop so it reads as an ambient
               preview rather than a player. pointer-events-none lets
               the click still reach the parent button (lightbox). */}
            {previewing && (
              <iframe
                key={`preview-${active.ytId}`}
                src={`https://www.youtube.com/embed/${active.ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${active.ytId}&modestbranding=1&playsinline=1&rel=0`}
                title="Preview"
                className="absolute inset-0 w-full h-full pointer-events-none"
                allow="autoplay; encrypted-media; picture-in-picture"
                aria-hidden
              />
            )}

            {/* Dark wash, lifts on hover. Hidden once the preview iframe
               is in to keep the video unfiltered. */}
            <div
              className={cn(
                'absolute inset-0 transition-opacity duration-500',
                previewing ? 'opacity-0' : 'opacity-100 bg-ink/45 group-hover:bg-ink/25',
              )}
            />

            {/* Bronze play medallion — fades out during preview. */}
            <span
              aria-hidden
              className={cn(
                'absolute inset-0 flex items-center justify-center transition-opacity duration-500',
                previewing ? 'opacity-0' : 'opacity-100',
              )}
            >
              <span className="w-20 h-20 md:w-24 md:h-24 rounded-full border border-bronze bg-bronze/85 group-hover:bg-bronze flex items-center justify-center transition-all duration-500 shadow-[0_0_40px_-6px_rgba(192,152,112,0.75)]">
                <Play
                  size={30}
                  strokeWidth={1.5}
                  className="text-ink translate-x-[2px] fill-ink"
                />
              </span>
            </span>

            {/* Corner brackets — pure decoration, brighten on hover */}
            <CornerBrackets />
          </button>

          {/* Active video meta — counter + title below the preview */}
          <div key={`meta-${active.id}`} className="mt-8 animate-receipt-unfold">
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light tabular-nums">
              {String(idx + 1).padStart(2, '0')}
              <span className="text-slate-haze mx-2">/</span>
              <span className="text-slate-haze">
                {String(playable.length).padStart(2, '0')}
              </span>
            </p>
            <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.375rem,2vw,1.875rem)] leading-[1.25] text-ivory mt-5 max-w-2xl">
              {active.title}
            </h3>
          </div>
        </div>

        {/* Right — numbered playlist ─────────────────────────────── */}
        <div className="lg:col-span-4">
          <p className="hidden lg:block font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.42em] text-slate-haze mb-6">
            All Films
          </p>
          <ul>
            {playable.map((v, i) => {
              const isActive = i === idx
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={cn(
                      'group w-full flex items-start gap-5 py-5 border-t text-left transition-colors duration-500',
                      i === playable.length - 1 && 'border-b',
                      isActive
                        ? 'border-bronze/45'
                        : 'border-graphite-line/45 hover:border-bronze/35',
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.28em] tabular-nums pt-[2px] transition-colors duration-500',
                        isActive
                          ? 'text-bronze-light'
                          : 'text-slate-haze group-hover:text-bronze-light',
                      )}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={cn(
                        'flex-1 font-[family-name:var(--font-display)] text-[15.5px] leading-[1.4] transition-colors duration-500',
                        isActive
                          ? 'text-bronze-light'
                          : 'text-ivory-soft group-hover:text-ivory',
                      )}
                    >
                      {v.title}
                    </span>
                    {isActive && (
                      <span
                        aria-hidden
                        className="shrink-0 mt-1 w-2 h-2 rounded-full bg-bronze animate-membership-pulse"
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* Lightbox modal ─────────────────────────────────────────── */}
      {playing && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] bg-ink/95 backdrop-blur-md flex items-center justify-center px-4 md:px-10 animate-receipt-unfold"
          onClick={() => setPlaying(null)}
        >
          <button
            type="button"
            onClick={() => setPlaying(null)}
            aria-label="Close video"
            className="absolute top-6 right-6 w-11 h-11 rounded-full bg-graphite/80 border border-bronze/40 flex items-center justify-center text-bronze-light hover:bg-bronze hover:text-ink transition-colors duration-300 z-10"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
          <div
            className="relative w-full max-w-5xl aspect-video bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`https://www.youtube.com/embed/${playing}?autoplay=1&rel=0`}
              title="Video"
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </>
  )
}

function CornerBrackets() {
  return (
    <>
      <span aria-hidden className="absolute top-4 left-4 w-5 h-px bg-ivory/40 group-hover:bg-bronze-light transition-colors duration-500" />
      <span aria-hidden className="absolute top-4 left-4 w-px h-5 bg-ivory/40 group-hover:bg-bronze-light transition-colors duration-500" />
      <span aria-hidden className="absolute top-4 right-4 w-5 h-px bg-ivory/40 group-hover:bg-bronze-light transition-colors duration-500" />
      <span aria-hidden className="absolute top-4 right-4 w-px h-5 bg-ivory/40 group-hover:bg-bronze-light transition-colors duration-500" />
      <span aria-hidden className="absolute bottom-4 left-4 w-5 h-px bg-ivory/40 group-hover:bg-bronze-light transition-colors duration-500" />
      <span aria-hidden className="absolute bottom-4 left-4 w-px h-5 bg-ivory/40 group-hover:bg-bronze-light transition-colors duration-500" />
      <span aria-hidden className="absolute bottom-4 right-4 w-5 h-px bg-ivory/40 group-hover:bg-bronze-light transition-colors duration-500" />
      <span aria-hidden className="absolute bottom-4 right-4 w-px h-5 bg-ivory/40 group-hover:bg-bronze-light transition-colors duration-500" />
    </>
  )
}
