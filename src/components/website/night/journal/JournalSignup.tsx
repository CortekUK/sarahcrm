'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

// Journal email sign-up — posts to /api/newsletter/subscribe (server-side,
// honeypot + rate limits) with the CRM source "Journal newsletter".
// Used at the foot of every article and in the Journal's empty state.

const INPUT =
  'w-full bg-transparent border-b border-bronze/30 focus:border-bronze py-3 px-0 text-[15px] text-ivory placeholder:text-ivory-soft/50 outline-none transition-colors duration-300'

export function JournalSignup({
  heading = 'Receive our notes.',
  lede = 'New stories, founder’s letters and press from The Club, sent now and then. Never shared.',
}: {
  heading?: string
  lede?: string
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('') // honeypot
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Please fill in your name and email.')
      return
    }
    if (!consent) {
      setError('Please tick the box to agree to our Privacy Policy.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          source: 'Journal newsletter',
          website,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setError(json.error || 'Something went wrong. Please try again.')
        return
      }
      setDone(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
      <div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
          The Journal
        </p>
        <h2 className="display-md text-ivory">{heading}</h2>
        <p className="mt-5 font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.15rem)] leading-[1.7] text-ivory-soft max-w-md">
          {lede}
        </p>
      </div>

      {done ? (
        <p role="status" className="font-[family-name:var(--font-editorial)] italic text-[18px] text-ivory lg:pt-10">
          Thank you. You&rsquo;re on the list.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              aria-label="First name"
              autoComplete="given-name"
              className={INPUT}
            />
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              aria-label="Last name"
              autoComplete="family-name"
              className={INPUT}
            />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            aria-label="Email address"
            autoComplete="email"
            className={INPUT}
          />
          {/* Honeypot — hidden from people, filled by bots. */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="hidden"
            aria-hidden
          />
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-bronze)]"
            />
            <span className="font-[family-name:var(--font-editorial)] text-[14px] leading-[1.6] text-ivory-soft">
              I agree to The Club contacting me by email, as set out in the{' '}
              <Link href="/privacy-policy" className="text-bronze-light underline underline-offset-4">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {error && (
            <p role="alert" className="text-[13px] italic text-accent-warm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-3 rounded-full border border-bronze px-8 py-3.5 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.3em] text-ivory hover:bg-bronze hover:text-ink transition-colors duration-500 disabled:opacity-60"
          >
            {submitting ? 'Signing you up…' : 'Sign up'}
            <ArrowUpRight size={14} strokeWidth={1.5} />
          </button>
        </form>
      )}
    </div>
  )
}
