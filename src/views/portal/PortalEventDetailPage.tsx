'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Ticket,
  Users,
} from 'lucide-react'
import {
  PortalBadge,
  PortalButton,
  PortalCard,
  PortalLoading,
  PortalSectionTitle,
  type PortalBadgeVariant,
} from '@/components/portal/PortalChrome'
import type { Database, Json } from '@/types/database'

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

const typeVariant: Record<EventType, PortalBadgeVariant> = {
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
  const router = useRouter()
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
  // Optional add-ons that ride on the member's booking.
  const [bringGuest, setBringGuest] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [addAccommodation, setAddAccommodation] = useState(false)

  useEffect(() => {
    if (id && user) fetchData()
  }, [id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true)
    const [eventResult, memberResult] = await Promise.all([
      supabase.from('events').select('*, bookings(count)').eq('id', id!).single(),
      supabase.from('members').select('id').eq('profile_id', user!.id).single(),
    ])

    if (eventResult.error || !eventResult.data) {
      setError('Event not found')
      setLoading(false)
      return
    }
    setEvent(eventResult.data as unknown as EventWithCount)

    if (memberResult.data) {
      setMemberId(memberResult.data.id)
      const { data: bookingData } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('event_id', id!)
        .eq('member_id', memberResult.data.id)
        .in('status', ['confirmed', 'pending'])
        .maybeSingle()
      if (bookingData) setExistingBooking(bookingData)
    }
    setLoading(false)
  }

  async function handleBookPaid() {
    setBooking(true)
    setError(null)
    try {
      // Member booking goes through /api/events/book, which charges the
      // card on file (auto-confirm) or holds a pending request (manual
      // approval) — only falling back to Stripe Checkout when there's no
      // usable saved card.
      const res = await fetch('/api/events/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: id,
          bring_guest: bringGuest,
          guest_name: bringGuest ? guestName.trim() : '',
          add_accommodation: addAccommodation,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        url?: string
        ok?: boolean
        booking_id?: string
        error?: string
      }
      if (!res.ok) {
        setError(json.error || 'Could not complete your booking.')
        setBooking(false)
        return
      }
      if (json.url) {
        // Fallback: collect a card via Stripe.
        window.location.href = json.url
        return
      }
      // Charged on file or held as pending — straight to confirmation.
      router.push(`/portal/events/${id}/confirmation?booking_id=${json.booking_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
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
      router.push(`/portal/events/${id}/confirmation?booking_id=${newBooking.id}`)
    } catch {
      setError('Something went wrong. Please try again.')
      setBooking(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
        <PortalLoading label="Loading event" />
      </div>
    )
  }

  if (error && !event) {
    return (
      <div className="max-w-[800px] mx-auto px-6 lg:px-10 py-16 text-center">
        <p className="font-[family-name:var(--font-editorial)] italic text-[15px] text-ivory-soft mb-5">
          {error}
        </p>
        <Link
          href="/portal/events"
          className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-bronze-light hover:text-ivory transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={1.5} />
          Back to events
        </Link>
      </div>
    )
  }

  if (!event) return null

  const bookingCount = (event.bookings as unknown as { count: number }[])?.[0]?.count ?? 0
  const spotsRemaining = event.capacity ? event.capacity - bookingCount : null
  const isFullyBooked = spotsRemaining !== null && spotsRemaining <= 0
  const isComplimentary = event.member_price_pence === 0
  const speakers = parseSpeakers(event.speakers)
  const agenda = parseAgenda(event.agenda)

  // Optional add-ons available on this event.
  const guestPrice = event.guest_price_pence ?? 0
  const accommodationPrice = event.accommodation_price_pence ?? 0
  const guestAvailable = guestPrice > 0
  const accommodationAvailable = event.accommodation_available === true && accommodationPrice > 0
  const hasAddOns = guestAvailable || accommodationAvailable
  // Running total = member ticket + any selected add-ons.
  const bookingTotal =
    event.member_price_pence +
    (bringGuest && guestAvailable ? guestPrice : 0) +
    (addAccommodation && accommodationAvailable ? accommodationPrice : 0)
  // Route through paid checkout whenever there's anything to charge — even
  // a complimentary member ticket becomes a paid booking once a priced
  // guest or accommodation add-on is selected.
  const useComplimentaryPath = bookingTotal === 0

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
      <Link
        href="/portal/events"
        className="inline-flex items-center gap-2 mb-8 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-ivory-soft hover:text-bronze-light transition-colors"
      >
        <ArrowLeft size={12} strokeWidth={1.5} />
        Back to events
      </Link>

      {/* Cover image */}
      <div className="relative aspect-[21/9] bg-graphite-2 overflow-hidden mb-10 border border-graphite-line/45">
        {event.cover_image_url ? (
          <Image
            src={event.cover_image_url}
            alt={event.title}
            fill
            sizes="(min-width: 1024px) 80vw, 100vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-[family-name:var(--font-display)] text-[72px] text-slate-dim">
              {event.title.charAt(0)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/15 to-transparent" />
        <div className="film-grain-night pointer-events-none" />
        <span className="absolute top-5 left-5 w-6 h-px bg-bronze/75 pointer-events-none" />
        <span className="absolute top-5 left-5 w-px h-6 bg-bronze/75 pointer-events-none" />
        <span className="absolute bottom-5 right-5 w-6 h-px bg-bronze/75 pointer-events-none" />
        <span className="absolute bottom-5 right-5 w-px h-6 bg-bronze/75 pointer-events-none" />
      </div>

      {/* Title + booking side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mb-12">
        <div className="lg:col-span-8">
          <div className="mb-5">
            <PortalBadge variant={typeVariant[event.event_type]}>
              {typeLabels[event.event_type]}
            </PortalBadge>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.5vw,3.25rem)] leading-[1.1] tracking-[-0.01em] text-ivory">
            {event.title}
          </h1>

          <ul className="mt-7 space-y-2.5 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.22em] text-ivory-soft">
            <li className="flex items-center gap-2.5">
              <Calendar size={13} strokeWidth={1.5} className="text-bronze-light/85 shrink-0" />
              <span>{formatDate(event.start_date)}</span>
              {event.end_date && (
                <span className="text-slate-haze">— {formatDate(event.end_date)}</span>
              )}
            </li>
            {event.doors_open && (
              <li className="flex items-center gap-2.5">
                <Clock size={13} strokeWidth={1.5} className="text-bronze-light/85 shrink-0" />
                <span>Doors open {formatDateTime(event.doors_open).split(', ')[1]}</span>
              </li>
            )}
            {event.venue_name && (
              <li className="flex items-center gap-2.5">
                <MapPin size={13} strokeWidth={1.5} className="text-bronze-light/85 shrink-0" />
                <span>
                  {event.venue_name}
                  {event.venue_city ? ` · ${event.venue_city}` : ''}
                </span>
              </li>
            )}
            {spotsRemaining !== null && (
              <li className="flex items-center gap-2.5">
                <Users size={13} strokeWidth={1.5} className="text-bronze-light/85 shrink-0" />
                <span>
                  {spotsRemaining > 0
                    ? `${spotsRemaining} ${spotsRemaining === 1 ? 'seat' : 'seats'} remaining`
                    : 'Fully booked'}
                </span>
              </li>
            )}
          </ul>
        </div>

        {/* Booking card */}
        <div className="lg:col-span-4">
          <PortalCard className="p-7">
            <div className="text-center mb-6 pb-6 border-b border-graphite-line/45">
              <p className="font-[family-name:var(--font-display)] text-[clamp(1.75rem,2.5vw,2.25rem)] text-bronze-light leading-none tabular-nums">
                {isComplimentary ? 'Complimentary' : formatCurrency(event.member_price_pence)}
              </p>
              {!isComplimentary && (
                <p className="mt-2 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.28em] text-slate-haze">
                  Per member
                </p>
              )}
            </div>

            {existingBooking ? (
              <div className="text-center">
                <div className="inline-flex items-center gap-2 mb-3">
                  <Ticket size={14} strokeWidth={1.5} className="text-emerald-300" />
                  <span className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-emerald-300 capitalize">
                    {existingBooking.status}
                  </span>
                </div>
                <p className="font-[family-name:var(--font-editorial)] italic text-[13px] text-ivory-soft/85">
                  You already have a booking for this evening.
                </p>
                <Link
                  href={`/portal/events/${id}/confirmation?booking_id=${existingBooking.id}`}
                  className="mt-4 inline-flex items-center gap-1.5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-bronze-light hover:text-ivory transition-colors"
                >
                  View confirmation
                </Link>
              </div>
            ) : !memberId ? (
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-4 rounded-full border border-bronze/45 bg-bronze/10 flex items-center justify-center text-bronze-light">
                  <AlertCircle size={16} strokeWidth={1.5} />
                </div>
                <p className="font-[family-name:var(--font-display)] text-[14.5px] text-ivory leading-tight mb-2">
                  Bookings require a member account.
                </p>
                <p className="font-[family-name:var(--font-editorial)] italic text-[12.5px] text-ivory-soft/85 leading-[1.7]">
                  You&apos;re signed in as an admin / non-member. Switch to a member account or
                  have an admin add you via Members → Add Member.
                </p>
                <Link
                  href="/dashboard/members"
                  className="mt-4 inline-flex items-center gap-1.5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-bronze-light hover:text-ivory transition-colors"
                >
                  Open admin members
                </Link>
              </div>
            ) : isFullyBooked ? (
              <PortalButton disabled className="w-full justify-center">
                Fully booked
              </PortalButton>
            ) : (
              <>
                {/* Add-ons */}
                {hasAddOns && (
                  <div className="mb-5 space-y-3">
                    {guestAvailable && (
                      <div className="border border-graphite-line/45 rounded-sm p-3.5">
                        <label className="flex items-center justify-between gap-3 cursor-pointer">
                          <span className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={bringGuest}
                              onChange={(e) => setBringGuest(e.target.checked)}
                              className="h-4 w-4 accent-bronze"
                            />
                            <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.22em] text-ivory">
                              Bring a guest
                            </span>
                          </span>
                          <span className="font-[family-name:var(--font-display)] text-[14px] text-bronze-light tabular-nums">
                            +{formatCurrency(guestPrice)}
                          </span>
                        </label>
                        {bringGuest && (
                          <input
                            type="text"
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            placeholder="Guest's full name"
                            className="mt-3 w-full bg-graphite/40 border border-graphite-line/45 rounded-sm px-3 py-2 text-[13px] text-ivory placeholder:text-slate-haze focus:outline-none focus:border-bronze/55"
                          />
                        )}
                      </div>
                    )}
                    {accommodationAvailable && (
                      <div className="border border-graphite-line/45 rounded-sm p-3.5">
                        <label className="flex items-center justify-between gap-3 cursor-pointer">
                          <span className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={addAccommodation}
                              onChange={(e) => setAddAccommodation(e.target.checked)}
                              className="h-4 w-4 accent-bronze"
                            />
                            <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.22em] text-ivory">
                              Add accommodation
                            </span>
                          </span>
                          <span className="font-[family-name:var(--font-display)] text-[14px] text-bronze-light tabular-nums">
                            +{formatCurrency(accommodationPrice)}
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
                <PortalButton
                  className="w-full justify-center"
                  loading={booking}
                  disabled={bringGuest && guestAvailable && !guestName.trim()}
                  onClick={useComplimentaryPath ? handleBookComplimentary : handleBookPaid}
                >
                  {useComplimentaryPath
                    ? 'Reserve seat'
                    : `Book · ${formatCurrency(bookingTotal)}`}
                </PortalButton>
                {bringGuest && guestAvailable && !guestName.trim() && (
                  <p className="mt-2 text-center font-[family-name:var(--font-editorial)] italic text-[12px] text-slate-haze">
                    Add your guest&apos;s name to continue.
                  </p>
                )}
                {error && (
                  <div className="mt-4 px-3 py-3 border-l-2 border-rose-500/60 bg-rose-900/15">
                    <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.28em] text-rose-300 mb-1.5">
                      Couldn&apos;t start checkout
                    </p>
                    <p className="font-[family-name:var(--font-editorial)] italic text-[12.5px] text-rose-200 leading-[1.65]">
                      {error}
                    </p>
                  </div>
                )}
              </>
            )}
          </PortalCard>
        </div>
      </div>

      {/* Description */}
      {event.description && (
        <section className="mb-12">
          <PortalSectionTitle eyebrow="The Evening">About this event.</PortalSectionTitle>
          <div className="font-[family-name:var(--font-editorial)] text-[15.5px] leading-[1.85] text-ivory-soft whitespace-pre-line max-w-prose">
            {event.description}
          </div>
        </section>
      )}

      {/* Speakers */}
      {speakers.length > 0 && (
        <section className="mb-12">
          <PortalSectionTitle eyebrow="In the Room">Speakers.</PortalSectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {speakers.map((speaker, i) => (
              <PortalCard key={i} className="p-6">
                <p className="font-[family-name:var(--font-display)] text-[16px] text-ivory leading-tight">
                  {speaker.name}
                </p>
                {(speaker.title || speaker.company) && (
                  <p className="mt-1.5 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.22em] text-bronze-light/85">
                    {[speaker.title, speaker.company].filter(Boolean).join(' · ')}
                  </p>
                )}
                {speaker.bio && (
                  <p className="mt-4 font-[family-name:var(--font-editorial)] italic text-[13.5px] leading-[1.7] text-ivory-soft/90">
                    {speaker.bio}
                  </p>
                )}
              </PortalCard>
            ))}
          </div>
        </section>
      )}

      {/* Agenda */}
      {agenda.length > 0 && (
        <section className="mb-12">
          <PortalSectionTitle eyebrow="The Order">Agenda.</PortalSectionTitle>
          <ol className="space-y-3">
            {agenda.map((item, i) => (
              <li
                key={i}
                className="flex gap-5 p-5 border border-graphite-line/45 bg-graphite/30"
              >
                <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.22em] text-bronze-light tabular-nums shrink-0 pt-0.5 min-w-[80px]">
                  {item.time}
                </span>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-[15px] text-ivory leading-tight">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="mt-2 font-[family-name:var(--font-editorial)] italic text-[13px] leading-[1.7] text-ivory-soft/85">
                      {item.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Venue */}
      {event.venue_address && (
        <section className="mb-4">
          <PortalSectionTitle eyebrow="The Address">Venue.</PortalSectionTitle>
          <PortalCard className="p-6 lg:p-7 max-w-md">
            <p className="font-[family-name:var(--font-display)] text-[16px] text-ivory leading-tight">
              {event.venue_name}
            </p>
            <address className="not-italic mt-3 font-[family-name:var(--font-editorial)] text-[14px] leading-[1.75] text-ivory-soft/90 space-y-0.5">
              <p>{event.venue_address}</p>
              {event.venue_city && (
                <p>
                  {event.venue_city}
                  {event.venue_postcode ? ` · ${event.venue_postcode}` : ''}
                </p>
              )}
            </address>
            {event.venue_url && (
              <a
                href={event.venue_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-bronze-light hover:text-ivory transition-colors"
              >
                Venue website →
              </a>
            )}
          </PortalCard>
        </section>
      )}
    </div>
  )
}
