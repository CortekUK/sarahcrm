'use client'

// Instagram-style post photos — no cropping, ever. One image per slide,
// edge-to-edge in the card. The frame's ratio is the FIRST image's natural
// ratio clamped to 4:5 … 1.91:1 (from stored width/height, so the frame is
// sized before the image loads; 4:5 placeholder when dims are missing).
// Every image is contain-fitted: when it matches the frame it fills it; when
// it doesn't (outside the clamp, or a later carousel slide) the whole image
// sits over a blurred, darkened copy of itself. Several images = a swipeable
// scroll-snap carousel with hover arrows and dots. Tap opens the immersive
// viewer; double-tap / double-click likes (brief heart burst).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, ChevronLeft, ChevronRight, Heart, X } from 'lucide-react'
import type { FeedImage } from '@/lib/chat/contract'
import { cn } from '@/lib/utils'

const MIN_RATIO = 0.8 // 4:5
const MAX_RATIO = 1.91

export const clampRatio = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r))
const naturalRatio = (img: { width?: number; height?: number }) =>
  img.width && img.height ? img.width / img.height : null

/** One framed image: contain-fit, blurred backdrop only when it doesn't fill the frame. */
export function FramedImage({
  src,
  ratio,
  frameRatio,
  onRatio,
  className,
}: {
  src: string
  /** the image's natural ratio, if known */
  ratio: number | null
  frameRatio: number
  onRatio?: (r: number) => void
  className?: string
}) {
  const fills = ratio !== null && Math.abs(ratio - frameRatio) / frameRatio < 0.015
  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-[#0d0c0b]', className)}>
      {!fills && src && (
        // eslint-disable-next-line @next/next/no-img-element -- decorative backdrop
        <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl brightness-50" />
      )}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- signed / blob URLs
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget
            if (el.naturalWidth && el.naturalHeight) onRatio?.(el.naturalWidth / el.naturalHeight)
          }}
          className="relative h-full w-full select-none object-contain"
        />
      )}
    </div>
  )
}

// ── Immersive viewer ─────────────────────────────────────────────────

export function FeedLightbox({ images, index, onClose }: { images: FeedImage[]; index: number | null; onClose: () => void }) {
  const [i, setI] = useState(index ?? 0)
  const [mounted, setMounted] = useState(false)
  const touchX = useRef<number | null>(null)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (index !== null) setI(index)
  }, [index])
  const open = index !== null && images.length > 0
  const n = images.length
  const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), [])
  const next = useCallback(() => setI((v) => Math.min(n - 1, v + 1)), [n])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose, next, prev])

  if (!open || !mounted) return null
  const current = images[Math.min(i, n - 1)]
  const arrow = 'absolute top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 disabled:opacity-0'

  // Portal to <body>: an animated ancestor (e.g. a Modal) would otherwise
  // become the containing block of this fixed overlay.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current
        const end = e.changedTouches[0]?.clientX
        touchX.current = null
        if (start === null || end === undefined) return
        if (end - start > 50) prev()
        if (start - end > 50) next()
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs */}
      <img src={current.url} alt="" className="max-h-[90vh] max-w-[90vw] select-none object-contain" draggable={false} />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X size={22} />
      </button>
      {n > 1 && (
        <>
          <button type="button" aria-label="Previous photo" disabled={i === 0} onClick={prev} className={cn(arrow, 'left-3')}>
            <ChevronLeft size={22} />
          </button>
          <button type="button" aria-label="Next photo" disabled={i === n - 1} onClick={next} className={cn(arrow, 'right-3')}>
            <ChevronRight size={22} />
          </button>
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs tabular-nums text-white">
            {i + 1} / {n}
          </span>
        </>
      )}
    </div>,
    document.body,
  )
}

// ── Carousel ─────────────────────────────────────────────────────────

