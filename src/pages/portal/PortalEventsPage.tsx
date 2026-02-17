import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { Badge } from '../../components/ui/Badge'
import { formatDate, formatCurrency } from '../../lib/utils'
import { MapPin, Calendar, Users } from 'lucide-react'
import type { Database } from '../../types/database'

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

const typeVariant: Record<EventType, 'info' | 'upcoming' | 'active'> = {
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
      .select('id, title, slug, description, event_type, start_date, venue_name, venue_city, member_price_pence, capacity, cover_image_url, bookings(count)')
      .in('status', ['published', 'live'])
      .gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true })

    if (data) setEvents(data as unknown as PublicEvent[])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12">
        <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
        <span className="text-sm text-text-muted">Loading events...</span>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          Upcoming Events
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Browse and book events at The Club
        </p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-text-dim mb-1">No upcoming events at the moment</p>
          <p className="text-xs text-text-dim">Check back soon for new events</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => {
            const bookingCount = event.bookings?.[0]?.count ?? 0
            const spotsRemaining = event.capacity ? event.capacity - bookingCount : null

            return (
              <Link
                key={event.id}
                to={`/portal/events/${event.id}`}
                className="group block bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow"
              >
                {/* Cover image */}
                <div className="aspect-[16/9] bg-surface-2 relative overflow-hidden">
                  {event.cover_image_url ? (
                    <img
                      src={event.cover_image_url}
                      alt={event.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-2 to-surface-3">
                      <span className="font-[family-name:var(--font-heading)] text-2xl text-text-dim/30">
                        The Club
                      </span>
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <Badge variant={typeVariant[event.event_type]}>
                      {typeLabels[event.event_type]}
                    </Badge>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <h3 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text mb-2 group-hover:text-gold transition-colors">
                    {event.title}
                  </h3>

                  {event.description && (
                    <p className="text-sm text-text-muted line-clamp-2 mb-4">
                      {event.description}
                    </p>
                  )}

                  <div className="space-y-2 text-sm text-text-muted">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} strokeWidth={1.5} className="text-text-dim shrink-0" />
                      <span>{formatDate(event.start_date)}</span>
                    </div>
                    {event.venue_name && (
                      <div className="flex items-center gap-2">
                        <MapPin size={14} strokeWidth={1.5} className="text-text-dim shrink-0" />
                        <span>
                          {event.venue_name}
                          {event.venue_city ? ` — ${event.venue_city}` : ''}
                        </span>
                      </div>
                    )}
                    {spotsRemaining !== null && (
                      <div className="flex items-center gap-2">
                        <Users size={14} strokeWidth={1.5} className="text-text-dim shrink-0" />
                        <span>
                          {spotsRemaining > 0
                            ? `${spotsRemaining} spot${spotsRemaining !== 1 ? 's' : ''} remaining`
                            : 'Fully booked'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <span className="font-[family-name:var(--font-heading)] text-lg font-semibold text-gold">
                      {event.member_price_pence === 0
                        ? 'Included with membership'
                        : formatCurrency(event.member_price_pence)}
                    </span>
                    <span className="text-xs font-medium text-gold group-hover:underline">
                      View Details &rarr;
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
