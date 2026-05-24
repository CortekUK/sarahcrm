'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { KenBurnsImage } from '../primitives/MediaBlocks'
import { Sparkles } from '../effects/Sparkles'
import { Aurora } from '../effects/Aurora'
import { Spotlight } from '../effects/Spotlight'
import { ChevronDown } from 'lucide-react'

// Homepage cold-open. Behaviour:
//   - Full-bleed KenBurns photograph (later: video loop) with a deep
//     overlay so type stays readable against the busiest frame.
//   - Aurora warm-variant haze plus a thin layer of bronze sparkles for
//     atmospheric depth.
//   - Spotlight follows the cursor — but only on hover-capable devices.
//   - Wordmark animates in: a single bronze hairline grows left-to-right,
//     the eyebrow fades in beneath it, then "The Club" reveals via clip-
//     path, then "by Sarah Restrick" + tagline join. Subtle, slow.
//
// The hero takes a real photograph URL via prop so it can later swap to
// a CMS-driven background (hero_slides table) without component rewrites.

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1604079628040-94301bb21b91?auto=format&fit=crop&w=2400&q=85'

interface NightHeroProps {
  /** Background image URL. Defaults to a placeholder atmospheric shot. */
  image?: string
  /** Optional video URL — when provided, replaces the still image. */
  video?: string
  /** Alt text for the still. */
  alt?: string
}

