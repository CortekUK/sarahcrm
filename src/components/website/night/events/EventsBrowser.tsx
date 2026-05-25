'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, Calendar, Clock, MapPin, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

// Client-side filter for the events listing — pill chips for "all",
// "members events", "curated luxury", "retreats" pulled from the
// `event_type` enum. Filtering happens in-memory on the array passed
// from the server so the page doesn't refresh on filter change.

export interface EventListItem {
  id: string
  slug: string
  title: string
  start_date: string
  end_date: string | null
  doors_open: string | null
  event_type: string
  venue_name: string | null
  venue_city: string | null
  cover_image_url: string | null
  description: string | null
  guest_price_pence: number | null
  member_price_pence: number | null
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'member_event', label: "Members' Events" },
  { value: 'curated_luxury', label: 'Curated Luxury' },
  { value: 'retreat', label: 'Retreats' },
] as const

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatGBP(pence: number | null | undefined) {
  if (pence == null) return null
  if (pence === 0) return 'Complimentary'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(pence / 100)
}

function formatPriceWithVAT(pence: number | null | undefined) {
  if (pence == null) return null
  if (pence === 0) return 'Complimentary'
  return `${formatGBP(pence)} + VAT`
}

// "Complimentary for Members · £500 + VAT Guests" / "£1,500 + VAT
// Members · £2,500 + VAT Guests" — matches the existing live-site
// pricing line. Returns null if neither rate is set.
function formatPriceLine(member: number | null | undefined, guest: number | null | undefined) {
  const m = formatPriceWithVAT(member)
  const g = formatPriceWithVAT(guest)
  if (m && g) {
    if (member === guest) return g
    return `${m} Members · ${g} Guests`
  }
  return m || g || null
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatEventType(t: string) {
  return t.replace(/_/g, ' ').toLowerCase()
}

export function EventsBrowser({
  upcoming,
  past,
}: {
  upcoming: EventListItem[]
  past: EventListItem[]
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all')

  const filteredUpcoming =
    filter === 'all' ? upcoming : upcoming.filter((e) => e.event_type === filter)
  const filteredPast = filter === 'all' ? past : past.filter((e) => e.event_type === filter)

  return (
    <>
      {/* ── Filter chips ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 justify-center mb-14 lg:mb-16">
        {FILTERS.map((f) => {
          const active = filter === f.value
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-5 py-2.5 rounded-full border font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.28em] transition-all duration-300',
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

      {/* ── Upcoming ──────────────────────────────────────────── */}
      <section className="mb-24 lg:mb-32">
        <div className="flex items-center gap-4 mb-10">
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
            Forthcoming
          </p>
          <span className="flex-1 h-px bg-bronze/40" />
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] tabular-nums text-slate-haze">
            {String(filteredUpcoming.length).padStart(2, '0')}{' '}
            {filteredUpcoming.length === 1 ? 'evening' : 'evenings'}
          </p>
        </div>

        {filteredUpcoming.length === 0 ? (
          <EmptyState message="No upcoming evenings in this category yet." />
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
          <div className="flex items-center gap-4 mb-10">
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
              From the Archive
            </p>
            <span className="flex-1 h-px bg-bronze/40" />
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] tabular-nums text-slate-haze">
              {String(filteredPast.length).padStart(2, '0')} past
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
            {filteredPast.slice(0, 12).map((ev) => (
              <PastCard key={ev.id} ev={ev} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

// ─── Upcoming card — bigger, with full particulars + CTA ───────────

function UpcomingCard({ ev }: { ev: EventListItem }) {
  const priceLine = formatPriceLine(ev.member_price_pence, ev.guest_price_pence)
  const time = ev.doors_open
    ? `Doors ${formatTime(ev.doors_open)} · From ${formatTime(ev.start_date)}`
    : formatTime(ev.start_date)

  return (
    <Link
      href={`/events/${ev.slug}`}
      className="group block border border-graphite-line/40 hover:border-bronze/55 transition-colors duration-500 bg-graphite/25 overflow-hidden"
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

        {/* Event type tag, top-left */}
        <span className="absolute top-5 left-5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-ink/75 border border-bronze/45 backdrop-blur font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
          {formatEventType(ev.event_type)}
        </span>
      </div>

      <div className="p-7 lg:p-9">
        <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2vw,2rem)] leading-[1.15] text-ivory group-hover:text-bronze-light transition-colors duration-500">
          {ev.title}
        </h3>

        {/* Particulars — 2-col grid. Venue / Date / Starting share
           the grid; Price spans the full width at the bottom because
           the member/guest line is long. */}
        <dl className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
          {(ev.venue_name || ev.venue_city) && (
            <DetailRow
              icon={MapPin}
              label="Venue"
              value={[ev.venue_name, ev.venue_city].filter(Boolean).join(', ')}
            />
          )}
          <DetailRow icon={Calendar} label="Date" value={formatDate(ev.start_date)} />
          <DetailRow icon={Clock} label="Starting" value={time} />
          {priceLine && (
            <div className="sm:col-span-2">
              <DetailRow icon={Tag} label="Price" value={priceLine} />
            </div>
          )}
        </dl>

        {ev.description && (
          <p className="mt-7 font-[family-name:var(--font-editorial)] italic text-[17px] leading-[1.7] text-ivory line-clamp-3">
            {ev.description}
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

// Particulars row used inside the upcoming card. Bronze icon circle +
// label + value, enlarged from the previous 9.5/14.5 sizes — was too
// small to read on the card.
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
      className="group block border border-graphite-line/40 hover:border-bronze/45 transition-colors duration-500 bg-graphite/20 overflow-hidden"
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
          {formatDate(ev.start_date)}
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
    <div className="border border-graphite-line/40 rounded-2xl p-16 text-center">
      <p className="font-[family-name:var(--font-editorial)] italic text-[17px] text-ivory-soft/85">
        {message}
      </p>
    </div>
  )
}
