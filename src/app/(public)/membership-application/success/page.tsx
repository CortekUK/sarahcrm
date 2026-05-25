'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check, ArrowUpRight, Loader2 } from 'lucide-react'

// Post-Stripe success page. Stripe redirects here with a
// ?session_id=cs_… in the URL. We:
//   1. Show the success message immediately (Stripe already confirmed
//      payment via the URL — payment_status is part of the session).
//   2. POST to /api/membership-application/sync in the background so
//      the application row + (if member exists) member + payment all
//      reflect the Stripe truth without depending on the webhook.
//
// The sync is fire-and-forget UX-wise — if it fails the webhook will
// eventually catch up (or admin can re-trigger from the admin side).
// We don't block the celebration screen on it.

export default function MembershipApplicationSuccessPage() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'failed'>(
    'idle',
  )

  useEffect(() => {
    if (!sessionId) return
    setSyncState('syncing')
    fetch('/api/membership-application/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (res.ok && json.ok) {
          setSyncState('done')
        } else {
          // Non-fatal — the webhook will likely catch up. Log so a dev
          // looking at console knows what happened.
          console.warn('[application-success] sync did not complete', json)
          setSyncState('failed')
        }
      })
      .catch((err) => {
        console.warn('[application-success] sync request failed', err)
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
          Payment received
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
          Welcome to The Club.
        </h1>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7]">
          Your payment is secured and your application is with the team. You&apos;ll receive a
          personal note from us within seven days confirming your membership.
        </p>

        {/* Quiet sync indicator — admins debugging in dev see this; real
           members rarely notice. Falling-back state ('failed') just
           says nothing rather than alarming the user. */}
        {syncState === 'syncing' && (
          <p className="mt-5 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-slate-haze">
            <Loader2 size={11} className="animate-spin" />
            Recording payment…
          </p>
        )}

        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
        >
          Return to the homepage
          <ArrowUpRight size={13} strokeWidth={1.5} />
        </Link>
      </div>
    </section>
  )
}
