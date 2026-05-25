'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Right-edge sticky "Become a Member" badge — visible across the
// public site as a quiet persistent CTA. Vertically pinned to the
// right edge, atmospheric photo on top, bronze panel beneath with
// the label rotated 90° for a vertical read.
//
// Behaviours:
//   - Desktop only (hidden under lg) — too cramped on mobile
//   - Slides in once the hero is mostly out of view (so it doesn't
//     compete with the hero's own Apply CTA)
//   - Slides out on the apply page itself (no point pointing to where
//     you already are)
//   - Click → /membership-application
//   - Hover: subtle expand + bronze brighten

const BADGE_IMAGE = '/theclub-section.png'

// Hide the badge on any apply / sign-in flow — no point pointing the
// user toward a page they're already on.
const HIDDEN_ON: string[] = ['/membership-application', '/login']

export function JoinBadge() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Show once the user has scrolled ~85% of the viewport height.
    // Hero is 100vh tall — this means the badge appears just as the
    // user leaves the hero, not before.
    function update() {
      setVisible(window.scrollY > window.innerHeight * 0.85)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  if (HIDDEN_ON.some((p) => pathname === p || pathname?.startsWith(p + '/'))) {
    return null
  }

  return (
    <Link
      href="/membership-application"
      aria-label="Become a member"
      className={`group fixed right-0 top-1/2 -translate-y-1/2 z-30 hidden lg:flex flex-col w-[68px] hover:w-[74px] shadow-[var(--shadow-lg)] transition-all duration-700 ease-out ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      {/* Atmospheric photo cap — kept moderately translucent and
          blurred so the badge reads as one cohesive glass panel rather
          than a solid block stuck on a transparent block. */}
      <div className="relative h-[120px] overflow-hidden backdrop-blur-md">
        <Image
          src={BADGE_IMAGE}
          alt=""
          fill
          className="object-cover opacity-80 transition-transform duration-[1200ms] ease-out group-hover:scale-110"
          sizes="80px"
        />
        {/* Glass tint over the photo — bronze wash + bottom fade to
            blend into the panel beneath */}
        <div className="absolute inset-0 bg-bronze/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-bronze/70" />
      </div>

      {/* Glassmorphism panel — semi-transparent bronze + heavy
          backdrop-blur so page content behind reads as softly
          frosted, not blocked. Inner hairline + subtle white highlight
          give it the "frosted glass plaque" feel. Text has a soft
          shadow so it stays legible against any background colour
          underneath. */}
      <div className="relative flex-1 min-h-[240px] bg-bronze/55 backdrop-blur-xl group-hover:bg-bronze/70 transition-colors duration-500 flex items-center justify-center py-6 border-l border-bronze/40 shadow-[inset_1px_0_0_0_rgba(255,255,255,0.08)]">
        <span
          className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.42em] text-ivory whitespace-nowrap"
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            textShadow: '0 1px 3px rgba(14,16,20,0.55), 0 2px 12px rgba(14,16,20,0.35)',
          }}
        >
          Become a Member
        </span>

        {/* Bronze hairline corner brackets */}
        <span aria-hidden className="absolute top-3 left-3 w-3 h-px bg-ivory/60" />
        <span aria-hidden className="absolute top-3 left-3 w-px h-3 bg-ivory/60" />
        <span aria-hidden className="absolute bottom-3 right-3 w-3 h-px bg-ivory/60" />
        <span aria-hidden className="absolute bottom-3 right-3 w-px h-3 bg-ivory/60" />
      </div>
    </Link>
  )
}
