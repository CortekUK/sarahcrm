'use client'

// Confirm step for /unsubscribe. The page itself never writes on GET —
// this button is the only thing that actually opts the address out.

import { useState } from 'react'
import { Check, MailX } from 'lucide-react'

interface Props {
  body: { token: string } | { e: string; sig: string }
  displayEmail: string | null
}

export function ConfirmUnsubscribe({ body, displayEmail }: Props) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'already' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (status === 'sending') return
    setStatus('sending')
    setError(null)
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        state?: 'ok' | 'already'
        error?: string
      }
      if (!res.ok || !json.ok) {
        setError(json.error || 'Could not unsubscribe. Please try again.')
        setStatus('error')
        return
      }
      setStatus(json.state === 'already' ? 'already' : 'ok')
    } catch {
      setError('Network error — please check your connection and try again.')
      setStatus('error')
    }
  }

  if (status === 'ok' || status === 'already') {
    return (
      <div role="status">
        <div className="w-16 h-16 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-7">
          <Check size={28} strokeWidth={1.5} className="text-bronze-light" />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
          {status === 'already' ? 'Already removed' : 'Unsubscribed'}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
          {status === 'already'
            ? "You're already off the list."
            : 'You will no longer receive our notes.'}
        </h1>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7]">
          {displayEmail
            ? `We've removed ${displayEmail} from our marketing emails. If this was a mistake, you're welcome back any time.`
            : "If this was a mistake, you're welcome back any time."}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="w-16 h-16 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-7">
        <MailX size={28} strokeWidth={1.5} className="text-bronze-light" />
      </div>
      <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
        Unsubscribe
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
        Stop receiving our notes?
      </h1>
      <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7] mb-8">
        {displayEmail ? (
          <>
            <span className="not-italic font-medium text-ivory">{displayEmail}</span> will be
            removed from The Club&apos;s newsletter and marketing emails. Booking confirmations
            and membership emails are not affected.
          </>
        ) : (
          'This address will be removed from The Club’s newsletter and marketing emails.'
        )}
      </p>
      {error && (
        <p role="alert" className="mb-6 text-[14px] text-bronze-light">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={confirm}
        disabled={status === 'sending'}
        className="inline-flex items-center justify-center min-h-[44px] px-8 py-3 border border-bronze bg-bronze/15 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-ivory hover:bg-bronze/30 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'sending' ? 'Unsubscribing…' : 'Confirm unsubscribe'}
      </button>
    </>
  )
}