export function NightHero({
  image = DEFAULT_IMAGE,
  video,
  alt = 'A candlelit private dining room',
}: NightHeroProps) {
  const wordmarkRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Tiny staggered reveal on mount. No GSAP — just adding classes
    // after a frame so the CSS transitions kick in.
    const el = wordmarkRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.classList.add('hero-revealed')
    })
  }, [])

  return (
    <section className="relative h-screen min-h-[680px] w-full overflow-hidden bg-ink">
      {/* Background layer — image (or video if provided) */}
      <div className="absolute inset-0">
        {video ? (
          <video
            src={video}
            poster={image}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        ) : (
          <KenBurnsImage
            src={image}
            alt={alt}
            motion="in"
            duration={28}
            overlay={0.55}
            priority
            className="absolute inset-0"
          />
        )}
      </div>

      {/* ── Overlays ───────────────────────────────────────────────
         When the background is a video the photo's baked-in 0.55
         overlay isn't there, so we layer up here. Order (bottom→top):
           0  video
           1  baseline ink wash (only for video — image already darkens)
           1  warm aurora
           2  bronze sparkles
           3  cursor spotlight
           4  centre radial vignette (darkens specifically where the
              wordmark sits, so type stays legible against bright
              video frames like the Lamborghini interior)
           4  top + bottom edge vignettes (ground the page edges)
        ─────────────────────────────────────────────────────────── */}
      {video && (
        <div className="absolute inset-0 bg-ink/55 pointer-events-none z-[1]" />
      )}

      <Aurora variant="warm" z={1} />
      <Sparkles count={45} speed={0.6} className="z-[2]" />
      <Spotlight size={700} className="z-[3]" />

      {/* Centre radial darkening — anchors the wordmark area */}
      <div
        className="absolute inset-0 pointer-events-none z-[4]"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at center, rgba(14,16,20,0.55) 0%, rgba(14,16,20,0.3) 35%, transparent 70%)',
        }}
      />
      {/* Bottom vignette grounds the page edge */}
      <div className="absolute inset-x-0 bottom-0 h-[35%] bg-gradient-to-b from-transparent to-ink pointer-events-none z-[4]" />
      {/* Top vignette so header doesn't fight the photo */}
      <div className="absolute inset-x-0 top-0 h-[20%] bg-gradient-to-b from-ink/80 to-transparent pointer-events-none z-[4]" />

      {/* Wordmark stack */}
      <div
        ref={wordmarkRef}
        className="hero-stack relative z-10 h-full flex flex-col items-center justify-center px-6 text-center"
      >
        {/* Eyebrow */}
        <span className="hero-eyebrow flex items-center gap-4 mb-7">
          <span className="block h-px bg-bronze/60 hero-line" />
          <span className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.42em] text-bronze-light">
            Est. by Sarah Restrick
          </span>
          <span className="block h-px bg-bronze/60 hero-line" />
        </span>

        {/* Wordmark — text-shadow safety net for video brightness spikes.
            The shadow is barely perceptible on a clean dark background
            but rescues legibility against unexpectedly bright frames. */}
        <h1
          className="hero-title display-xl text-ivory"
          style={{ textShadow: '0 2px 24px rgba(14,16,20,0.55), 0 1px 3px rgba(14,16,20,0.45)' }}
        >
          <span className="hero-word inline-block">The</span>{' '}
          <span className="hero-word inline-block">Club</span>
        </h1>

        {/* Sub-headline — verbatim from the existing site. */}
        <p
          className="hero-sub mt-9 max-w-2xl font-[family-name:var(--font-editorial)] italic text-[clamp(1.125rem,1.6vw,1.5rem)] leading-relaxed text-ivory-soft"
          style={{ textShadow: '0 1px 12px rgba(14,16,20,0.6)' }}
        >
          Connecting leaders in business through luxury experience.
        </p>

        {/* CTAs */}
        <div className="hero-ctas mt-12 flex items-center gap-4">
          <Link
            href="/membership-application"
            className="inline-flex items-center gap-2 px-7 py-3.5 border border-bronze/70 bg-bronze/10 hover:bg-bronze hover:border-bronze rounded-full font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.32em] text-ivory transition-all duration-500"
          >
            Apply for Membership
          </Link>
          <Link
            href="/about"
            className="inline-flex items-center gap-2 px-2 py-3.5 font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light transition-colors duration-300"
          >
            Discover The Club
            <span className="w-6 h-px bg-current opacity-70" />
          </Link>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="hero-scroll absolute bottom-7 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        <span className="font-[family-name:var(--font-meta)] text-[9px] uppercase tracking-[0.42em] text-ivory/45">
          Continue
        </span>
        <ChevronDown size={14} strokeWidth={1} className="text-ivory/45 animate-bounce-slow" />
      </div>

      <style jsx>{`
        .hero-stack > * {
          opacity: 0;
          transform: translateY(20px);
        }
        .hero-line {
          width: 0;
          transition: width 1.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hero-word {
          opacity: 0;
          clip-path: inset(0 0 100% 0);
          transition: opacity 1.2s ease-out, clip-path 1.2s cubic-bezier(0.22, 1, 0.36, 1);
        }

        :global(.hero-stack.hero-revealed .hero-eyebrow) {
          opacity: 1;
          transform: translateY(0);
          transition: opacity 1s ease-out, transform 1s ease-out;
          transition-delay: 180ms;
        }
        :global(.hero-stack.hero-revealed .hero-eyebrow .hero-line) {
          width: 3rem;
        }
        :global(.hero-stack.hero-revealed .hero-title) {
          opacity: 1;
          transform: translateY(0);
          transition: opacity 1.2s ease-out, transform 1.2s ease-out;
          transition-delay: 520ms;
        }
        :global(.hero-stack.hero-revealed .hero-word) {
          opacity: 1;
          clip-path: inset(0 0 0% 0);
        }
        :global(.hero-stack.hero-revealed .hero-word:nth-child(1)) { transition-delay: 700ms; }
        :global(.hero-stack.hero-revealed .hero-word:nth-child(2)) { transition-delay: 900ms; }
        :global(.hero-stack.hero-revealed .hero-sub) {
          opacity: 1;
          transform: translateY(0);
          transition: opacity 1s ease-out, transform 1s ease-out;
          transition-delay: 1300ms;
        }
        :global(.hero-stack.hero-revealed .hero-ctas) {
          opacity: 1;
          transform: translateY(0);
          transition: opacity 1s ease-out, transform 1s ease-out;
          transition-delay: 1600ms;
        }
        :global(.hero-stack.hero-revealed .hero-scroll) {
          opacity: 1;
          transform: translateY(0);
          transition: opacity 1s ease-out, transform 1s ease-out;
          transition-delay: 2000ms;
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(6px); }
        }
        :global(.animate-bounce-slow) {
          animation: bounce-slow 2.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-stack > *, .hero-word, .hero-line {
            transition: none !important;
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            clip-path: none !important;
            width: 3rem;
          }
        }
      `}</style>
    </section>
  )
}
