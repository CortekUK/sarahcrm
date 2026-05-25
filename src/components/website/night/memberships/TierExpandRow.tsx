'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// Tier "expand row".
//
// Behaviour:
//   - 3 equal cards at rest.
//   - Hover a card → it grows to full width and visually overlaps the
//     others (z-index lift + 700ms ease).
//   - While expanded:
//        × close button         (top-right of the content panel)
//        ← / → carousel arrows  (left/right edges of the card)
//        Esc / arrow keys       (keyboard)
//     to switch between tiers without leaving the row.
//   - Move the cursor outside the row → the expanded card auto-closes
//     (container `onMouseLeave`).
//
// Crucially: NO cursor-X tracking. The expansion does not drag itself
// across as the cursor moves — once a card is open it stays open
// until the user explicitly closes it or leaves the row entirely.
// ─────────────────────────────────────────────────────────────────────

export interface TierData {
  name: string
  price: string
  contract: string
  image: string
  lede: string
  features: readonly string[]
  href: string
}

export function TierExpandRow({ tiers }: { tiers: readonly TierData[] }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  // Detect "phantom enters" without using a timer at all. The
  // phantom enter fires synchronously when z-index changes — the
  // cursor itself doesn't move. So we just check whether the
  // mouse has moved since the last programmatic change (arrow
  // navigation or close). If not, ignore the enter; if yes, accept
  // it instantly. No timer = no perceptible lag for re-hovers.
  const movedSinceChangeRef = useRef<boolean>(true)

  function onRowMouseMove() {
    movedSinceChangeRef.current = true
  }

  const go = useCallback(
    (delta: number) => {
      movedSinceChangeRef.current = false
      setExpanded((prev) => {
        if (prev === null) return prev
        return (prev + delta + tiers.length) % tiers.length
      })
    },
    [tiers.length],
  )

  const close = useCallback(() => {
    movedSinceChangeRef.current = false
    setExpanded(null)
  }, [])

  function onCardEnter(i: number) {
    if (!movedSinceChangeRef.current) return
    setExpanded(i)
  }

  // Keyboard while expanded — Esc closes, ←/→ navigate
  useEffect(() => {
    if (expanded === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, close, go])

  return (
    <>
      {/* ── Desktop ─────────────────────────────────────────── */}
      <div
        onMouseMove={onRowMouseMove}
        onMouseLeave={close}
        className="hidden lg:block relative h-[640px] w-full"
      >
        {tiers.map((t, i) => {
          const isExpanded = expanded === i
          const baseLeft = (i / tiers.length) * 100
          const baseWidth = 100 / tiers.length

          return (
            <div
              key={t.name}
              onMouseEnter={() => onCardEnter(i)}
              className={cn(
                'absolute top-0 bottom-0 overflow-hidden border',
                'transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                isExpanded
                  ? 'border-bronze/65 shadow-[0_0_70px_-20px_rgba(192,152,112,0.65)]'
                  : 'border-graphite-line/40',
              )}
              style={{
                left: isExpanded ? '0%' : `${baseLeft}%`,
                width: isExpanded ? '100%' : `${baseWidth}%`,
                zIndex: isExpanded ? 20 : 5,
              }}
            >
              {/* Compact face — visible at rest, fades out on expand */}
              <div
                className={cn(
                  'absolute inset-0 transition-opacity duration-[400ms] ease-out',
                  isExpanded ? 'opacity-0 pointer-events-none' : 'opacity-100',
                )}
              >
                <CompactFace tier={t} />
              </div>

              {/* Expanded face — fades in after the box has grown so
                 the content lands as a reveal rather than racing the
                 width transition. */}
              <div
                className={cn(
                  'absolute inset-0 transition-opacity duration-[500ms] ease-out',
                  isExpanded ? 'opacity-100 delay-200' : 'opacity-0 pointer-events-none',
                )}
              >
                <ExpandedFace
                  tier={t}
                  index={i}
                  total={tiers.length}
                  onClose={close}
                  onPrev={() => go(-1)}
                  onNext={() => go(1)}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Mobile / tablet ─────────────────────────────────── */}
      <div className="lg:hidden space-y-5">
        {tiers.map((t) => (
          <MobileTier key={t.name} tier={t} />
        ))}
      </div>
    </>
  )
}

// ─── Compact face ────────────────────────────────────────────────────

function CompactFace({ tier }: { tier: TierData }) {
  return (
    <div className="relative h-full">
      <Image src={tier.image} alt="" fill sizes="33vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/25 via-ink/55 to-ink/95" />
      <div className="film-grain-night pointer-events-none" />

      <div className="relative h-full flex flex-col justify-end p-9 lg:p-10">
        <p className="font-[family-name:var(--font-display)] text-[clamp(1.625rem,2.2vw,2.125rem)] leading-none text-ivory">
          {tier.name}
        </p>
        <p className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,3.4vw,3rem)] leading-none text-bronze-light tabular-nums mt-5">
          {tier.price}
        </p>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-ivory-soft/70 mt-4">
          {tier.contract}
        </p>
      </div>

      {/* Top-corner hint */}
      <span aria-hidden className="absolute top-5 right-5 flex items-center gap-2">
        <span className="block w-6 h-px bg-bronze/60" />
        <span className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.4em] text-bronze-light/80">
          Expand
        </span>
      </span>
    </div>
  )
}

// ─── Expanded face — controls live here ─────────────────────────────

function ExpandedFace({
  tier,
  index,
  total,
  onClose,
  onPrev,
  onNext,
}: {
  tier: TierData
  index: number
  total: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="relative h-full grid grid-cols-12">
      {/* Image — left ~42% */}
      <div className="col-span-5 relative overflow-hidden">
        <Image src={tier.image} alt="" fill sizes="50vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-ink/15 to-ink" />
        <div className="film-grain-night pointer-events-none" />
      </div>

      {/* Content — right ~58% */}
      <div className="col-span-7 relative bg-ink p-10 lg:p-14 xl:p-16 flex flex-col justify-center">
        {/* Top-right: counter + close */}
        <div className="absolute top-6 right-6 flex items-center gap-4 z-20">
          <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] tabular-nums text-bronze-light">
            {String(index + 1).padStart(2, '0')}
            <span className="text-slate-haze mx-1.5">/</span>
            <span className="text-slate-haze">{String(total).padStart(2, '0')}</span>
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            aria-label="Close tier details"
            className="w-9 h-9 rounded-full bg-graphite/60 border border-bronze/40 backdrop-blur flex items-center justify-center text-bronze-light hover:bg-bronze hover:text-ink transition-colors duration-300"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Counter rail with tier name */}
        <div className="flex items-center gap-4 mb-8 mt-12">
          <span className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.42em] text-bronze-light">
            {tier.name}
          </span>
          <span className="flex-1 h-px bg-bronze/55 max-w-[120px]" />
        </div>

        <p className="font-[family-name:var(--font-display)] text-[clamp(3rem,5vw,4.5rem)] leading-none text-ivory tabular-nums">
          {tier.price}
        </p>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-ivory-soft/70 mt-5">
          {tier.contract}
        </p>

        <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.1875rem)] leading-[1.7] text-ivory-soft mt-8 max-w-md">
          {tier.lede}
        </p>

        <ul className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-x-7 gap-y-3 max-w-xl">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-[7px] w-1 h-1 rounded-full bg-bronze shrink-0"
              />
              <span className="font-[family-name:var(--font-editorial)] text-[13px] leading-[1.55] text-ivory-soft">
                {f}
              </span>
            </li>
          ))}
        </ul>

        <Link href={tier.href} className="group relative inline-block mt-10 self-start">
          <span className="block relative px-9 py-4 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
            <span
              aria-hidden
              className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover:border-ink/20"
            />
            <span
              aria-hidden
              className="absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out"
            />
            <span className="relative z-10 flex items-center gap-3 font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ivory group-hover:text-ink transition-colors duration-700">
              Apply for {tier.name}
              <ArrowUpRight
                size={14}
                strokeWidth={1.5}
                className="transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
              />
            </span>
          </span>
        </Link>
      </div>

      {/* Carousel arrows — float on either edge of the expanded card,
         vertically centred. stopPropagation so the click doesn't reach
         the card wrapper. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onPrev()
        }}
        aria-label="Previous tier"
        className="absolute left-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-graphite/60 border border-bronze/40 backdrop-blur flex items-center justify-center text-bronze-light hover:bg-bronze hover:text-ink transition-colors duration-300 z-20"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onNext()
        }}
        aria-label="Next tier"
        className="absolute right-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-graphite/60 border border-bronze/40 backdrop-blur flex items-center justify-center text-bronze-light hover:bg-bronze hover:text-ink transition-colors duration-300 z-20"
      >
        <ChevronRight size={16} strokeWidth={1.5} />
      </button>
    </div>
  )
}

// ─── Mobile fallback — full content per card, no hover ──────────────

function MobileTier({ tier }: { tier: TierData }) {
  return (
    <article className="relative overflow-hidden border border-graphite-line/40">
      <div className="relative aspect-[16/10]">
        <Image src={tier.image} alt="" fill sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/20 via-ink/55 to-ink/95" />
        <div className="absolute inset-x-0 bottom-0 p-7">
          <p className="font-[family-name:var(--font-display)] text-[26px] leading-none text-ivory">
            {tier.name}
          </p>
          <p className="font-[family-name:var(--font-display)] text-[38px] leading-none text-bronze-light tabular-nums mt-4">
            {tier.price}
          </p>
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-ivory-soft/70 mt-3">
            {tier.contract}
          </p>
        </div>
      </div>

      <div className="p-7 bg-ink">
        <p className="font-[family-name:var(--font-editorial)] italic text-[15px] leading-[1.7] text-ivory-soft">
          {tier.lede}
        </p>
        <ul className="mt-6 space-y-2.5">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-[7px] w-1 h-1 rounded-full bg-bronze shrink-0"
              />
              <span className="font-[family-name:var(--font-editorial)] text-[13.5px] leading-[1.55] text-ivory-soft">
                {f}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href={tier.href}
          className="mt-7 inline-flex items-center gap-2 px-6 py-3 border border-bronze rounded-full font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light"
        >
          Apply for {tier.name}
          <ArrowUpRight size={13} strokeWidth={1.5} />
        </Link>
      </div>
    </article>
  )
}
