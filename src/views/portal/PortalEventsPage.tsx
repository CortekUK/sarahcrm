'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { eventPriceLine, formatDateRange, formatTimeUk, ukDay } from '@/components/website/events/format'
import {
  BOOKING_STATUS_LABELS,
  PROGRAMME_FILTERS,
  PROGRAMME_TAG,
  isProgramme,
  type Programme,
} from '@/components/website/events/programmes'
import { fetchSeatsTaken } from '@/components/portal/portal-utils'
import { ArrowUpRight, Calendar, Lock, MapPin, Users } from 'lucide-react'
import {
  PortalBadge,
  PortalEmptyState,
  PortalLoading,
  PortalPageHeader,
  type PortalBadgeVariant,
} from '@/components/portal/PortalChrome'
import type { Database } from '@/types/database'

type EventType = Database['public']['Enums']['event_type']

// Members see public AND members-only events (Curated Experiences: full
// dates, venues, pricing and booking). Filter by programme, ?programme=.

interface PublicEvent {
  id: string
  title: string
  slug: string
  description: string | null
  short_description: string | null
  event_type: EventType
  programme: string | null
  visibility: string
  booking_status: string
  start_date: string
  end_date: string | null
  venue_name: string | null
  venue_city: string | null
  member_price_pence: number
  guest_price_pence: number
  vat_mode?: string | null
  vat_rate?: number | null
  capacity: number | null
  cover_image_url: string | null
}

const typeLabels: Record<EventType, string> = {
  member_event: 'Member Event',
  curated_luxury: 'Curated Experience',
  retreat: 'Retreat',
}

const programmeVariant: Record<Programme, PortalBadgeVariant> = {
  member_event: 'info',
  round_table: 'info',
  pitch: 'active',
  curated_experience: 'upcoming',
  london_series: 'upcoming',
  partner_event: 'neutral',
}

// Portal chips: the public set plus Partner Events.
const FILTERS: { value: 'all' | Programme; label: string }[] = [
  ...PROGRAMME_FILTERS,
  { value: 'partner_event', label: 'Partner Events' },
]

