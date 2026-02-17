import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { useAuth } from '../../providers/AuthProvider'
import { Button } from '../../components/ui/Button'
import { formatDateTime, formatCurrency } from '../../lib/utils'
import { CheckCircle2, Calendar, MapPin, Download, ArrowLeft } from 'lucide-react'
import type { Database } from '../../types/database'

type EventRow = Database['public']['Tables']['events']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']

export function PortalBookingConfirmationPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  const [event, setEvent] = useState<EventRow | null>(null)
  const [booking, setBooking] = useState<BookingRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const pollCount = useRef(0)
  const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const sessionId = searchParams.get('session_id')
  const bookingId = searchParams.get('booking_id')

  useEffect(() => {
    if (eventId && user) fetchData()
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [eventId, user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    // Fetch event
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId!)
      .single()

    if (eventData) setEvent(eventData)

    // Get member id
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('profile_id', user!.id)
      .single()

    if (!member) {
      setLoading(false)
      setNotFound(true)
      return
    }

    // Try to find booking directly
    await findBooking(member.id)
  }

  async function findBooking(memberId: string) {
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('event_id', eventId!)
      .eq('member_id', memberId)
      .in('status', ['confirmed', 'pending'])

    if (bookingId) {
      query = query.eq('id', bookingId)
    }

    const { data } = await query.maybeSingle()

    if (data) {
      setBooking(data)
      setLoading(false)
      return
    }

    // If we have a session_id (came from Stripe redirect), the webhook may not
    // have fired yet. Poll a few times.
    if (sessionId && pollCount.current < 5) {
      pollCount.current += 1
      pollTimer.current = setTimeout(() => findBooking(memberId), 2000)
      return
    }

    // Give up
    setLoading(false)
    if (!data) setNotFound(true)
  }

  function downloadIcs() {
    if (!event) return

    const start = new Date(event.start_date)
    const end = event.end_date ? new Date(event.end_date) : new Date(start.getTime() + 2 * 60 * 60 * 1000)

    const pad = (n: number) => n.toString().padStart(2, '0')
    const formatIcsDate = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

    const location = [event.venue_name, event.venue_address, event.venue_city, event.venue_postcode]
      .filter(Boolean)
      .join(', ')

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//The Club by Sarah Restrick//EN',
      'BEGIN:VEVENT',
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${event.title}`,
      location ? `LOCATION:${location}` : '',
      event.description ? `DESCRIPTION:${event.description.slice(0, 200).replace(/\n/g, '\\n')}` : '',
      `UID:${event.id}@theclub.sarahrestrick.com`,
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n')

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').toLowerCase()}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
        <span className="text-sm text-text-muted">
          {sessionId && pollCount.current > 0
            ? 'Confirming your booking...'
            : 'Loading...'}
        </span>
      </div>
    )
  }

  if (notFound || !event) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <p className="text-text-muted mb-4">
          {sessionId
            ? "We're still processing your payment. Your booking should appear shortly — please refresh in a moment."
            : 'Booking not found.'}
        </p>
        <Link
          to={`/portal/events/${eventId}`}
          className="text-gold hover:underline text-sm"
        >
          Back to event
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto py-4">
      {/* Success icon */}
      <div className="text-center mb-8">
        <CheckCircle2
          size={48}
          strokeWidth={1.5}
          className="text-accent mx-auto mb-4"
        />
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text mb-1">
          Booking Confirmed
        </h1>
        <p className="text-sm text-text-muted">
          You're all set for this event
        </p>
      </div>

      {/* Event summary card */}
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] p-6 mb-6 shadow-[var(--shadow-card)]">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text mb-4">
          {event.title}
        </h2>

        <div className="space-y-2.5 text-sm text-text-muted">
          <div className="flex items-center gap-2">
            <Calendar size={15} strokeWidth={1.5} className="text-text-dim shrink-0" />
            <span>{formatDateTime(event.start_date)}</span>
          </div>

          {event.venue_name && (
            <div className="flex items-center gap-2">
              <MapPin size={15} strokeWidth={1.5} className="text-text-dim shrink-0" />
              <span>
                {event.venue_name}
                {event.venue_city ? ` — ${event.venue_city}` : ''}
              </span>
            </div>
          )}
        </div>

        {booking && (
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
            <span className="text-xs text-text-dim">Amount paid</span>
            <span className="font-[family-name:var(--font-heading)] text-lg font-semibold text-gold">
              {booking.amount_pence === 0
                ? 'Complimentary'
                : formatCurrency(booking.amount_pence)}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <Button
          variant="secondary"
          className="w-full"
          onClick={downloadIcs}
          icon={<Download size={15} />}
        >
          Add to Calendar
        </Button>

        <Link to="/portal/events" className="block">
          <Button variant="ghost" className="w-full" icon={<ArrowLeft size={15} />}>
            Browse More Events
          </Button>
        </Link>
      </div>
    </div>
  )
}
