'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, Calendar, Clock, Lock, MapPin, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BOOKING_STATUS_LABELS,
  CURATED_INTRO,
  LOCKED_LINE,
  PROGRAMME_FILTERS,
  PROGRAMME_SUMMARIES,
  PROGRAMME_TAG,
  isProgramme,
  type Programme,
} from '@/components/website/events/programmes'
import { eventPriceLine, formatDateRange, formatTimeUk as formatTime, ukDay } from '@/components/website/events/format'

// ─────────────────────────────────────────────────────────────────────
// /events browser — programme filter chips (All · Member Events · Round
// Tables · PITCH · Curated Experiences · London Series at Harrods), a
// programme summary band when filtered, and the cards.
//
// Only PUBLIC events are ever passed in (the page queries visibility =
// 'public'; RLS also hides members-only rows from signed-out visitors), so
// the Curated Experiences filter shows the programme + highlights and one
// locked card — never members-only dates, venues or prices.
// The active filter is mirrored in ?programme= so the homepage tiles can
// deep-link to a filtered view.
// ─────────────────────────────────────────────────────────────────────

export interface EventListItem {
  id: string
  slug: string
  title: string
  start_date: string
  end_date: string | null
  doors_open: string | null
  event_type: string
  programme: string | null
  booking_status: string | null
  short_description: string | null
  venue_name: string | null
  venue_city: string | null
  cover_image_url: string | null
  description: string | null
  guest_price_pence: number | null
  member_price_pence: number | null
  vat_mode?: string | null
  vat_rate?: number | null
}

type FilterValue = 'all' | Programme

function timeLine(ev: EventListItem) {
  if (ev.end_date && ukDay(ev.start_date) !== ukDay(ev.end_date)) return null
  const from = formatTime(ev.start_date)
  const to = ev.end_date ? ` – ${formatTime(ev.end_date)}` : ''
  return ev.doors_open
    ? `Doors ${formatTime(ev.doors_open)} · From ${from}${to} UK time`
    : `${from}${to} UK time`
}

export function EventsBrowser({
  upcoming,
  past,
  initialProgramme,
}: {
  upcoming: EventListItem[]
  past: EventListItem[]
  initialProgramme?: string | null
}) {
  const [filter, setFilter] = useState<FilterValue>(
    isProgramme(initialProgramme) && initialProgramme !== 'partner_event' ? initialProgramme : 'all',
  )

  // Keep ?programme= in the address bar in step with the chips (no reload).
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (filter === 'all') url.searchParams.delete('programme')
      else url.searchParams.set('programme', filter)
      window.history.replaceState(window.history.state, '', url.toString())
    } catch {
      /* non-browser / sandboxed — the filter still works in memory */
    }
  }, [filter])

  const match = (e: EventListItem) => filter === 'all' || e.programme === filter
  const filteredUpcoming = upcoming.filter(match)
  const filteredPast = past.filter(match)
  const summary = filter === 'all' ? null : PROGRAMME_SUMMARIES[filter]
  const isCurated = filter === 'curated_experience'

  return (
    <>
      {/* ── Filter chips ───────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Filter events by programme"
        className="flex flex-wrap gap-2.5 sm:gap-3 justify-center mb-12 lg:mb-14"
      >
        {PROGRAMME_FILTERS.map((f) => {
          const active = filter === f.value
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-4 sm:px-5 py-2.5 rounded-full border font-[family-name:var(--font-meta)] text-[10.5px] sm:text-[11px] uppercase tracking-[0.24em] sm:tracking-[0.28em] transition-all duration-300',
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

      {/* ── Programme summary band ─────────────────────────────── */}
      {summary && (
        <div className="mb-14 lg:mb-16 border border-bronze/35 bg-graphite-2/60 px-6 py-7 sm:px-9 sm:py-9 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
          <div className="lg:col-span-4">
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-3">
              The Programme
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2.2vw,2.125rem)] leading-[1.15] text-ivory">
              {summary.headline}
            </h2>
          </div>
          <div className="lg:col-span-8 space-y-3">
            {summary.lines.map((l) => (
              <p
                key={l}
                className="font-[family-name:var(--font-editorial)] text-[clamp(1rem,1.2vw,1.125rem)] leading-[1.7] text-ivory"
              >
                {l}
              </p>
            ))}
            {isCurated && (
              <p className="font-[family-name:var(--font-editorial)] italic text-[16px] leading-[1.7] text-ivory-soft">
                {CURATED_INTRO.body}
              </p>
            )}
            {summary.terms && (
              <p className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.26em] text-bronze-light leading-[1.9]">
                {summary.terms}
              </p>
            )}
            {summary.link && (
              <Link
                href={summary.link.href}
                className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory hover:text-bronze-light transition-colors"
              >
                {summary.link.label}
                <ArrowUpRight size={13} strokeWidth={1.5} />
              </Link>
            )}
          </div>
        </div>
      )}

      {isCurated ? (
        <CuratedPublicView />
      ) : (
        <>
          {/* ── Upcoming ──────────────────────────────────────────── */}
          <section className="mb-24 lg:mb-32">
            <SectionRule
              label="Forthcoming"
              count={`${String(filteredUpcoming.length).padStart(2, '0')} ${filteredUpcoming.length === 1 ? 'event' : 'events'}`}
            />
            {filteredUpcoming.length === 0 ? (
              <EmptyState message="No upcoming events in this programme yet. New dates are added through the year." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                {filteredUpcoming.map((ev) => (
                  <UpcomingCard key={ev.id} ev={ev} />
                ))}
              </div>
            )}
          </section>

          {/* ── Past ───────────────────────────────────────────────── */}
          {filteredPast.length > 0 && (
            <section>
              <SectionRule label="From the Archive" count={`${String(filteredPast.length).padStart(2, '0')} past`} />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
                {filteredPast.slice(0, 12).map((ev) => (
                  <PastCard key={ev.id} ev={ev} />
                ))}
              </div>
              <p className="mt-10 text-center">
                <Link
                  href="/portfolio"
                  className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors"
                >
                  See the Portfolio
                  <ArrowUpRight size={13} strokeWidth={1.5} />
                </Link>
              </p>
            </section>
          )}
        </>
      )}
    </>
  )
}

