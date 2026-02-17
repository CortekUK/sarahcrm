import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { useAuth } from '../../providers/AuthProvider'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { formatDate, formatDateTime, formatCurrency } from '../../lib/utils'
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  Ticket,
} from 'lucide-react'
import type { Database, Json } from '../../types/database'

type EventRow = Database['public']['Tables']['events']['Row']
type EventType = Database['public']['Enums']['event_type']
type BookingStatus = Database['public']['Enums']['booking_status']

interface EventWithCount extends EventRow {
  bookings: { count: number }[]
}

interface Speaker {
  name: string
  title?: string
  company?: string
  bio?: string
}

interface AgendaItem {
  time: string
  title: string
  description?: string
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

function parseSpeakers(raw: Json | null): Speaker[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw as unknown as Speaker[]
}

function parseAgenda(raw: Json | null): AgendaItem[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw as unknown as AgendaItem[]
}

export function PortalEventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [event, setEvent] = useState<EventWithCount | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [existingBooking, setExistingBooking] = useState<{
    id: string
    status: BookingStatus
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id && user) fetchData()
  }, [id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true)

    // Fetch event, member, and existing booking in parallel
    const [eventResult, memberResult] = await Promise.all([
      supabase
        .from('events')
        .select(
          '*, bookings(count)'
        )
        .eq('id', id!)
        .single(),
      supabase
        .from('members')
        .select('id')
        .eq('profile_id', user!.id)
        .single(),
    ])

    if (eventResult.error || !eventResult.data) {
      setError('Event not found')
      setLoading(false)
      return
    }

    setEvent(eventResult.data as unknown as EventWithCount)

    if (memberResult.data) {
      setMemberId(memberResult.data.id)

      // Check existing booking
      const { data: bookingData } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('event_id', id!)
        .eq('member_id', memberResult.data.id)
        .in('status', ['confirmed', 'pending'])
        .maybeSingle()

      if (bookingData) {
        setExistingBooking(bookingData)
      }
    }

    setLoading(false)
  }

  async function handleBookPaid() {
    setBooking(true)
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'checkout',
        { body: { event_id: id } }
      )

      if (fnError || !data?.url) {
        setError(fnError?.message || 'Failed to create checkout session')
        setBooking(false)
        return
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url
    } catch {
      setError('Something went wrong. Please try again.')
      setBooking(false)
    }
  }

  async function handleBookComplimentary() {
    if (!memberId) return
    setBooking(true)
    setError(null)

    try {
      const { data: newBooking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          event_id: id!,
          member_id: memberId,
          status: 'confirmed',
          amount_pence: 0,
        })
        .select('id')
        .single()

      if (bookingError) {
        setError(bookingError.message)
        setBooking(false)
        return
      }

      navigate(`/portal/events/${id}/confirmation?booking_id=${newBooking.id}`)
    } catch {
      setError('Something went wrong. Please try again.')
      setBooking(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12">
        <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
        <span className="text-sm text-text-muted">Loading event...</span>
      </div>
    )
  }

  if (error && !event) {
    return (
      <div className="py-12 text-center">
        <p className="text-text-muted mb-4">{error}</p>
        <Link to="/portal/events" className="text-gold hover:underline text-sm">
          Back to events
        </Link>
      </div>
    )
  }

  if (!event) return null

  const bookingCount =
    (event.bookings as unknown as { count: number }[])?.[0]?.count ?? 0
  const spotsRemaining = event.capacity ? event.capacity - bookingCount : null
  const isFullyBooked = spotsRemaining !== null && spotsRemaining <= 0
  const isComplimentary = event.member_price_pence === 0
  const speakers = parseSpeakers(event.speakers)
  const agenda = parseAgenda(event.agenda)

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        to="/portal/events"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-gold transition-colors mb-6"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back to events
      </Link>

      {/* Cover image */}
      <div className="aspect-[21/9] bg-surface-2 rounded-[var(--radius-lg)] overflow-hidden mb-8">
        {event.cover_image_url ? (
          <img
            src={event.cover_image_url}
            alt={event.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-2 to-surface-3">
            <span className="font-[family-name:var(--font-heading)] text-3xl text-text-dim/30">
              The Club
            </span>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8">
        <div className="flex-1">
          <div className="mb-3">
            <Badge variant={typeVariant[event.event_type]}>
              {typeLabels[event.event_type]}
            </Badge>
          </div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text mb-4">
            {event.title}
          </h1>

          <div className="space-y-2 text-sm text-text-muted">
            <div className="flex items-center gap-2">
              <Calendar size={15} strokeWidth={1.5} className="text-text-dim shrink-0" />
              <span>{formatDate(event.start_date)}</span>
              {event.end_date && (
                <span className="text-text-dim">
                  — {formatDate(event.end_date)}
                </span>
              )}
            </div>

            {event.doors_open && (
              <div className="flex items-center gap-2">
                <Clock size={15} strokeWidth={1.5} className="text-text-dim shrink-0" />
                <span>Doors open {formatDateTime(event.doors_open).split(', ')[1]}</span>
              </div>
            )}

            {event.venue_name && (
              <div className="flex items-center gap-2">
                <MapPin size={15} strokeWidth={1.5} className="text-text-dim shrink-0" />
                <span>
                  {event.venue_name}
                  {event.venue_city ? ` — ${event.venue_city}` : ''}
                </span>
              </div>
            )}

            {spotsRemaining !== null && (
              <div className="flex items-center gap-2">
                <Users size={15} strokeWidth={1.5} className="text-text-dim shrink-0" />
                <span>
                  {spotsRemaining > 0
                    ? `${spotsRemaining} spot${spotsRemaining !== 1 ? 's' : ''} remaining`
                    : 'Fully booked'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Booking card */}
        <div className="bg-surface border border-border rounded-[var(--radius-lg)] p-6 md:w-72 shadow-[var(--shadow-card)]">
          <div className="text-center mb-4">
            <span className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-gold">
              {isComplimentary
                ? 'Complimentary'
                : formatCurrency(event.member_price_pence)}
            </span>
            {!isComplimentary && (
              <p className="text-xs text-text-dim mt-0.5">per member</p>
            )}
          </div>

          {existingBooking ? (
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 mb-2">
                <Ticket size={15} className="text-accent" />
                <span className="text-sm font-medium text-accent capitalize">
                  {existingBooking.status}
                </span>
              </div>
              <p className="text-xs text-text-dim">
                You already have a booking for this event
              </p>
              <Link
                to={`/portal/events/${id}/confirmation?booking_id=${existingBooking.id}`}
                className="text-xs text-gold hover:underline mt-2 inline-block"
              >
                View confirmation
              </Link>
            </div>
          ) : isFullyBooked ? (
            <Button disabled className="w-full">
              Fully Booked
            </Button>
          ) : (
            <>
              <Button
                className="w-full"
                loading={booking}
                onClick={
                  isComplimentary ? handleBookComplimentary : handleBookPaid
                }
              >
                {isComplimentary ? 'Book Now' : `Book — ${formatCurrency(event.member_price_pence)}`}
              </Button>
              {error && (
                <p className="text-xs text-accent-warm mt-2 text-center">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {event.description && (
        <section className="mb-8">
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text mb-3">
            About This Event
          </h2>
          <div className="prose prose-sm text-text-muted max-w-none whitespace-pre-line">
            {event.description}
          </div>
        </section>
      )}

      {/* Speakers */}
      {speakers.length > 0 && (
        <section className="mb-8">
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text mb-4">
            Speakers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {speakers.map((speaker, i) => (
              <div
                key={i}
                className="bg-surface border border-border rounded-[var(--radius-lg)] p-4"
              >
                <p className="font-medium text-text">{speaker.name}</p>
                {(speaker.title || speaker.company) && (
                  <p className="text-xs text-text-muted mt-0.5">
                    {[speaker.title, speaker.company]
                      .filter(Boolean)
                      .join(' — ')}
                  </p>
                )}
                {speaker.bio && (
                  <p className="text-sm text-text-muted mt-2">{speaker.bio}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Agenda */}
      {agenda.length > 0 && (
        <section className="mb-8">
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text mb-4">
            Agenda
          </h2>
          <div className="space-y-3">
            {agenda.map((item, i) => (
              <div
                key={i}
                className="flex gap-4 bg-surface border border-border rounded-[var(--radius-lg)] p-4"
              >
                <span className="font-[family-name:var(--font-mono)] text-xs text-gold shrink-0 pt-0.5">
                  {item.time}
                </span>
                <div>
                  <p className="font-medium text-text text-sm">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-text-muted mt-1">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Venue details */}
      {event.venue_address && (
        <section className="mb-8">
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text mb-3">
            Venue
          </h2>
          <div className="bg-surface border border-border rounded-[var(--radius-lg)] p-4 text-sm text-text-muted space-y-1">
            <p className="font-medium text-text">{event.venue_name}</p>
            <p>{event.venue_address}</p>
            {event.venue_city && (
              <p>
                {event.venue_city}
                {event.venue_postcode ? ` ${event.venue_postcode}` : ''}
              </p>
            )}
            {event.venue_url && (
              <a
                href={event.venue_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold hover:underline inline-block mt-1"
              >
                View venue website
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
