'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { ArrowLeft, Calendar, CheckCircle2, Download, MapPin } from 'lucide-react'
import {
  PortalButton,
  PortalCard,
  PortalLoading,
} from '@/components/portal/PortalChrome'
import type { Database } from '@/types/database'

type EventRow = Database['public']['Tables']['events']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']

export function PortalBookingConfirmationPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  const [event, setEvent] = useState<EventRow | null>(null)
  const [booking, setBooking] = useState<BookingRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
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

  // Generate a check-in QR once the booking is confirmed. The QR encodes the
  // admin check-in URL (/checkin/<bookingId>) that the team scans at the door.
  useEffect(() => {
    if (!booking || booking.status !== 'confirmed') {
      setQrDataUrl(null)
      return
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const target = `${appUrl}/checkin/${booking.id}`
    let cancelled = false
    import('qrcode')
      .then((QRCode) =>
        QRCode.toDataURL(target, {
          width: 320,
          margin: 1,
          color: { dark: '#2C2825', light: '#FFFFFF' },
        }),
      )
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        /* QR is a nicety — never block the confirmation on it. */
      })
    return () => {
      cancelled = true
    }
  }, [booking])

  async function fetchData() {
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId!)
      .single()
    if (eventData) setEvent(eventData)

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
    // If we returned from a Stripe Checkout fallback (no saved card), finalise
    // the booking here — charge mode → confirmed, setup mode → card held +
    // pending — without depending on the webhook.
    if (sessionId) {
      try {
        await fetch('/api/events/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
      } catch {
        /* webhook is the backstop */
      }
    }
    await findBooking(member.id)
  }

  async function findBooking(memberId: string) {
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('event_id', eventId!)
      .eq('member_id', memberId)
      .in('status', ['confirmed', 'pending'])

    if (bookingId) query = query.eq('id', bookingId)

    const { data } = await query.maybeSingle()
    if (data) {
      setBooking(data)
      setLoading(false)
      return
    }

    // Stripe webhook may not have fired yet — poll a few times
    if (sessionId && pollCount.current < 5) {
      pollCount.current += 1
      pollTimer.current = setTimeout(() => findBooking(memberId), 2000)
      return
    }
    setLoading(false)
    if (!data) setNotFound(true)
  }

  function downloadIcs() {
    if (!event) return
    const start = new Date(event.start_date)
    const end = event.end_date
      ? new Date(event.end_date)
      : new Date(start.getTime() + 2 * 60 * 60 * 1000)
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
      event.description
        ? `DESCRIPTION:${event.description.slice(0, 200).replace(/\n/g, '\\n')}`
        : '',
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
    a.download = `${event.title
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="max-w-[700px] mx-auto px-6 lg:px-10 py-16">
        <PortalLoading
          label={sessionId && pollCount.current > 0 ? 'Confirming your booking' : 'Loading'}
        />
      </div>
    )
  }

  if (notFound || !event) {
    return (
      <div className="max-w-[700px] mx-auto px-6 lg:px-10 py-16 text-center">
        <p className="font-[family-name:var(--font-editorial)] italic text-[15px] text-ivory-soft/90 mb-6 leading-[1.75]">
          {sessionId
            ? "We're still processing your payment. Your booking should appear shortly — please refresh in a moment."
            : 'Booking not found.'}
        </p>
        <Link
          href={`/portal/events/${eventId}`}
          className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-bronze-light hover:text-ivory transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={1.5} />
          Back to event
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-[700px] mx-auto px-6 lg:px-10 py-16">
      {/* Success mark — bronze ring with checkmark */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 mx-auto rounded-full border border-bronze/55 bg-bronze/10 flex items-center justify-center text-bronze-light mb-7">
          <CheckCircle2 size={28} strokeWidth={1.5} />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
          {booking?.status === 'pending' ? 'Booking received' : 'Reserved with thanks'}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(1.875rem,3vw,2.5rem)] leading-[1.1] text-ivory">
          {booking?.status === 'pending' ? 'Your request is in.' : 'Your seat is held.'}
        </h1>
        <p className="mt-5 font-[family-name:var(--font-editorial)] italic text-[15.5px] text-ivory-soft/90 leading-[1.7] max-w-md mx-auto">
          {booking?.status === 'pending'
            ? 'Your card is securely held — nothing has been charged. We’ll confirm your place once the team approves it, and only then take payment. If it isn’t approved, no payment is taken.'
            : 'We’ll be in touch in the days leading up to the evening with the practicalities.'}
        </p>
      </div>

      {/* Event summary */}
      <PortalCard className="p-6 lg:p-8 mb-6">
        <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.25rem,1.7vw,1.5rem)] text-ivory leading-tight mb-5">
          {event.title}
        </h2>

        <ul className="space-y-3 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.22em] text-ivory-soft">
          <li className="flex items-center gap-2.5">
            <Calendar size={13} strokeWidth={1.5} className="text-bronze-light/85 shrink-0" />
            <span>{formatDateTime(event.start_date)}</span>
          </li>
          {event.venue_name && (
            <li className="flex items-center gap-2.5">
              <MapPin size={13} strokeWidth={1.5} className="text-bronze-light/85 shrink-0" />
              <span>
                {event.venue_name}
                {event.venue_city ? ` · ${event.venue_city}` : ''}
              </span>
            </li>
          )}
        </ul>

        {booking && (
          <div className="mt-6 pt-5 border-t border-graphite-line/45 flex items-baseline justify-between gap-4">
            <span className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-slate-haze">
              {booking.status === 'pending' ? 'Amount (held)' : 'Amount paid'}
            </span>
            <span className="font-[family-name:var(--font-display)] text-[18px] text-bronze-light tabular-nums">
              {booking.amount_pence === 0 ? 'Complimentary' : formatCurrency(booking.amount_pence)}
            </span>
          </div>
        )}
      </PortalCard>

      {/* Check-in QR — shown to the team at the door to mark you attended */}
      {qrDataUrl && (
        <PortalCard className="p-6 lg:p-8 mb-6 text-center">
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
            Your check-in pass
          </p>
          <div className="inline-block rounded-[var(--radius-md)] bg-white p-4 border border-graphite-line/45">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Event check-in QR code" width={180} height={180} className="w-[180px] h-[180px]" />
          </div>
          <p className="mt-5 font-[family-name:var(--font-editorial)] italic text-[14px] text-ivory-soft/85 leading-[1.7] max-w-sm mx-auto">
            Present this on arrival — the team will scan it to welcome you in.
          </p>
        </PortalCard>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <PortalButton
          variant="secondary"
          className="w-full justify-center"
          icon={<Download size={13} strokeWidth={1.5} />}
          onClick={downloadIcs}
        >
          Add to calendar
        </PortalButton>

        <Link href="/portal/events" className="block">
          <PortalButton
            variant="ghost"
            className="w-full justify-center"
            icon={<ArrowLeft size={13} strokeWidth={1.5} />}
          >
            Browse more events
          </PortalButton>
        </Link>
      </div>
    </div>
  )
}