function SectionRule({ label, count }: { label: string; count: string }) {
  return (
    <div className="flex items-center gap-4 mb-10">
      <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
        {label}
      </p>
      <span className="flex-1 h-px bg-bronze/40" />
      <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] tabular-nums text-slate-haze">
        {count}
      </p>
    </div>
  )
}

// ─── Curated Experiences — public view: programme + highlights + one
// locked card. Dates, venues, pricing and booking are members-only. ──────

function CuratedPublicView() {
  return (
    <section className="mb-24 lg:mb-32 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
      <div className="lg:col-span-7">
        <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2.4vw,2.25rem)] leading-[1.15] text-ivory">
          {CURATED_INTRO.title}
        </h3>
        <ul className="mt-7 flex flex-wrap gap-2.5">
          {CURATED_INTRO.disciplines.map((d) => (
            <li
              key={d}
              className="px-4 py-2 rounded-full border border-graphite-line/70 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.26em] text-ivory-soft"
            >
              {d}
            </li>
          ))}
        </ul>
        <p className="mt-10 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-4">
          Past highlights
        </p>
        <ul className="space-y-3 border-l border-bronze/30 pl-6">
          {CURATED_INTRO.highlights.map((h) => (
            <li
              key={h}
              className="font-[family-name:var(--font-editorial)] italic text-[17px] leading-[1.6] text-ivory"
            >
              {h}
            </li>
          ))}
        </ul>
        <p className="mt-6 font-[family-name:var(--font-editorial)] italic text-[15px] text-ivory-soft">
          By invitation · UHNW · Luxury brands · Members
        </p>
      </div>

      <div className="lg:col-span-5">
        <LockedCard />
      </div>
    </section>
  )
}

