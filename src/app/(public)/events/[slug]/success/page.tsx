'use client'

import { Suspense, use, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check, ArrowUpRight, Download, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

// Minimal slice of the event we need to build the calendar invite.
interface IcsEvent {
  id: string
  title: string
  start_date: string
  end_date: string | null
  description: string | null
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_postcode: string | null
}

// Build + download an .ics for the booked event — mirrors the portal
// confirmation page. Uses the event's end_date when present, falling back
// to +2h only when it's null.
function downloadIcs(event: IcsEvent) {
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

// Post-Stripe landing for event bookings. Stripe redirects here with
// ?session_id=cs_… in the URL. We fire-and-forget POST to
// /api/events/sync so the booking flips to 'confirmed' + a payment
// row is inserted, without depending on the Stripe webhook (which
// doesn't fire in localhost without a tunnel).

// Next 15 requires components calling `useSearchParams` to sit inside a
// <Suspense> boundary, otherwise the route bails the static prerender
// and the build fails.
export default function EventBookingSuccessPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  return (
    <Suspense fallback={null}>
      <SuccessInner slug={slug} />
    </Suspense>
  )
}

function SuccessInner({ slug }: { slug: string }) {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'failed'>(
    'idle',
  )
  // True when the event isn't auto-confirm: the card was HELD, not charged,
  // and the booking awaits admin approval.
  const [held, setHeld] = useState(false)
  // The booked event — fetched by slug so we can offer an .ics invite.
  const [event, setEvent] = useState<IcsEvent | null>(null)

  useEffect(() => {
    supabase
      .from('events')
      .select('id, title, start_date, end_date, description, venue_name, venue_address, venue_city, venue_postcode')
      .eq('slug', slug)
      .in('status', ['published', 'live', 'completed'])
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEvent(data as IcsEvent)
      })
  }, [slug])

  useEffect(() => {
    if (!sessionId) return
    setSyncState('syncing')
    fetch('/api/events/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (res.ok && json.ok) {
          setHeld(json.held === true)
          setSyncState('done')
        } else {
          console.warn('[event-success] sync did not complete', json)
          setSyncState('failed')
        }
      })
      .catch((err) => {
        console.warn('[event-success] sync request failed', err)
        setSyncState('failed')
      })
  }, [sessionId])

  return (
    <section className="relative min-h-[80vh] bg-ink flex items-center justify-center px-6 py-24">
      <div className="max-w-xl w-full text-center border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 lg:p-16 day:bg-white day:shadow-lg day:border-bronze/30">
        <div className="w-16 h-16 mx-auto rounded-full bg-bronze/15 border border-bronze/40 day:bg-bronze/20 day:border-bronze/55 flex items-center justify-center mb-7">
          <Check size={28} strokeWidth={1.5} className="text-bronze-light day:text-bronze-dark" />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
          {held ? 'Booking received' : 'Booking confirmed'}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
          {held ? 'Your request is in.' : 'A seat is yours.'}
        </h1>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7]">
          {held
            ? 'Your card is securely held — nothing has been charged. The team will review your booking and, once approved, confirm your place and take payment then. If it isn’t approved, no payment is taken.'
            : 'Your payment is secured and the booking is with the team. A confirmation note will land in your inbox within the next few minutes.'}
        </p>

        {syncState === 'syncing' && (
          <p className="mt-5 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-slate-haze">
            <Loader2 size={11} className="animate-spin" />
            Recording payment…
          </p>
        )}

        {event && (
          <button
            type="button"
            onClick={() => downloadIcs(event)}
            className="mt-9 inline-flex items-center gap-2 px-6 py-3 border border-bronze/40 rounded-full font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ink hover:bg-bronze hover:border-bronze transition-colors duration-300"
          >
            <Download size={13} strokeWidth={1.5} />
            Add to calendar
          </button>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
          <Link
            href={`/events/${slug}`}
            className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
          >
            Back to the evening
            <ArrowUpRight size={13} strokeWidth={1.5} />
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
          >
            Other evenings
            <ArrowUpRight size={13} strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </section>
  )
}
