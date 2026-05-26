'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// Galleries browser — filter chips + paginated bento grid.
//
// Handles scale: rather than dumping 50 cards on the page we show the
// first 12 as an editorial bento (mixed tile spans), with a bronze
// "Reveal more nights" button that adds 12 more on each click. Filter
// applies to the whole list and resets pagination.
// ─────────────────────────────────────────────────────────────────────

export interface GalleryItem {
  id: string
  slug: string
  title: string
  category: string | null
  event_date: string | null
  venue_name: string | null
  location: string | null
  cover_image_url: string | null
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'private_dining', label: 'Private Dining' },
  { value: 'members_event', label: 'Members Event' },
  { value: 'sponsored_event', label: 'Sponsored Event' },
  { value: 'special_event', label: 'Special Event' },
  { value: 'curated_experience', label: 'Curated Experience' },
  { value: 'business_enrichment', label: 'Business Enrichment' },
] as const

const INITIAL_VISIBLE = 12
const REVEAL_INCREMENT = 12

function formatCategory(c: string | null) {
  if (!c) return 'Gathering'
  return c
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function GalleriesBrowser({ items }: { items: GalleryItem[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all')
  const [visible, setVisible] = useState(INITIAL_VISIBLE)

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((g) => g.category === filter)
  }, [items, filter])

  const shown = filtered.slice(0, visible)
  const hasMore = filtered.length > visible

  function selectFilter(v: (typeof FILTERS)[number]['value']) {
    setFilter(v)
    setVisible(INITIAL_VISIBLE) // reset paging on filter change
  }

  return (
    <>
      {/* ── Filter chips — single row, horizontal-scroll on
         smaller viewports. The outer wrapper handles overflow; the
         inner track is `w-max mx-auto`, which centers itself when
         the chips fit and pins to the start (so all items remain
         scrollable) when they don't. Avoids the `justify-center`
         + `overflow-x-auto` trap where overflow clips both sides
         and the leftmost items become unreachable. */}
      <div className="mb-12 lg:mb-16">
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light text-center mb-7">
          Event Style
        </p>
        <div className="overflow-x-auto no-scrollbar px-2 lg:px-0">
          <div className="flex flex-nowrap gap-2.5 lg:gap-3 w-max mx-auto">
            {FILTERS.map((f) => {
              const active = filter === f.value
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => selectFilter(f.value)}
                  className={cn(
                    'shrink-0 px-4 py-2.5 rounded-full border font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.26em] transition-all duration-300',
                    active
                      ? 'border-bronze bg-bronze/15 text-bronze-light shadow-[0_0_22px_-10px_rgba(192,152,112,0.65)]'
                      : 'border-graphite-line/70 text-ivory-soft hover:border-bronze/60 hover:text-ivory',
                  )}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>

        <p className="text-center mt-7 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] tabular-nums text-slate-haze">
          {String(filtered.length).padStart(2, '0')}{' '}
          {filtered.length === 1 ? 'gathering' : 'gatherings'}
          {filter !== 'all' && (
            <span className="text-bronze-light/85"> · {formatCategory(filter)}</span>
          )}
        </p>
      </div>

      {/* ── Uniform card grid ──────────────────────────────────
         Simple 3-up grid of equal cards — easier to scan than the
         bento (which is used above the fold by the featured
         carousel anyway). Each card is the same shape and size. */}
      {shown.length === 0 ? (
        <div className="border border-graphite-line/40 rounded-2xl p-20 text-center">
          <ImageIcon
            size={32}
            strokeWidth={1.2}
            className="mx-auto text-bronze/55 mb-6"
          />
          <p className="font-[family-name:var(--font-editorial)] italic text-[18px] text-ivory-soft">
            No gatherings in this category yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {shown.map((g) => (
            <GalleryCard key={g.id} g={g} />
          ))}
        </div>
      )}

      {/* ── Reveal more ────────────────────────────────────── */}
      {hasMore && (
        <div className="mt-16 flex justify-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + REVEAL_INCREMENT)}
            className="group relative inline-block"
          >
            <span className="block relative px-9 py-4 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
              <span
                aria-hidden
                className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover:border-ink/20"
              />
              <span
                aria-hidden
                className="absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out"
              />
              <span className="relative z-10 flex items-center gap-3 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-ivory group-hover:text-ink transition-colors duration-700">
                Reveal {Math.min(REVEAL_INCREMENT, filtered.length - visible)} more
              </span>
            </span>
          </button>
        </div>
      )}
    </>
  )
}

// ─── Card — uniform shape, used by the Atlas grid ─────────────────

function GalleryCard({ g }: { g: GalleryItem }) {
  const date = formatDate(g.event_date)
  return (
    <Link
      href={`/gallery/${g.slug}`}
      className="always-night group block border border-graphite-line/40 hover:border-bronze/55 transition-colors duration-500 bg-graphite-2 overflow-hidden"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-graphite">
        {g.cover_image_url ? (
          <Image
            src={g.cover_image_url}
            alt={g.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-[family-name:var(--font-display)] text-6xl text-slate-dim">
              {g.title.charAt(0)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/15 to-transparent" />
        <div className="film-grain-night pointer-events-none" />

        {/* Top-right arrow on hover */}
        <ArrowUpRight
          size={16}
          strokeWidth={1.2}
          className="absolute top-4 right-4 text-bronze opacity-0 group-hover:opacity-100 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-500"
        />
      </div>

      <div className="p-6">
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
          {formatCategory(g.category)}
          {date && <span className="text-slate-haze"> · {date}</span>}
        </p>
        <h3 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.4vw,1.375rem)] leading-[1.2] text-ivory group-hover:text-bronze-light transition-colors duration-500">
          {g.title}
        </h3>
        {(g.venue_name || g.location) && (
          <p className="mt-2 text-[12px] text-ivory-soft/75 uppercase tracking-[0.18em]">
            {[g.venue_name, g.location].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </Link>
  )
}