export function LockedCard({ redirect = '/portal/events?programme=curated_experience' }: { redirect?: string }) {
  return (
    <div className="relative border border-bronze/45 bg-graphite-2 p-8 lg:p-10 overflow-hidden">
      <div className="film-grain-night pointer-events-none" />
      <span className="w-11 h-11 rounded-full bg-bronze/10 border border-bronze/45 flex items-center justify-center">
        <Lock size={16} strokeWidth={1.5} className="text-bronze-light" />
      </span>
      <p className="mt-6 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
        Members only
      </p>
      <p className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.375rem,2vw,1.75rem)] leading-[1.25] text-ivory">
        {LOCKED_LINE}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/login?redirect=${encodeURIComponent(redirect)}`}
          className="px-6 py-3 rounded-full border border-bronze bg-bronze text-ink font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.3em] hover:bg-bronze-light transition-colors"
        >
          Sign in
        </Link>
        <Link
          href="/membership-application"
          className="px-6 py-3 rounded-full border border-bronze/70 text-ivory font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.3em] hover:border-bronze hover:text-bronze-light transition-colors"
        >
          Apply
        </Link>
      </div>
    </div>
  )
}

// ─── Upcoming card ─────────────────────────────────────────────────

export function BookingStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const label = status ? BOOKING_STATUS_LABELS[status] : null
  if (!label) return null
  return (
    <span
      className={cn(
        'inline-flex items-center px-3 py-1.5 rounded-full border backdrop-blur font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.3em]',
        status === 'sold_out'
          ? 'bg-ink/80 border-accent-warm/60 text-accent-warm'
          : 'bg-ink/75 border-ivory/35 text-ivory',
        className,
      )}
    >
      {label}
    </span>
  )
}

function UpcomingCard({ ev }: { ev: EventListItem }) {
  const priceLine = eventPriceLine(ev)
  const time = timeLine(ev)
  const tag = isProgramme(ev.programme) ? PROGRAMME_TAG[ev.programme] : null
  const teaser = ev.short_description || ev.description

  return (
    <Link
      href={`/events/${ev.slug}`}
      className="group block border border-graphite-line/40 hover:border-bronze/55 transition-colors duration-500 bg-graphite-2 overflow-hidden"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-graphite">
        {ev.cover_image_url ? (
          <Image
            src={ev.cover_image_url}
            alt={ev.title}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-[family-name:var(--font-display)] text-7xl text-slate-dim">
              {ev.title.charAt(0)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
        <div className="film-grain-night pointer-events-none" />

        {tag && (
          <span className="absolute top-5 left-5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-ink/75 border border-bronze/45 backdrop-blur font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
            {tag}
          </span>
        )}
        <BookingStatusBadge status={ev.booking_status} className="absolute top-5 right-5" />
      </div>

      <div className="p-6 sm:p-7 lg:p-9">
        <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2vw,2rem)] leading-[1.15] text-ivory group-hover:text-bronze-light transition-colors duration-500">
          {ev.title}
        </h3>

        <dl className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
          {(ev.venue_name || ev.venue_city) && (
            <DetailRow
              icon={MapPin}
              label="Venue"
              value={[ev.venue_name, ev.venue_city].filter(Boolean).join(', ')}
            />
          )}
          <DetailRow icon={Calendar} label="Date" value={formatDateRange(ev.start_date, ev.end_date)} />
          {time && <DetailRow icon={Clock} label="Time" value={time} />}
          {priceLine && (
            <div className="sm:col-span-2">
              <DetailRow icon={Tag} label="Price" value={priceLine} />
            </div>
          )}
        </dl>

        {teaser && (
          <p className="mt-7 font-[family-name:var(--font-editorial)] italic text-[17px] leading-[1.7] text-ivory line-clamp-3">
            {teaser}
          </p>
        )}

        <p className="mt-8 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light group-hover:text-ivory transition-colors duration-500">
          Find Out More
          <ArrowUpRight
            size={14}
            strokeWidth={1.5}
            className="transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </p>
      </div>
    </Link>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-[2px] w-9 h-9 rounded-full bg-bronze/10 border border-bronze/35 flex items-center justify-center shrink-0">
        <Icon size={14} strokeWidth={1.5} className="text-bronze-light" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-slate-haze">
          {label}
        </p>
        <p className="mt-1 font-[family-name:var(--font-editorial)] text-[16.5px] leading-[1.5] text-ivory">
          {value}
        </p>
      </div>
    </div>
  )
}

// ─── Past card — smaller, grayscale ────────────────────────────────

function PastCard({ ev }: { ev: EventListItem }) {
  return (
    <Link
      href={`/events/${ev.slug}`}
      className="group block border border-graphite-line/40 hover:border-bronze/45 transition-colors duration-500 bg-graphite-2 overflow-hidden"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-graphite">
        {ev.cover_image_url ? (
          <Image
            src={ev.cover_image_url}
            alt={ev.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover grayscale-[50%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-[family-name:var(--font-display)] text-5xl text-slate-dim">
              {ev.title.charAt(0)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
        <div className="film-grain-night pointer-events-none" />
      </div>
      <div className="p-5">
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light/85">
          {formatDateRange(ev.start_date, ev.end_date)}
        </p>
        <h3 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.4vw,1.375rem)] leading-tight text-ivory-soft group-hover:text-ivory transition-colors duration-500">
          {ev.title}
        </h3>
        {(ev.venue_name || ev.venue_city) && (
          <p className="mt-2 text-[11.5px] text-slate-haze uppercase tracking-[0.18em]">
            {[ev.venue_name, ev.venue_city].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </Link>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-graphite-line/40 rounded-2xl p-10 sm:p-16 text-center">
      <p className="font-[family-name:var(--font-editorial)] italic text-[17px] text-ivory-soft/85">
        {message}
      </p>
    </div>
  )
}
