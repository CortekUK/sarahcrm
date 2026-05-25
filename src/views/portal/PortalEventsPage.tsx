'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ArrowUpRight, Calendar, MapPin, Users } from 'lucide-react'
import {
  PortalBadge,
  PortalEmptyState,
  PortalLoading,
  PortalPageHeader,
  type PortalBadgeVariant,
} from '@/components/portal/PortalChrome'
import type { Database } from '@/types/database'

type EventType = Database['public']['Enums']['event_type']

interface PublicEvent {
  id: string
  title: string
  slug: string
  description: string | null
  event_type: EventType
  start_date: string
  venue_name: string | null
  venue_city: string | null
  member_price_pence: number
  capacity: number | null
  cover_image_url: string | null
  bookings: { count: number }[]
}

const typeLabels: Record<EventType, string> = {
  member_event: 'Member Event',
  curated_luxury: 'Curated Luxury',
  retreat: 'Retreat',
}

const typeVariant: Record<EventType, PortalBadgeVariant> = {
  member_event: 'info',
  curated_luxury: 'upcoming',
  retreat: 'active',
}

export function PortalEventsPage() {
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    const { data } = await supabase
      .from('events')
      .select(
        'id, title, slug, description, event_type, start_date, venue_name, venue_city, member_price_pence, capacity, cover_image_url, bookings(count)',
      )
      .in('status', ['published', 'live'])
      .gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true })

    if (data) setEvents(data as unknown as PublicEvent[])
    setLoading(false)
  }

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
        title="Upcoming evenings."
        subtitle="Members-only events across Manchester, Leeds and London. Reserve your seat below."
      />

      {events.length === 0 ? (
        <PortalEmptyState
          icon={<Calendar size={18} strokeWidth={1.5} />}
          title="No upcoming evenings."
          description="Check back soon — the team is curating the next round."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {events.map((event) => {
            const bookingCount = event.bookings?.[0]?.count ?? 0
            const spotsRemaining = event.capacity ? event.capacity - bookingCount : null
            const isComplimentary = event.member_price_pence === 0

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

                  {/* Type badge — bronze hairline pill */}
                  <div className="absolute top-4 left-4">
                    <PortalBadge variant={typeVariant[event.event_type]}>
                      {typeLabels[event.event_type]}
                    </PortalBadge>
                  </div>

                  {/* Bronze corner brackets */}
                  <span className="absolute top-3 right-3 w-5 h-px bg-bronze/65 pointer-events-none" />
                  <span className="absolute top-3 right-3 w-px h-5 bg-bronze/65 pointer-events-none" />
                </div>

                {/* Content */}
                <div className="p-6 lg:p-7">
                  <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.4vw,1.375rem)] leading-[1.2] text-ivory group-hover:text-bronze-light transition-colors duration-500">
                    {event.title}
                  </h3>

                  {event.description && (
                    <p className="mt-3 font-[family-name:var(--font-editorial)] italic text-[13.5px] leading-[1.6] text-ivory-soft/85 line-clamp-2">
                      {event.description}
                    </p>
                  )}

                  <ul className="mt-5 space-y-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.22em] text-slate-haze">
                    <li className="flex items-center gap-2.5">
                      <Calendar size={12} strokeWidth={1.5} className="text-bronze-light/85 shrink-0" />
                      <span>{formatDate(event.start_date)}</span>
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
                    <span className="font-[family-name:var(--font-display)] text-[15.5px] text-bronze-light tabular-nums">
                      {isComplimentary
                        ? 'Complimentary'
                        : formatCurrency(event.member_price_pence)}
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