export function PostImages({
  images,
  progress,
  failed,
  onDoubleTap,
  className,
}: {
  images: FeedImage[]
  progress?: number[]
  failed?: boolean
  /** double-tap / double-click on a photo (like) */
  onDoubleTap?: () => void
  className?: string
}) {
  const shown = images.slice(0, 4)
  const [loadedRatios, setLoadedRatios] = useState<Record<number, number>>({})
  const [active, setActive] = useState(0)
  const [viewer, setViewer] = useState<number | null>(null)
  const [burst, setBurst] = useState(false)
  const track = useRef<HTMLDivElement>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
  }, [])

  if (!shown.length) return null
  const ratioOf = (i: number) => naturalRatio(shown[i]) ?? loadedRatios[i] ?? null
  const first = ratioOf(0)
  const frameRatio = first ? clampRatio(first) : MIN_RATIO
  const interactive = shown.every((s) => !s.url.startsWith('blob:'))
  const n = shown.length

  function scrollTo(i: number) {
    const el = track.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  // Single tap opens the viewer; a second tap within 250ms is a like instead.
  function onTap(i: number) {
    if (!interactive) return
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      if (onDoubleTap) {
        onDoubleTap()
        setBurst(true)
        setTimeout(() => setBurst(false), 700)
      }
      return
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      setViewer(i)
    }, onDoubleTap ? 250 : 0)
  }

  const pct = (i: number) => (progress?.[i] !== undefined && progress[i] < 1 ? Math.round(progress[i] * 100) : null)

  return (
    <div className={cn('group/car relative', className)} style={{ aspectRatio: String(frameRatio) }}>
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget
          setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shown.map((img, i) => (
          <button
            key={`${img.path || img.url}-${i}`}
            type="button"
            onClick={() => onTap(i)}
            aria-label={n > 1 ? `Photo ${i + 1} of ${n}` : 'Open photo'}
            className={cn('relative h-full w-full shrink-0 snap-center', interactive ? 'cursor-zoom-in' : 'cursor-default')}
          >
            <FramedImage
              src={img.url}
              ratio={ratioOf(i)}
              frameRatio={frameRatio}
              onRatio={(r) => !naturalRatio(img) && setLoadedRatios((m) => (m[i] ? m : { ...m, [i]: r }))}
            />
            {failed && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                <AlertCircle size={22} />
              </span>
            )}
            {pct(i) !== null && !failed && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white">
                <span className="text-xs font-medium tabular-nums">{pct(i)}%</span>
                <span className="h-1 w-1/3 overflow-hidden rounded-full bg-white/30">
                  <span className="block h-full rounded-full bg-white transition-[width] duration-200" style={{ width: `${pct(i)}%` }} />
                </span>
              </span>
            )}
          </button>
        ))}
      </div>

      {/* double-tap heart */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center justify-center text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.45)] transition-all duration-300',
          burst ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      >
        <Heart size={88} fill="currentColor" strokeWidth={0} />
      </span>

      {n > 1 && (
        <>
          {/* arrows: only on devices that can hover (touch swipes) */}
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => scrollTo(active - 1)}
            className={cn(
              'absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[#1b1916] shadow-md',
              '[@media(hover:hover)]:flex opacity-0 transition-opacity group-hover/car:opacity-100',
              active === 0 && '!hidden',
            )}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => scrollTo(active + 1)}
            className={cn(
              'absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[#1b1916] shadow-md',
              '[@media(hover:hover)]:flex opacity-0 transition-opacity group-hover/car:opacity-100',
              active === n - 1 && '!hidden',
            )}
          >
            <ChevronRight size={18} />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
            {shown.map((_, i) => (
              <span key={i} className={cn('h-1.5 w-1.5 rounded-full transition-colors', i === active ? 'bg-white' : 'bg-white/45')} />
            ))}
          </div>
        </>
      )}

      <FeedLightbox images={shown} index={viewer} onClose={() => setViewer(null)} />
    </div>
  )
}
