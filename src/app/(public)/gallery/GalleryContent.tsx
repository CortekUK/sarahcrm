'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme, themeColors } from '@/components/website/ThemeContext'
import { useReveal } from '@/components/website/home/useReveal'
import { MagneticButton } from '@/components/website/MagneticButton'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface GalleryItem {
  id: string
  title: string
  slug: string
  cover_image_url: string | null
  event_date: string | null
  venue_name: string | null
  location: string | null
  category: string | null
}

interface GalleryContentProps {
  galleries: GalleryItem[]
}

const CATEGORIES = [
  'All',
  'Private Dining',
  'Members Event',
  'Curated Experience',
  'Sponsored Event',
  'Business Enrichment',
]

export function GalleryContent({ galleries }: GalleryContentProps) {
  const { mode } = useTheme()
  const dark = themeColors[mode].dark
  const warm = themeColors[mode].warm
  const light = themeColors[mode].light
  const pageRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const imageWrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const introReveal = useReveal({ threshold: 0.05, y: 30 })
  const ctaReveal = useReveal(0.2)
  const gridRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([])

  const [activeCategory, setActiveCategory] = useState('All')

  const filtered = useMemo(() => {
    if (activeCategory === 'All') return galleries
    return galleries.filter((g) => g.category === activeCategory)
  }, [galleries, activeCategory])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const ctx = gsap.context(() => {
      // Hero parallax
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

      // Hero text entry
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.fromTo('.gal-hero-label', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 })
        .fromTo(
          '.gal-hero-headline',
          { clipPath: 'inset(0 0 100% 0)', y: 30 },
          { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1 },
          '-=0.2'
        )
        .fromTo('.gal-hero-sub', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.3')
    }, pageRef)

    return () => ctx.revert()
  }, [])

  // Animate cards on filter change
  useEffect(() => {
    const cards = cardRefs.current.filter(Boolean)
    if (!cards.length) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    gsap.fromTo(
      cards,
      { y: 40, opacity: 0, scale: 0.97 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.8,
        stagger: 0.08,
        ease: 'power3.out',
      }
    )
  }, [activeCategory])

  return (
    <div ref={pageRef}>
      {/* ═══════════════════════════════════════
          HERO
      ═══════════════════════════════════════ */}
      <section
        ref={sectionRef}
        className="relative h-[60vh] min-h-[500px] flex items-end overflow-hidden transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }} />

        <div ref={imageWrapRef} className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1920&q=80"
            alt=""
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div
            className="absolute inset-0 transition-all duration-[400ms]"
            style={{ background: `linear-gradient(to top, ${dark.bg}, ${dark.overlay || 'rgba(28,25,23,0.5)'} 50%, transparent)` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        </div>

        <div
          ref={contentRef}
          className="relative max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24 pb-16 md:pb-20 w-full"
        >
          <span
            className="gal-hero-label font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block"
            style={{ opacity: 0 }}
          >
            Gallery
          </span>
          <h1
            className="gal-hero-headline font-[family-name:var(--font-heading)] text-4xl md:text-5xl lg:text-6xl font-light text-white leading-[1.1]"
            style={{ clipPath: 'inset(0 0 100% 0)' }}
          >
            Moments worth remembering
          </h1>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          INTRO + FILTERS
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={introReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <p
            className="gal-hero-sub max-w-3xl text-[0.95rem] leading-[1.85] mb-12 transition-colors duration-[400ms]"
            style={{ color: warm.textMuted }}
          >
            Explore a captivating collection of images capturing the essence of our
            exclusive gatherings — from the stylish ambiance of high-profile events to
            the intimate moments shared among like-minded individuals. Join us in
            reliving the moments that make The Club an unrivalled platform for forging
            meaningful connections in a unique setting.
          </p>

          {/* Category filters */}
          <div className="flex flex-wrap gap-x-1 gap-y-3">
            <span
              className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.2em] mr-4 self-center transition-colors duration-[400ms]"
              style={{ color: warm.textDim }}
            >
              Event Style
            </span>
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="relative px-5 py-2 text-xs font-medium tracking-wide transition-all duration-300"
                  style={{
                    color: isActive ? '#FFFFFF' : warm.textMuted,
                    backgroundColor: isActive ? '#B8975A' : 'transparent',
                    border: `1px solid ${isActive ? '#B8975A' : warm.border}`,
                  }}
                >
                  {cat}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          GALLERY GRID
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: light.bg }}
      >
        <div className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24">
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p
                className="font-[family-name:var(--font-heading)] text-xl transition-colors duration-[400ms]"
                style={{ color: light.textMuted }}
              >
                No galleries in this category yet.
              </p>
            </div>
          ) : (
            <div
              ref={gridRef}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6"
            >
              {filtered.map((gallery, i) => {
                return (
                  <a
                    key={gallery.id}
                    ref={(el) => { cardRefs.current[i] = el }}
                    href={`/gallery#${gallery.slug}`}
                    className="group block"
                  >
                    <div className="relative overflow-hidden aspect-[4/3]">
                      <Image
                        src={
                          gallery.cover_image_url ||
                          'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&q=80'
                        }
                        alt={gallery.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />

                      {/* Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-80 group-hover:opacity-60 transition-opacity duration-500" />

                      {/* Location badge */}
                      {gallery.location && (
                        <div className="absolute top-4 left-4">
                          <span
                            className="px-3 py-1 text-[0.55rem] font-[family-name:var(--font-label)] uppercase tracking-[0.2em] text-white/90"
                            style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
                          >
                            The Club {gallery.location}
                          </span>
                        </div>
                      )}

                      {/* Card info */}
                      <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
                        {gallery.category && (
                          <span className="font-[family-name:var(--font-label)] text-[0.55rem] uppercase tracking-[0.2em] text-[#B8975A]">
                            {gallery.category}
                          </span>
                        )}
                        <h3
                          className="font-[family-name:var(--font-heading)] text-lg text-white mt-1.5 group-hover:text-[#B8975A] transition-colors duration-300"
                        >
                          {gallery.title}
                        </h3>

                        <div className="flex items-center justify-between mt-3">
                          <div>
                            {gallery.venue_name && (
                              <p className="text-[0.7rem] text-white/50">
                                {gallery.venue_name}
                              </p>
                            )}
                            {gallery.event_date && (
                              <p className="text-[0.65rem] text-white/40 mt-0.5">
                                {new Date(gallery.event_date).toLocaleDateString(
                                  'en-GB',
                                  { day: 'numeric', month: 'short', year: 'numeric' }
                                )}
                              </p>
                            )}
                          </div>

                          {/* View Gallery link */}
                          <span className="flex items-center gap-2 text-[0.65rem] font-[family-name:var(--font-label)] uppercase tracking-[0.15em] text-[#B8975A] opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                            View Gallery
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 16 16"
                              fill="none"
                            >
                              <path
                                d="M3 8h10M9 4l4 4-4 4"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        </div>
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          )}

          {/* Gallery count */}
          <div className="mt-12 text-center">
            <p
              className="text-xs font-[family-name:var(--font-label)] uppercase tracking-[0.2em] transition-colors duration-[400ms]"
              style={{ color: light.textDim }}
            >
              {filtered.length} {filtered.length === 1 ? 'gallery' : 'galleries'}
              {activeCategory !== 'All' ? ` in ${activeCategory}` : ''}
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          CTA
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div ref={ctaReveal.ref} className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light text-white mb-4">
            Be part of the <em className="italic text-[#B8975A]">story</em>
          </h2>
          <p
            className="mb-10 transition-colors duration-[400ms]"
            style={{ color: dark.textMuted }}
          >
            Join The Club and experience unforgettable moments firsthand.
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
    </div>
  )
}
