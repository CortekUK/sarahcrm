'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Wordmark } from './Logo'
import { gsap } from 'gsap'

const navLinks = [
  { href: '/', label: 'Home', image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80' },
  { href: '/about', label: 'Our Founder', image: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=800&q=80' },
  { href: '/memberships', label: 'Memberships', image: 'https://images.unsplash.com/photo-1630484179285-076074c31cc0?w=800&q=80' },
  { href: '/events', label: 'Events', image: 'https://images.unsplash.com/photo-1608538242779-113f7b19baa1?w=800&q=80' },
  { href: '/private-event-services', label: 'Private Events', image: 'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=800&q=80' },
  { href: '/one-london-road', label: '[ONE] London Road', image: 'https://images.unsplash.com/photo-1665575061295-bd3aa839ff8c?w=800&q=80' },
  { href: '/gallery', label: 'Gallery', image: 'https://images.unsplash.com/photo-1552960226-639240203497?w=800&q=80' },
  { href: '/reviews', label: 'Reviews', image: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=800&q=80' },
  { href: '/contact-us', label: 'Contact', image: 'https://images.unsplash.com/photo-1748551204300-f227d5af350f?w=800&q=80' },
]

const secondaryLinks = [
  { href: '/share-your-experience', label: 'Share Your Experience' },
  { href: '/club-rules', label: 'Club Rules' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/login', label: 'Member Login' },
]

interface MenuOverlayProps {
  open: boolean
  onClose: () => void
}

export function MenuOverlay({ open }: MenuOverlayProps) {
  const pathname = usePathname()
  const overlayRef = useRef<HTMLDivElement>(null)
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const secondaryRef = useRef<HTMLDivElement>(null)
  const wordmarkRef = useRef<HTMLDivElement>(null)
  const [hoveredImage, setHoveredImage] = useState<string | null>(null)
  const prevOpen = useRef(false)

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (open && !prevOpen.current) {
      // Opening
      overlay.style.pointerEvents = 'auto'

      if (prefersReducedMotion) {
        gsap.set(overlay, { y: '0%' })
        linkRefs.current.forEach(el => { if (el) gsap.set(el, { opacity: 1, y: 0 }) })
        if (secondaryRef.current) gsap.set(secondaryRef.current, { opacity: 1 })
        if (wordmarkRef.current) gsap.set(wordmarkRef.current, { opacity: 1 })
      } else {
        const tl = gsap.timeline()

        tl.fromTo(overlay, { y: '100%' }, { y: '0%', duration: 0.7, ease: 'power4.inOut' })
          .fromTo(
            linkRefs.current.filter(Boolean),
            { opacity: 0, y: 30 },
            { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out' },
            '-=0.2'
          )
          .fromTo(secondaryRef.current, { opacity: 0 }, { opacity: 1, duration: 0.4 }, '-=0.2')
          .fromTo(wordmarkRef.current, { opacity: 0 }, { opacity: 1, duration: 0.4 }, '-=0.3')
      }
    } else if (!open && prevOpen.current) {
      // Closing
      if (prefersReducedMotion) {
        gsap.set(overlay, { y: '100%' })
        overlay.style.pointerEvents = 'none'
      } else {
        gsap.to(overlay, {
          y: '-100%',
          duration: 0.6,
          ease: 'power4.inOut',
          onComplete: () => {
            overlay.style.pointerEvents = 'none'
            gsap.set(overlay, { y: '100%' })
          },
        })
      }
    }

    prevOpen.current = open
  }, [open])

  // Initialize overlay off-screen
  useEffect(() => {
    if (overlayRef.current) {
      gsap.set(overlayRef.current, { y: '100%' })
      overlayRef.current.style.pointerEvents = 'none'
    }
  }, [])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-40"
      style={{ willChange: 'transform' }}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-[#1A1714]" />

      {/* Hover image — desktop only */}
      <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-[40%] overflow-hidden">
        {navLinks.map((link) => (
          <div
            key={link.href}
            className="absolute inset-0 transition-opacity duration-500"
            style={{ opacity: hoveredImage === link.image ? 0.3 : 0 }}
          >
            <Image
              src={link.image}
              alt=""
              fill
              className="object-cover"
              sizes="40vw"
            />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-[#1A1714] to-transparent" />
      </div>

      {/* Content */}
      <div className="relative h-full flex flex-col justify-center px-6 lg:px-24">
        {/* Main nav — left-aligned on desktop */}
        <nav className="flex flex-col items-start gap-1">
          {navLinks.map((link, i) => (
            <Link
              key={link.href}
              ref={(el) => { linkRefs.current[i] = el }}
              href={link.href}
              className={`font-[family-name:var(--font-heading)] text-3xl lg:text-6xl font-light transition-colors duration-300 hover:text-[#B8975A] ${
                pathname === link.href ? 'text-[#B8975A]' : 'text-white'
              }`}
              style={{ opacity: 0 }}
              onMouseEnter={() => setHoveredImage(link.image)}
              onMouseLeave={() => setHoveredImage(null)}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Secondary links */}
        <div ref={secondaryRef} className="mt-16 flex items-center gap-6" style={{ opacity: 0 }}>
          {secondaryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-[family-name:var(--font-label)] text-xs uppercase tracking-[0.2em] text-white/50 hover:text-[#B8975A] transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Footer wordmark */}
        <div ref={wordmarkRef} className="absolute bottom-8 left-6 lg:left-24" style={{ opacity: 0 }}>
          <Wordmark className="text-white/30" />
        </div>
      </div>
    </div>
  )
}
