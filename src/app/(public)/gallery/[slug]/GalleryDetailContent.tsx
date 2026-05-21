'use client'

import { forwardRef, useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme, themeColors } from '@/components/website/ThemeContext'
import { useReveal } from '@/components/website/home/useReveal'
import { MagneticButton } from '@/components/website/MagneticButton'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowLeft, X, ChevronLeft, ChevronRight, MapPin, Calendar, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

gsap.registerPlugin(ScrollTrigger)

interface Gallery {
  id: string
  title: string
  slug: string
  cover_image_url: string | null
  event_date: string | null
  venue_name: string | null
  location: string | null
  category: string | null
}

interface Photo {
  id: string
  image_url: string
  caption: string | null
  display_order: number
}

const CATEGORY_LABELS: Record<string, string> = {
  private_dining: 'Private Dining',
  members_event: 'Members Event',
  curated_experience: 'Curated Experience',
  sponsored_event: 'Sponsored Event',
  business_enrichment: 'Business Enrichment',
}

export function GalleryDetailContent({
  gallery,
  photos,
}: {
  gallery: Gallery
  photos: Photo[]
}) {
  const { mode } = useTheme()
  const dark = themeColors[mode].dark
  const warm = themeColors[mode].warm
  const light = themeColors[mode].light
  const sectionRef = useRef<HTMLElement>(null)
  const imageWrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const introReveal = useReveal({ threshold: 0.05, y: 30 })
  const ctaReveal = useReveal(0.2)
  const gridRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Hero animations — identical to gallery list page so the transition between
  // /gallery and /gallery/[slug] feels seamless.
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return
    const ctx = gsap.context(() => {
      if (imageWrapRef.current) {
        ScrollTrigger.create({
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => {
            gsap.set(imageWrapRef.current, { y: self.progress * 100 })
          },
        })
      }
      if (contentRef.current) {
        ScrollTrigger.create({
          trigger: sectionRef.current,
          start: 'top top',
          end: '60% top',
          scrub: true,
          onUpdate: (self) => {
            gsap.set(contentRef.current, {
              opacity: 1 - self.progress,
              y: self.progress * 50,
            })
          },
        })
      }
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.fromTo('.gal-hero-label', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 })
        .fromTo(
          '.gal-hero-headline',
          { clipPath: 'inset(0 0 100% 0)', y: 30 },
          { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1 },
          '-=0.2',
        )
        .fromTo('.gal-hero-sub', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.3')
    })
    return () => ctx.revert()
  }, [])

  // Photo card stagger entry
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion || photos.length === 0) return
    const cards = cardRefs.current.filter(Boolean)
    if (!cards.length) return
    gsap.fromTo(
      cards,
      { y: 40, opacity: 0, scale: 0.97 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.8,
        stagger: 0.05,
        ease: 'power3.out',
        scrollTrigger: { trigger: gridRef.current, start: 'top 85%', once: true },
      },
    )
  }, [photos])

  // Lightbox keyboard nav — arrows move, escape closes
  const closeLightbox = useCallback(() => setLightboxIndex(null), [])
  const nextPhoto = useCallback(() => {
    setLightboxIndex((i) => (i === null ? null : (i + 1) % photos.length))
  }, [photos.length])
  const prevPhoto = useCallback(() => {
    setLightboxIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length))
  }, [photos.length])

  useEffect(() => {
    if (lightboxIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeLightbox()
      else if (e.key === 'ArrowRight') nextPhoto()
      else if (e.key === 'ArrowLeft') prevPhoto()
    }
    window.addEventListener('keydown', onKey)
    // Lock background scroll
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [lightboxIndex, closeLightbox, nextPhoto, prevPhoto])

  const heroImage = gallery.cover_image_url || photos[0]?.image_url || 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1920&q=80'

  return (
    <>
      {/* ═══════════════ HERO ═══════════════ */}
      <section
        ref={sectionRef}
        className="relative h-[60vh] min-h-[500px] flex items-end overflow-hidden transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
            backgroundSize: '128px 128px',
          }}
        />

        <div ref={imageWrapRef} className="absolute inset-0">
          <Image
            src={heroImage}
            alt={gallery.title}
            fill
            className="object-cover"
            priority
            sizes="100vw"
            unoptimized
          />
          <div
            className="absolute inset-0 transition-all duration-[400ms]"
            style={{
              background: `linear-gradient(to top, ${dark.bg}, ${dark.overlay || 'rgba(28,25,23,0.5)'} 50%, transparent)`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        </div>

        <div
          ref={contentRef}
          className="relative max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24 pb-16 md:pb-20 w-full"
        >
          <Link
            href="/gallery"
            className="gal-hero-label inline-flex items-center gap-2 font-[family-name:var(--font-label)] text-[0.65rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] hover:text-[#D4B978] mb-6 transition-colors"
            style={{ opacity: 0 }}
          >
            <ArrowLeft size={12} />
            Back to gallery
          </Link>
          <h1
            className="gal-hero-headline font-[family-name:var(--font-heading)] text-4xl md:text-5xl lg:text-6xl font-light text-white leading-[1.1]"
            style={{ clipPath: 'inset(0 0 100% 0)' }}
          >
            {gallery.title}
          </h1>
          <div
            className="gal-hero-sub mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/70"
            style={{ opacity: 0 }}
          >
            {gallery.venue_name && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={13} className="text-[#B8975A]" />
                {gallery.venue_name}
                {gallery.location && <span className="text-white/40">· {gallery.location}</span>}
              </span>
            )}
            {gallery.event_date && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={13} className="text-[#B8975A]" />
                {new Date(gallery.event_date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            )}
            {gallery.category && (
              <span className="font-[family-name:var(--font-label)] text-[0.6rem] uppercase tracking-[0.25em] text-[#B8975A]">
                {CATEGORY_LABELS[gallery.category] ?? gallery.category}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════ PHOTO GRID ═══════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={introReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          {photos.length === 0 ? (
            <div className="text-center py-20">
              <p
                className="font-[family-name:var(--font-heading)] text-xl mb-2"
                style={{ color: warm.textMuted }}
              >
                Photos coming soon
              </p>
              <p className="text-sm" style={{ color: warm.textDim }}>
                This gallery hasn&apos;t been populated yet.
              </p>
            </div>
          ) : photos.length <= 2 ? (
            /* Sparse layout — for 1-2 photos, show them as large editorial
               cards centred on the page. The masonry grid below collapses
               awkwardly with too few photos. */
            <>
              <div className="flex items-center justify-center gap-3 mb-12">
                <span className="h-px w-12 bg-[#B8975A]/50" />
                <span className="font-[family-name:var(--font-label)] text-[0.65rem] font-medium uppercase tracking-[0.3em] text-[#B8975A]">
                  {photos.length} photo{photos.length === 1 ? '' : 's'}
                </span>
                <span className="h-px w-12 bg-[#B8975A]/50" />
              </div>
              <div
                ref={gridRef}
                className={`grid gap-6 md:gap-8 mx-auto ${
                  photos.length === 1
                    ? 'grid-cols-1 max-w-3xl'
                    : 'grid-cols-1 md:grid-cols-2 max-w-5xl'
                }`}
              >
                {photos.map((photo, i) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    galleryTitle={gallery.title}
                    onClick={() => setLightboxIndex(i)}
                    ref={(el) => {
                      cardRefs.current[i] = el
                    }}
                    priority
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-3 mb-12">
                <span className="h-px w-12 bg-[#B8975A]/50" />
                <span className="font-[family-name:var(--font-label)] text-[0.65rem] font-medium uppercase tracking-[0.3em] text-[#B8975A]">
                  {photos.length} photos
                </span>
                <span className="h-px w-12 bg-[#B8975A]/50" />
              </div>

              {/*
                Pinterest-style masonry via CSS columns. Each image keeps its
                NATURAL aspect ratio rather than being squashed into a grid
                cell — landscape screenshots stay landscape, portrait photos
                stay portrait. `break-inside-avoid` keeps an image from
                splitting across column boundaries.
              */}
              <div
                ref={gridRef}
                className="columns-1 sm:columns-2 md:columns-3 lg:columns-3 xl:columns-4 gap-4 md:gap-6 [column-fill:_balance]"
              >
                {photos.map((photo, i) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    galleryTitle={gallery.title}
                    onClick={() => setLightboxIndex(i)}
                    ref={(el) => {
                      cardRefs.current[i] = el
                    }}
                    className="mb-4 md:mb-6 break-inside-avoid"
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ═══════════════ CTA ═══════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: light.bg }}
      >
        <div ref={ctaReveal.ref} className="max-w-2xl mx-auto px-6 text-center">
          <h2
            className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light mb-4"
            style={{ color: light.text }}
          >
            Curious about <em className="italic text-[#B8975A]">joining us</em>?
          </h2>
          <p
            className="mb-10 transition-colors duration-[400ms]"
            style={{ color: light.textMuted }}
          >
            Memberships are by invitation and application. Tell us about yourself.
          </p>
          <MagneticButton strength={0.3}>
            <Link
              href="/membership-application"
              className="inline-flex items-center gap-3 px-10 py-4 bg-[#B8975A] hover:bg-[#D4B978] text-white text-sm font-medium tracking-[0.1em] uppercase transition-all duration-500 hover:tracking-[0.15em]"
            >
              Apply for Membership
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </MagneticButton>
        </div>
      </section>

      {/* ═══════════════ LIGHTBOX ═══════════════ */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-6 right-6 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>

          {/* Counter */}
          <span className="absolute top-7 left-6 z-10 text-white/60 font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.2em]">
            {lightboxIndex + 1} / {photos.length}
          </span>

          {/* Prev / next */}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  prevPhoto()
                }}
                className="absolute left-4 md:left-8 z-10 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  nextPhoto()
                }}
                className="absolute right-4 md:right-8 z-10 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Next"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}

          {/* Image */}
          <div
            className="relative w-full h-full max-w-[90vw] max-h-[85vh] flex items-center justify-center px-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full h-full">
              <Image
                src={photos[lightboxIndex].image_url}
                alt={photos[lightboxIndex].caption || gallery.title}
                fill
                sizes="90vw"
                className="object-contain"
                unoptimized
                priority
              />
            </div>
            {photos[lightboxIndex].caption && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur rounded text-white text-sm">
                {photos[lightboxIndex].caption}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// PhotoCard
// ─────────────────────────────────────────────────────────────────────
// Single photo cell used by both the sparse (1-2 photos) and the masonry
// (3+ photos) layouts. The image keeps its NATURAL aspect ratio — landscape
// stays landscape, portrait stays portrait, no cropping. We use a plain
// <img> with `loading="lazy"` rather than next/image fill because masonry
// columns need the container to inherit the image's intrinsic height.
//
// Premium touches:
//   * Soft drop shadow that deepens on hover
//   * Gentle 102% zoom on hover (slower than the old grid for a calmer feel)
//   * Maximize icon fade-in to telegraph "click to expand"
//   * Caption rises from below with a tasteful gradient
//   * Skeleton background while the image is still loading

interface PhotoCardProps {
  photo: { id: string; image_url: string; caption: string | null }
  galleryTitle: string
  onClick: () => void
  className?: string
  priority?: boolean
}

const PhotoCard = forwardRef<HTMLButtonElement, PhotoCardProps>(function PhotoCard(
  { photo, galleryTitle, onClick, className, priority },
  ref,
) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Backstop for cached images: <img onLoad> doesn't fire if the browser
  // already had the image when React attached the handler. After mount we
  // check `complete + naturalHeight` to detect a cache hit and sync state.
  // Without this, the image stays invisible behind the skeleton on revisits.
  useEffect(() => {
    if (imgRef.current?.complete && (imgRef.current.naturalHeight ?? 0) > 0) {
      setLoaded(true)
    }
  }, [])

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'group relative block w-full overflow-hidden bg-[#1a1714] cursor-zoom-in',
        // Soft, warm-tinted drop shadow (not pure black) for a more
        // editorial / premium feel than the standard tailwind shadow.
        'shadow-[0_2px_12px_rgba(44,40,37,0.08)] hover:shadow-[0_24px_60px_rgba(44,40,37,0.25)]',
        'transition-[box-shadow,transform] duration-700 ease-out',
        'hover:-translate-y-1',
        className,
      )}
    >
      {/* Skeleton — sits BEHIND the image. Crucially the image is ALWAYS
          rendered visible (no opacity gating) so even if the load handler
          never fires we still see the photo. The skeleton just fades out
          on confirmed load. */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br from-[#2a2522] to-[#1a1714] transition-opacity duration-500 pointer-events-none',
          loaded && 'opacity-0',
        )}
      />

      {/* Image — native aspect ratio via height-auto. Plain img (not
          next/image fill) because masonry columns need the container to
          size to the image's intrinsic height. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={photo.image_url}
        alt={photo.caption || galleryTitle}
        loading={priority ? 'eager' : 'lazy'}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className="relative block w-full h-auto transition-transform duration-1000 ease-out group-hover:scale-[1.025]"
      />

      {/* Vignette + caption — slides up on hover */}
      <div
        className={cn(
          'absolute inset-0 pointer-events-none transition-opacity duration-500',
          'bg-gradient-to-t from-black/60 via-black/0 to-black/0',
          'opacity-0 group-hover:opacity-100',
        )}
      />

      {/* Maximize hint — top-right corner, fades in on hover */}
      <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-[-4px] group-hover:translate-y-0">
        <Maximize2 size={14} strokeWidth={1.8} />
      </div>

      {/* Caption — only renders when a caption exists, slides up from bottom */}
      {photo.caption && (
        <div className="absolute inset-x-0 bottom-0 px-4 py-3 translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-500 ease-out">
          <span className="font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.18em] text-white/95">
            {photo.caption}
          </span>
        </div>
      )}
    </button>
  )
})

