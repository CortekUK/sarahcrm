'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { KenBurnsImage } from '../primitives/MediaBlocks'
import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { formatDate } from '@/lib/utils'

// Gallery detail spread — night palette.
//   00 Hero        — cover image, eyebrow + display title + meta
//   01 Photo grid  — CSS columns masonry so portrait/landscape ratios
//                    preserve naturally. Click opens cinematic lightbox.
//   02 Lightbox    — full-screen ink background, bronze hairline frame,
//                    keyboard arrow nav, escape to close, click-outside
//                    backdrop also closes, scroll lock while open.

interface GalleryRow {
  id: string
  slug: string
  title: string
  category: string | null
  event_date: string | null
  venue_name: string | null
  location: string | null
  cover_image_url: string | null
}

interface PhotoRow {
  id: string
  image_url: string
  caption: string | null
}

interface Props {
  gallery: GalleryRow
  photos: PhotoRow[]
}

function formatCategory(c: string | null) {
  if (!c) return 'Gathering'
  return c
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

export function NightGalleryDetail({ gallery, photos }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  // Keyboard nav + scroll lock for lightbox
  useEffect(() => {
    if (activeIndex === null) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setActiveIndex(null)
      } else if (e.key === 'ArrowRight') {
        setActiveIndex((i) => (i === null ? null : Math.min(photos.length - 1, i + 1)))
      } else if (e.key === 'ArrowLeft') {
        setActiveIndex((i) => (i === null ? null : Math.max(0, i - 1)))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [activeIndex, photos.length])

  return (
    <>
      {/* ── 00 · Hero ───────────────────────────────────────────────── */}
      <section className="relative h-[70vh] min-h-[480px] w-full overflow-hidden bg-ink">
        {gallery.cover_image_url ? (
          <KenBurnsImage
            src={gallery.cover_image_url}
            alt={gallery.title}
            motion="in"
            duration={32}
            overlay={0.55}
            priority
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-graphite to-plum/30" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />

        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-20">
          <Link
            href="/gallery"
            className="self-start inline-flex items-center gap-2 mb-8 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light transition-colors"
          >
            <ArrowLeft size={13} strokeWidth={1.5} />
            All Galleries
          </Link>
          <EditorialMeta
            label={formatCategory(gallery.category)}
            stamp={gallery.event_date ? formatDate(gallery.event_date) : undefined}
          />
          <h1 className="display-xl mt-8 max-w-4xl">{gallery.title}</h1>
          {(gallery.venue_name || gallery.location) && (
            <p className="mt-7 font-[family-name:var(--font-meta)] text-[12px] uppercase tracking-[0.28em] text-ivory-soft">
              {[gallery.venue_name, gallery.location].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </section>

      {/* ── 01 · Photo masonry ──────────────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="max-w-2xl mb-12">
          <EditorialMeta number="01" label="Frames" stamp={`${photos.length} images`} />
          <h2 className="display-md mt-10">From the night.</h2>
        </div>

        {photos.length === 0 ? (
          <div className="border border-graphite-line/60 p-16 text-center">
            <p className="font-[family-name:var(--font-editorial)] italic text-xl text-ivory-soft/80">
              Frames from this evening are being processed.
            </p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 lg:gap-6 [&>*]:mb-4 lg:[&>*]:mb-6 [&>*]:break-inside-avoid">
            {photos.map((p, i) => (
              <PhotoCard key={p.id} photo={p} onOpen={() => setActiveIndex(i)} />
            ))}
          </div>
        )}
      </Chapter>

      {/* ── 02 · Lightbox ───────────────────────────────────────────── */}
      {activeIndex !== null && photos[activeIndex] && (
        <Lightbox
          photos={photos}
          index={activeIndex}
          onClose={() => setActiveIndex(null)}
          onPrev={() => setActiveIndex((i) => (i === null ? null : Math.max(0, i - 1)))}
          onNext={() =>
            setActiveIndex((i) => (i === null ? null : Math.min(photos.length - 1, i + 1)))
          }
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Photo card — single masonry item.
// Detects cache-hit on mount via `complete` so we don't end up with an
// invisible image when the browser served it from cache before onLoad
// could fire.
// ─────────────────────────────────────────────────────────────────────

function PhotoCard({ photo, onOpen }: { photo: PhotoRow; onOpen: () => void }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true)
  }, [])

  return (
    <button
      onClick={onOpen}
      className="group block w-full overflow-hidden relative bg-graphite-2 cursor-zoom-in"
      aria-label={photo.caption ?? 'Open photo'}
    >
      <img
        ref={imgRef}
        src={photo.image_url}
        alt={photo.caption ?? ''}
        onLoad={() => setLoaded(true)}
        className={`w-full h-auto block transition-all duration-700 group-hover:scale-[1.03] ${
          loaded ? 'opacity-100' : 'opacity-50'
        }`}
      />
      <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/15 transition-colors duration-500" />
      <div className="film-grain-night" />
      {photo.caption && (
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-ink/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <p className="text-[12.5px] text-ivory leading-snug font-[family-name:var(--font-editorial)] italic">
            {photo.caption}
          </p>
        </div>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Lightbox
// ─────────────────────────────────────────────────────────────────────

function Lightbox({
  photos,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  photos: PhotoRow[]
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const photo = photos[index]
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1

  return (
    <div
      className="fixed inset-0 z-[100] bg-ink/95 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Close"
        className="absolute top-6 right-6 z-10 w-11 h-11 rounded-full border border-graphite-line/80 hover:border-bronze/60 bg-ink/40 backdrop-blur flex items-center justify-center text-ivory-soft hover:text-bronze-light transition-colors"
      >
        <X size={18} strokeWidth={1.5} />
      </button>

      {/* Counter */}
      <div className="absolute top-7 left-7 z-10 flex items-center gap-3 pointer-events-none">
        <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light tabular-nums">
          {String(index + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}
        </span>
        <span className="h-px w-12 bg-bronze/45" />
      </div>

      {/* Prev */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPrev()
          }}
          aria-label="Previous"
          className="absolute left-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full border border-graphite-line/80 hover:border-bronze/60 bg-ink/40 backdrop-blur flex items-center justify-center text-ivory-soft hover:text-bronze-light transition-colors"
        >
          <ChevronLeft size={18} strokeWidth={1.5} />
        </button>
      )}

      {/* Next */}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
          aria-label="Next"
          className="absolute right-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full border border-graphite-line/80 hover:border-bronze/60 bg-ink/40 backdrop-blur flex items-center justify-center text-ivory-soft hover:text-bronze-light transition-colors"
        >
          <ChevronRight size={18} strokeWidth={1.5} />
        </button>
      )}

      {/* Photo */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-[90vw] max-h-[85vh] flex flex-col items-center"
      >
        {/* Bronze hairline frame */}
        <div className="relative">
          <span className="absolute -top-3 -left-3 w-6 h-px bg-bronze" />
          <span className="absolute -top-3 -left-3 w-px h-6 bg-bronze" />
          <span className="absolute -top-3 -right-3 w-6 h-px bg-bronze" />
          <span className="absolute -top-3 -right-3 w-px h-6 bg-bronze" />
          <span className="absolute -bottom-3 -left-3 w-6 h-px bg-bronze" />
          <span className="absolute -bottom-3 -left-3 w-px h-6 bg-bronze" />
          <span className="absolute -bottom-3 -right-3 w-6 h-px bg-bronze" />
          <span className="absolute -bottom-3 -right-3 w-px h-6 bg-bronze" />

          <Image
            src={photo.image_url}
            alt={photo.caption ?? ''}
            width={1600}
            height={1200}
            className="max-w-[90vw] max-h-[80vh] w-auto h-auto object-contain"
            sizes="90vw"
            unoptimized
          />
        </div>
        {photo.caption && (
          <p className="mt-6 font-[family-name:var(--font-editorial)] italic text-[15px] text-ivory-soft text-center max-w-xl">
            {photo.caption}
          </p>
        )}
      </div>
    </div>
  )
}