export function PortalEventsPage() {
  const [events, setEvents] = useState<PublicEvent[]>([])
  // Seats taken per event — counted server-side (RLS hides other members'
  // bookings, so a client-side count would always read 0 or 1).
  const [seats, setSeats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | Programme>('all')

  useEffect(() => {
    fetchEvents()
    try {
      const p = new URL(window.location.href).searchParams.get('programme')
      if (isProgramme(p)) setFilter(p)
    } catch {
      /* ignore */
    }
  }, [])

  function choose(next: 'all' | Programme) {
    setFilter(next)
    try {
      const url = new URL(window.location.href)
      if (next === 'all') url.searchParams.delete('programme')
      else url.searchParams.set('programme', next)
      window.history.replaceState(window.history.state, '', url.toString())
    } catch {
      /* ignore */
    }
  }

  async function fetchEvents() {
    const { data } = await supabase
      .from('events')
      .select(
        'id, title, slug, description, short_description, event_type, programme, visibility, booking_status, start_date, end_date, venue_name, venue_city, member_price_pence, guest_price_pence, capacity, cover_image_url, vat_mode, vat_rate',
      )
      .in('status', ['published', 'live'])
      // Still listed until it finishes (multi-day experiences).
      .or(`start_date.gte.${new Date().toISOString()},end_date.gte.${new Date().toISOString()}`)
      .order('start_date', { ascending: true })

    const list = (data ?? []) as unknown as PublicEvent[]
    setEvents(list)
    const withCapacity = list
      .filter((e) => e.capacity != null && e.booking_status === 'open')
      .map((e) => e.id)
    if (withCapacity.length > 0) setSeats(await fetchSeatsTaken(withCapacity))
    setLoading(false)
  }

  const shown = filter === 'all' ? events : events.filter((e) => e.programme === filter)

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12">
        <PortalLoading label="Loading events" />
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
      <PortalPageHeader
        eyebrow="The Calendar"
        title="Upcoming events."
        subtitle="Five programmes, one calendar — including the full Curated Experiences programme for The Club Members. Reserve your place below."
      />

      <div className="flex flex-wrap gap-2 mb-10" role="tablist" aria-label="Filter by programme">
        {FILTERS.map((f) => {
          const active = filter === f.value
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => choose(f.value)}
              className={cn(
                'px-4 py-2 rounded-full border font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.24em] transition-colors',
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

      {shown.length === 0 ? (
        <PortalEmptyState
          icon={<Calendar size={18} strokeWidth={1.5} />}
          title="No upcoming events here yet."
          description="Check back soon — new dates are added through the year."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {shown.map((event) => {
            const taken = seats[event.id]
            const spotsRemaining =
              event.capacity && typeof taken === 'number'
                ? Math.max(0, event.capacity - taken)
                : null
            const programme = isProgramme(event.programme) ? event.programme : null
            const statusLabel = BOOKING_STATUS_LABELS[event.booking_status] ?? null
            const multiDay = !!event.end_date && ukDay(event.start_date) !== ukDay(event.end_date)

            return (
              <Link
                key={event.id}
                href={`/portal/events/${event.id}`}
                className="group relative block border border-graphite-line/45 bg-graphite/30 overflow-hidden hover:border-bronze/55 transition-all duration-500"
              >
                {/* Cover image */}
                <div className="relative aspect-[16/10] bg-graphite-2 overflow-hidden">
                  {event.cover_image_url ? (
                    <Image
                      src={event.cover_image_url}
                      alt={event.title}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-[family-name:var(--font-display)] text-[44px] text-slate-dim">
                        {event.title.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
                  <div className="film-grain-night pointer-events-none" />

                  {/* Programme badge — bronze hairline pill */}
                  <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                    <PortalBadge variant={programme ? programmeVariant[programme] : 'info'}>
                      {programme ? PROGRAMME_TAG[programme] : typeLabels[event.event_type]}
                    </PortalBadge>
                    {event.visibility === 'members' && (
                      <PortalBadge variant="neutral">
                        <Lock size={9} strokeWidth={1.8} className="inline -mt-0.5 mr-1" />
                        Members only
                      </PortalBadge>
                    )}
                  </div>
                  {statusLabel && (
                    <div className="absolute bottom-4 left-4">
                      <PortalBadge variant={event.booking_status === 'sold_out' ? 'urgent' : 'draft'}>
                        {statusLabel}
                      </PortalBadge>
                    </div>
                  )}

                  {/* Bronze corner brackets */}
                  <span className="absolute top-3 right-3 w-5 h-px bg-bronze/65 pointer-events-none" />
                  <span className="absolute top-3 right-3 w-px h-5 bg-bronze/65 pointer-events-none" />
                </div>

                {/* Content */}
                <div className="p-6 lg:p-7">
                  <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.4vw,1.375rem)] leading-[1.2] text-ivory group-hover:text-bronze-light transition-colors duration-500">
                    {event.title}
                  </h3>

                  {(event.short_description || event.description) && (
                    <p className="mt-3 font-[family-name:var(--font-editorial)] italic text-[13.5px] leading-[1.6] text-ivory-soft/85 line-clamp-2">
                      {event.short_description || event.description}
                    </p>
                  )}

                  <ul className="mt-5 space-y-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.22em] text-slate-haze">
                    <li className="flex items-center gap-2.5">
                      <Calendar size={12} strokeWidth={1.5} className="text-bronze-light/85 shrink-0" />
                      <span>
                        {formatDateRange(event.start_date, event.end_date)}
                        {!multiDay && (
                          <span className="text-slate-dim"> · {formatTimeUk(event.start_date)} UK time</span>
                        )}
                      </span>
                    </li>
                    {event.venue_name && (
                      <li className="flex items-center gap-2.5">
                        <MapPin size={12} strokeWidth={1.5} className="text-bronze-light/85 shrink-0" />
                        <span className="truncate">
                          {event.venue_name}
                          {event.venue_city ? ` · ${event.venue_city}` : ''}
                        </span>
                      </li>
                    )}
                    {spotsRemaining !== null && (
                      <li className="flex items-center gap-2.5">
                        <Users size={12} strokeWidth={1.5} className="text-bronze-light/85 shrink-0" />
                        <span>
                          {spotsRemaining > 0
                            ? `${spotsRemaining} ${spotsRemaining === 1 ? 'seat' : 'seats'} remaining`
                            : 'Fully booked'}
                        </span>
                      </li>
                    )}
                  </ul>

                  {/* Footer: price + arrow */}
                  <div className="mt-6 pt-5 border-t border-graphite-line/45 flex items-center justify-between">
                    <span className="font-[family-name:var(--font-display)] text-[13.5px] text-bronze-light">
                      {eventPriceLine(event)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-ivory-soft group-hover:text-bronze-light transition-colors">
                      Details
                      <ArrowUpRight
                        size={11}
                        strokeWidth={1.5}
                        className="transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
