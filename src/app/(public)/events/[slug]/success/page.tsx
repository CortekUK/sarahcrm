'use client'

import { use, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check, ArrowUpRight, Loader2 } from 'lucide-react'

// Post-Stripe landing for event bookings. Stripe redirects here with
// ?session_id=cs_… in the URL. We fire-and-forget POST to
// /api/events/sync so the booking flips to 'confirmed' + a payment
// row is inserted, without depending on the Stripe webhook (which
// doesn't fire in localhost without a tunnel).

export default function EventBookingSuccessPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'failed'>(
    'idle',
  )

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
        if (res.ok && json.ok) setSyncState('done')
        else {
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
      <div className="max-w-xl w-full text-center border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 lg:p-16">
        <div className="w-16 h-16 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-7">
          <Check size={28} strokeWidth={1.5} className="text-bronze-light" />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
          Booking confirmed
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
          A seat is yours.
        </h1>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7]">
          Your payment is secured and the booking is with the team. A confirmation note will land in
          your inbox within the next few minutes.
        </p>

        {syncState === 'syncing' && (
          <p className="mt-5 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-slate-haze">
            <Loader2 size={11} className="animate-spin" />
            Recording payment…
          </p>
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
