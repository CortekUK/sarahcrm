'use client'

import { forwardRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Check, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// Public-side event booking widget — used on /events/[slug].
//
// Two paths:
//   - Guest: short form (name + email + optional company / dietary /
//     special requests) → POST /api/events/checkout → Stripe.
//   - Member: link to /login (member portal handles the lower
//     member-price flow via POST /api/events/book).
//
// Sequence within the widget:
//   1. Idle      — guest form visible, "Continue" CTA.
//   2. Receipt   — readonly summary panel with event + price + total +
//                  "Confirm and pay" CTA that fires Stripe.
//   3. Submitting — Stripe call in-flight, button disabled.
//
// Receipt step exists so the user sees what they're paying for before
// they're sent to Stripe — same vocabulary as the membership-
// application checkout flow.
// ─────────────────────────────────────────────────────────────────────

export interface EventForBooking {
  id: string
  slug: string
  title: string
  start_date: string
  venue_name: string | null
  venue_city: string | null
  guest_price_pence: number | null
  member_price_pence: number | null
  accommodation_available?: boolean | null
  accommodation_price_pence?: number | null
  auto_confirm?: boolean | null
}

export interface SponsorBooking {
  token: string
  price_pence: number
  package_name: string
  name: string
  email: string
  company: string
}

interface BookingWidgetProps {
  event: EventForBooking
  // Present when the page was opened via a sponsor's personalised link
  // (?s=<token>). Switches the widget to the sponsor's negotiated price and
  // pre-fills their contact details.
  sponsor?: SponsorBooking | null
}

function formatGBP(pence: number | null | undefined) {
  if (pence == null) return '—'
  if (pence === 0) return 'Complimentary'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
  }).format(pence / 100)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function BookingWidget({ event, sponsor }: BookingWidgetProps) {
  const isSponsor = !!sponsor
  const [step, setStep] = useState<'idle' | 'receipt' | 'submitting'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [addAccommodation, setAddAccommodation] = useState(false)
  const [form, setForm] = useState({
    guest_name: sponsor?.name ?? '',
    guest_email: sponsor?.email ?? '',
    guest_company: sponsor?.company ?? '',
    dietary_requirements: '',
    special_requests: '',
  })

  const guestPrice = event.guest_price_pence ?? 0
  const memberPrice = event.member_price_pence ?? 0
  // Sponsors pay their own negotiated rate; the public guest path uses the
  // event's guest price. The "seat" price the widget quotes follows suit.
  const seatPrice = isSponsor ? sponsor!.price_pence : guestPrice
  const bookable = seatPrice > 0
  const accommodationPrice = event.accommodation_price_pence ?? 0
  const accommodationAvailable = event.accommodation_available === true && accommodationPrice > 0
  // When the event isn't auto-confirm, the card is held (not charged) until
  // the team approves the booking.
  const holdOnly = event.auto_confirm === false
  const total = seatPrice + (addAccommodation && accommodationAvailable ? accommodationPrice : 0)

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function onContinue(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.guest_name.trim()) return setError('Please enter your name.')
    if (!form.guest_email.trim() || !form.guest_email.includes('@'))
      return setError('Please enter a valid email.')
    setStep('receipt')
  }

  async function onConfirmPay() {
    setError(null)
    setStep('submitting')
    try {
      const res = await fetch('/api/events/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: event.id,
          guest_name: form.guest_name.trim(),
          guest_email: form.guest_email.trim(),
          guest_company: form.guest_company.trim() || null,
          dietary_requirements: form.dietary_requirements.trim() || null,
          special_requests: form.special_requests.trim() || null,
          add_accommodation: addAccommodation && accommodationAvailable,
          sponsor_token: sponsor?.token ?? null,
        }),
      })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) {
        setError(json.error || 'Could not open checkout.')
        setStep('receipt')
        return
      }
      window.location.href = json.url
    } catch (err) {
      console.error(err)
      setError('Something went wrong. Please try again.')
      setStep('receipt')
    }
  }

  if (!bookable) {
    return (
      <div className="border border-graphite-line/40 bg-graphite/40 backdrop-blur-sm rounded-2xl p-7">
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
          Bookings
        </p>
        <p className="font-[family-name:var(--font-editorial)] italic text-[15px] text-ivory-soft leading-[1.7]">
          Public bookings for this evening haven&apos;t opened yet. Members will be notified first
          through the portal.
        </p>
        <Link
          href="/membership-application"
          className="mt-5 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
        >
          Apply for membership
          <ArrowUpRight size={13} strokeWidth={1.5} />
        </Link>
      </div>
    )
  }

  return (
    <div className="border border-bronze/40 bg-graphite/50 backdrop-blur-sm rounded-2xl p-7 lg:p-8">
      {/* Sponsor banner — only when opened via a sponsor invite link */}
      {isSponsor && (
        <div className="mb-6 -mt-1 px-4 py-3 rounded-xl border border-bronze/40 bg-bronze/10">
          <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light">
            Sponsor invitation
          </p>
          <p className="font-[family-name:var(--font-editorial)] text-[13.5px] text-ivory mt-1">
            {sponsor!.package_name} — your reserved rate is shown below.
          </p>
        </div>
      )}

      {/* Header — price + member rate hint */}
      <div className="flex items-baseline justify-between gap-4 pb-6 border-b border-graphite-line/50">
        <div>
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
            {isSponsor ? 'Sponsor rate' : 'Per seat'}
          </p>
          <p className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,3vw,2.75rem)] leading-none text-ivory tabular-nums mt-3">
            {formatGBP(seatPrice)}
          </p>
        </div>
        {!isSponsor && memberPrice > 0 && memberPrice < guestPrice && (
          <div className="text-right">
            <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-slate-haze">
              Members
            </p>
            <p className="font-[family-name:var(--font-display)] text-[18px] text-bronze-light tabular-nums mt-1">
              {formatGBP(memberPrice)}
            </p>
          </div>
        )}
      </div>

      {step === 'idle' && (
        <form onSubmit={onContinue} className="mt-7 space-y-5">
          <Field
            label="Full name"
            value={form.guest_name}
            onChange={(v) => update('guest_name', v)}
            autoComplete="name"
          />
          <Field
            label="Email"
            type="email"
            value={form.guest_email}
            onChange={(v) => update('guest_email', v)}
            autoComplete="email"
          />
          <Field
            label="Company (optional)"
            value={form.guest_company}
            onChange={(v) => update('guest_company', v)}
            autoComplete="organization"
          />
          <Field
            label="Dietary requirements (optional)"
            value={form.dietary_requirements}
            onChange={(v) => update('dietary_requirements', v)}
            as="textarea"
            rows={2}
          />
          <Field
            label="Special requests (optional)"
            value={form.special_requests}
            onChange={(v) => update('special_requests', v)}
            as="textarea"
            rows={2}
          />

          {accommodationAvailable && (
            <label className="flex items-center justify-between gap-3 cursor-pointer border border-graphite-line/60 rounded-lg px-4 py-3.5">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={addAccommodation}
                  onChange={(e) => setAddAccommodation(e.target.checked)}
                  className="h-4 w-4 accent-bronze"
                />
                <span className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-ivory">
                  Add accommodation
                </span>
              </span>
              <span className="font-[family-name:var(--font-display)] text-[15px] text-bronze-light tabular-nums">
                +{formatGBP(accommodationPrice)}
              </span>
            </label>
          )}

          {error && <p className="text-[12.5px] text-bronze-light italic">{error}</p>}

          <button type="submit" className="w-full group/btn relative inline-block mt-2">
            <span className="block relative px-7 py-4 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
              <span
                aria-hidden
                className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover/btn:border-ink/20"
              />
              <span
                aria-hidden
                className="absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover/btn:scale-x-100 origin-center transition-transform duration-700 ease-out"
              />
              <span className="relative z-10 flex items-center justify-center gap-3 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-ivory group-hover/btn:text-ink transition-colors duration-700">
                Continue
                <ArrowUpRight size={13} strokeWidth={1.5} />
              </span>
            </span>
          </button>

          {/* Member sign-in pathway — hidden on sponsor invites, which are a
              dedicated external flow at a fixed rate. */}
          {!isSponsor && (
            <div className="pt-5 mt-2 border-t border-graphite-line/50 flex items-center justify-between gap-3">
              <p className="font-[family-name:var(--font-editorial)] italic text-[12.5px] text-ivory-soft/85">
                Already a member?
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
              >
                <Lock size={11} strokeWidth={1.5} />
                Sign in to book
              </Link>
            </div>
          )}
        </form>
      )}

      {(step === 'receipt' || step === 'submitting') && (
        <div className="mt-7 space-y-5">
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light text-center">
            Confirm your booking
          </p>

          {/* Event summary */}
          <div className="space-y-3 pt-4">
            <Row label="Event" value={event.title} />
            <Row label="When" value={formatDate(event.start_date)} />
            {(event.venue_name || event.venue_city) && (
              <Row
                label="Where"
                value={[event.venue_name, event.venue_city].filter(Boolean).join(', ')}
              />
            )}
            <Row label="Name" value={form.guest_name} />
            <Row label="Email" value={form.guest_email} />
            <Row label="Seat" value={formatGBP(seatPrice)} />
            {addAccommodation && accommodationAvailable && (
              <Row label="Accommodation" value={formatGBP(accommodationPrice)} />
            )}
          </div>

          <div className="h-px bg-bronze/25" />

          {/* Total */}
          <div className="flex items-baseline justify-between">
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
              {holdOnly ? 'Total (held)' : 'Due today'}
            </p>
            <p className="font-[family-name:var(--font-display)] text-[26px] text-ivory leading-none tabular-nums">
              {formatGBP(total)}
            </p>
          </div>

          <p className="font-[family-name:var(--font-editorial)] italic text-[11.5px] text-slate-haze text-center pt-1">
            {holdOnly
              ? 'Your card is securely held — nothing is charged until your booking is approved. If it isn’t, no payment is taken.'
              : 'You’ll be taken to Stripe to complete payment securely.'}
          </p>

          {error && <p className="text-[12.5px] text-bronze-light italic text-center">{error}</p>}

          <button
            type="button"
            onClick={onConfirmPay}
            disabled={step === 'submitting'}
            className={cn(
              'w-full group/btn relative inline-block transition-opacity duration-500',
              step === 'submitting' && 'opacity-60 cursor-wait',
            )}
          >
            <span className="block relative px-7 py-4 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
              <span
                aria-hidden
                className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover/btn:border-ink/20"
              />
              <span
                aria-hidden
                className="absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover/btn:scale-x-100 origin-center transition-transform duration-700 ease-out"
              />
              <span className="relative z-10 flex items-center justify-center gap-3 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-ivory group-hover/btn:text-ink transition-colors duration-700">
                {step === 'submitting' ? (
                  'Opening checkout…'
                ) : (
                  <>
                    <Check size={13} strokeWidth={1.8} />
                    {holdOnly ? 'Confirm booking' : 'Confirm and Pay'}
                  </>
                )}
              </span>
            </span>
          </button>

          {step !== 'submitting' && (
            <button
              type="button"
              onClick={() => setStep('idle')}
              className="w-full font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze hover:text-bronze-light transition-colors duration-300"
            >
              ← Back to edit
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-slate-haze shrink-0">
        {label}
      </p>
      <p className="font-[family-name:var(--font-editorial)] text-[13.5px] text-ivory text-right">
        {value}
      </p>
    </div>
  )
}

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  as?: 'input' | 'textarea'
  rows?: number
}

const Field = forwardRef<HTMLInputElement | HTMLTextAreaElement, FieldProps>(
  ({ label, value, onChange, type = 'text', autoComplete, as = 'input', rows = 3 }, ref) => {
    const cls =
      'w-full px-0 py-2.5 bg-transparent border-b border-graphite-line/80 focus:border-bronze focus:outline-none text-[14px] text-ivory placeholder:text-slate-dim transition-colors'
    return (
      <div>
        <label className="block font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-slate-haze mb-2">
          {label}
        </label>
        {as === 'textarea' ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            className={cls + ' resize-none'}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            type={type}
            autoComplete={autoComplete}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cls}
          />
        )}
      </div>
    )
  },
)
Field.displayName = 'Field'
