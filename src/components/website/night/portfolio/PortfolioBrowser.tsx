'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PORTFOLIO_CATEGORIES,
  caseStudyWhen,
  portfolioCategoryLabel,
  type CaseStudySummary,
  type PortfolioCategory,
} from '@/lib/cms/portfolio-shared'

// ─────────────────────────────────────────────────────────────────────
// Portfolio browser — filter chips + the large editorial grid.
//
// Fewer, bigger stories: cards alternate full-width and half-width as
// set per case study in the CMS (layout = full | half). A half card left
// on its own (next card is full, or it's the last one) is promoted to
// full width so nothing is stranded beside an empty column.
// ─────────────────────────────────────────────────────────────────────

type Filter = 'all' | PortfolioCategory

const FILTERS: { value: Filter; label: string }[] = [{ value: 'all', label: 'All' }, ...PORTFOLIO_CATEGORIES]

export function PortfolioBrowser({ items }: { items: CaseStudySummary[] }) {
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.category === filter)),
    [items, filter],
  )

  // Resolve each card's span: halves pair up; an unpaired half goes full.
  const laidOut = useMemo(() => {
    const out: { item: CaseStudySummary; full: boolean }[] = []
    let i = 0
    while (i < filtered.length) {
      const cur = filtered[i]
      const next = filtered[i + 1]
      if (cur.layout === 'half' && next && next.layout === 'half') {
        out.push({ item: cur, full: false }, { item: next, full: false })
        i += 2
      } else {
        out.push({ item: cur, full: true })
        i += 1
      }
    }
    return out
  }, [filtered])

  return (
    <>
      <div className="mb-12 lg:mb-16">
        <div className="overflow-x-auto no-scrollbar -mx-2 px-2">
          <div className="flex flex-nowrap gap-2.5 lg:gap-3 w-max mx-auto" role="group" aria-label="Filter the portfolio">
            {FILTERS.map((f) => {
              const active = filter === f.value
              return (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    'shrink-0 px-4 py-2.5 rounded-full border font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.26em] transition-all duration-300',
                    active
                      ? 'border-bronze bg-bronze/15 text-bronze-light'
                      : 'border-graphite-line/70 text-ivory-soft hover:border-bronze/60 hover:text-ivory',
                  )}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {laidOut.length === 0 ? (
        <div className="border border-graphite-line/50 p-12 lg:p-20 text-center">
          <p className="font-[family-name:var(--font-editorial)] italic text-[18px] text-ivory-soft">
            {filter === 'all'
              ? 'Our case studies are being written up. Ask us about the rooms we have built.'
              : `No ${portfolioCategoryLabel(filter)} case studies are published yet.`}
          </p>
          {filter !== 'all' && (
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="mt-6 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.3em] text-bronze-light hover:text-ivory transition-colors"
            >
              Show all
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
          {laidOut.map(({ item, full }, idx) => (
            <CaseStudyCard key={item.id} item={item} full={full} priority={idx < 2} />
          ))}
        </div>
      )}
    </>
  )
}

export function CaseStudyCard({
  item,
  full,
  priority = false,
}: {
  item: CaseStudySummary
  full: boolean
  priority?: boolean
}) {
  const when = caseStudyWhen(item)
  const meta = [item.location, when].filter(Boolean).join(' · ')
  return (
    <Link
      href={`/portfolio/${item.slug}`}
      className={cn(
        'group relative block overflow-hidden bg-graphite always-night',
        full ? 'md:col-span-2 aspect-[4/5] sm:aspect-[16/10] lg:aspect-[21/9]' : 'aspect-[4/5]',
      )}
    >
      {item.hero_image_url ? (
        // Plain <img>: hero images can be local or uploaded to storage.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.hero_image_url}
          alt={`${item.title}, a The Club case study`}
          loading={priority ? 'eager' : 'lazy'}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-graphite-2 to-plum/40" />
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-ink/5 pointer-events-none"
      />
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-10">
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.36em] text-bronze-light mb-3">
          {portfolioCategoryLabel(item.category)}
          {item.partner_names && <span className="text-ivory-soft"> · {item.partner_names}</span>}
        </p>
        <h3
          className={cn(
            'font-[family-name:var(--font-display)] leading-[1.1] tracking-[-0.01em] text-ivory',
            full ? 'text-[clamp(1.75rem,3.4vw,3rem)] max-w-3xl' : 'text-[clamp(1.5rem,2.4vw,2.1rem)]',
          )}
        >
          {item.title}
        </h3>
        {item.headline_result && (
          <p className="mt-3 font-[family-name:var(--font-editorial)] italic text-[clamp(1.05rem,1.4vw,1.35rem)] leading-snug text-bronze-light">
            {item.headline_result}
          </p>
        )}
        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-ivory-soft">
            {meta}
          </p>
          <span className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-ivory group-hover:text-bronze-light transition-colors duration-500 shrink-0">
            Read the story
            <ArrowUpRight
              size={13}
              strokeWidth={1.5}
              className="transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </span>
        </div>
      </div>
    </Link>
  )
}
