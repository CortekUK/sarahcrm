'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check, ArrowUpRight, Loader2 } from 'lucide-react'

// Post-card-capture page (pending-charge flow). Stripe redirects here
// after the applicant confirms their SetupIntent (saves their card) with:
//   ?application_id=…&setup_intent=…&setup_intent_client_secret=…&redirect_status=succeeded
//
// We:
//   1. Show the "application received" message immediately. NOTHING has
//      been charged — the card is only saved.
//   2. POST to /api/membership-application/confirm so the saved payment
//      method is recorded on the application and the applicant gets the
//      "pending application received" email. This is idempotent and safe
//      to fire on every load.
//
// The card is only charged later, if an admin approves the application.

export default function MembershipApplicationSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  )
}

function SuccessInner() {
  const searchParams = useSearchParams()
  const setupIntent = searchParams.get('setup_intent')
  const applicationId = searchParams.get('application_id')
  const [confirmState, setConfirmState] = useState<'idle' | 'confirming' | 'done' | 'failed'>(
    'idle',
  )

  useEffect(() => {
    if (!setupIntent && !applicationId) return
    setConfirmState('confirming')
    fetch('/api/membership-application/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setup_intent: setupIntent, application_id: applicationId }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (res.ok && json.ok) {
          setConfirmState('done')
        } else {
          console.warn('[application-success] confirm did not complete', json)
          setConfirmState('failed')
        }
      })
      .catch((err) => {
        console.warn('[application-success] confirm request failed', err)
        setConfirmState('failed')
      })
  }, [setupIntent, applicationId])

  return (
    <section className="relative min-h-[80vh] bg-ink flex items-center justify-center px-6 py-24">
      <div className="max-w-xl w-full text-center border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 lg:p-16 day:bg-white day:shadow-lg day:border-bronze/30">
        <div className="w-16 h-16 mx-auto rounded-full bg-bronze/15 border border-bronze/40 day:bg-bronze/20 day:border-bronze/55 flex items-center justify-center mb-7">
          <Check size={28} strokeWidth={1.5} className="text-bronze-light day:text-bronze-dark" />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
          Application received
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
          Thank you for applying.
        </h1>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7]">
          Your application is with the team for review. Your card has been securely saved, but
          nothing has been charged — we&apos;ll only take payment if your application is approved.
          You&apos;ll hear from us within 14 working days.
        </p>

        {/* Quiet status indicator — visible while we record the saved card.
           A 'failed' state just stays silent rather than alarming the
           applicant; the card is already saved with Stripe regardless. */}
        {confirmState === 'confirming' && (
          <p className="mt-5 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-slate-haze">
            <Loader2 size={11} className="animate-spin" />
            Finishing up…
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
