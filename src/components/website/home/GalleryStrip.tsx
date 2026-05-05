'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useReveal } from './useReveal'
import { useTheme, themeColors } from '../ThemeContext'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const galleryImages = [
  { src: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=85', alt: 'Fine dining setup', caption: 'Summer Soirée', aspect: 'aspect-[3/4]' },
  { src: 'https://images.unsplash.com/photo-1608538242779-113f7b19baa1?w=600&q=85', alt: 'Candlelit table setting', caption: 'The Ivy, Manchester', aspect: 'aspect-[4/5]' },
  { src: 'https://images.unsplash.com/photo-1630484179285-076074c31cc0?w=600&q=85', alt: 'Private members dining room', caption: 'Founders\u2019 Dinner', aspect: 'aspect-[3/4]' },
  { src: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600&q=85', alt: 'Cocktail craftsmanship', caption: 'Cocktail Reception', aspect: 'aspect-[4/5]' },
  { src: 'https://images.unsplash.com/photo-1552960226-639240203497?w=600&q=85', alt: 'Warm restaurant ambiance', caption: 'The Ned, London', aspect: 'aspect-[3/4]' },
  { src: 'https://images.unsplash.com/photo-1665575061295-bd3aa839ff8c?w=600&q=85', alt: 'Evening table setting', caption: 'Lake District Retreat', aspect: 'aspect-[4/5]' },
]

export function GalleryStrip() {
  const { mode } = useTheme()
  const t = themeColors[mode].dark
  const heading = useReveal(0.2)
  const stripWrapRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const imageRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const ctx = gsap.context(() => {
      const images = imageRefs.current.filter(Boolean)
      if (images.length) {
        gsap.from(images, {
          y: 40,
          opacity: 0,
          duration: 1.2,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: stripWrapRef.current,
            start: 'top 85%',
            once: true,
          },
        })
      }

      if (stripRef.current) {
        gsap.to(stripRef.current, {
          x: -150,
          ease: 'none',
          scrollTrigger: {
            trigger: stripWrapRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        })
      }
    })

    return () => ctx.revert()
  }, [])

  return (
    <section
      className="py-24 md:py-36 overflow-hidden transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      {/* Section header */}
      <div
        ref={heading.ref}
        className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24 mb-14 md:mb-20 flex flex-col md:flex-row md:items-end justify-between"
      >
        <div>
          <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
            Gallery
          </span>
          <h2
            className="font-[family-name:var(--font-heading)] text-[clamp(2rem,4vw,3.5rem)] leading-[1.1] transition-colors duration-[400ms]"
            style={{ color: t.text, fontWeight: 400 }}
          >
            Moments worth
            <br />
            remembering
          </h2>
        </div>
        <Link
          href="/gallery"
          className="group mt-6 md:mt-0 inline-flex items-center gap-3 font-[family-name:var(--font-label)] text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[#B8975A] hover:text-[#D4B978] transition-colors"
        >
          View all
          <div className="w-6 h-px bg-current transition-all duration-500 group-hover:w-10" />
        </Link>
      </div>

      {/* Gallery strip with horizontal pan */}
      <div ref={stripWrapRef}>
        <div
          ref={stripRef}
          className="flex gap-4 md:gap-5 px-6 md:px-16 lg:px-24"
        >
          {galleryImages.map((img, i) => (
            <div
              key={i}
              ref={(el) => { imageRefs.current[i] = el }}
              className={`relative flex-shrink-0 w-[260px] md:w-[320px] ${img.aspect} overflow-hidden group`}
              style={{ transform: `translateY(${i % 2 === 0 ? '0' : '24'}px)` }}
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                className="object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.06]"
                sizes="320px"
              />
              {/* Dark wash — lifts on hover */}
              <div
                className="absolute inset-0 group-hover:bg-transparent transition-colors duration-700"
                style={{ backgroundColor: `${t.bg}4D` }}
              />
              {/* Caption slide-up on hover */}
              <div
                className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out px-4 py-4"
                style={{ background: `linear-gradient(to top, ${t.overlay}, transparent)` }}
              >
                <span className="font-[family-name:var(--font-label)] text-[0.6rem] uppercase tracking-[0.2em] text-white/80">
                  {img.caption}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile link */}
      <div className="md:hidden px-6 mt-10">
        <Link
          href="/gallery"
          className="inline-flex items-center gap-3 font-[family-name:var(--font-label)] text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[#B8975A]"
        >
          View full gallery
          <div className="w-6 h-px bg-current" />
        </Link>
      </div>
    </section>
  )
}
