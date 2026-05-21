'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useReveal } from './useReveal'
import { useTheme, themeColors } from '../ThemeContext'
import { gsap } from 'gsap'
import { supabase } from '@/lib/supabase/client'

interface Partner {
  id: string
  name: string
  image_url: string
  website_url: string | null
}

export function PartnersStrip() {
  const { mode } = useTheme()
  const t = themeColors[mode].warm
  const reveal = useReveal(0.15)
  const logoRowRef = useRef<HTMLDivElement>(null)
  const [partners, setPartners] = useState<Partner[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('partner_logos')
        .select('id, name, image_url, website_url')
        .eq('is_visible', true)
        .order('display_order', { ascending: true })
        .limit(12)
      if (!cancelled) setPartners(data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Logo fade-in animation on entry
  useEffect(() => {
    if (!partners || partners.length === 0) return
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return
    const ctx = gsap.context(() => {
      gsap.from('.partner-logo', {
        opacity: 0,
        y: 12,
        duration: 0.8,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: logoRowRef.current,
          start: 'top 85%',
          once: true,
        },
      })
    }, logoRowRef)
    return () => ctx.revert()
  }, [partners])

  // Don't render anything when the admin hasn't added partners yet.
  if (!partners || partners.length === 0) return null

  return (
    <section
      ref={reveal.ref}
      className="py-20 md:py-28 transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      <div className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24">
        <div className="text-center mb-12">
          <span
            className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block"
          >
            Trusted by
          </span>
          <h2
            className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-light leading-[1.2] transition-colors duration-[400ms]"
            style={{ color: t.text }}
          >
            Our partners and sponsors
          </h2>
        </div>

        <div
          ref={logoRowRef}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-8 md:gap-12 items-center justify-items-center"
        >
          {partners.map((p) => {
            const inner = (
              <Image
                src={p.image_url}
                alt={p.name}
                fill
                sizes="160px"
                className="object-contain opacity-60 group-hover:opacity-100 transition-opacity duration-300 grayscale group-hover:grayscale-0"
              />
            )
            const baseClass =
              'partner-logo group relative w-full max-w-[160px] aspect-[3/1] flex items-center justify-center'
            return p.website_url ? (
              <Link
                key={p.id}
                href={p.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className={baseClass}
                title={p.name}
              >
                {inner}
              </Link>
            ) : (
              <div key={p.id} className={baseClass} title={p.name}>
                {inner}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
