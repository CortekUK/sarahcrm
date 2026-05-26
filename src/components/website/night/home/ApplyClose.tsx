'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Aurora } from '../effects/Aurora'
import { Spotlight } from '../effects/Spotlight'
import { Reveal } from '../effects/Reveal'
import { ArrowUpRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fireBronzeConfetti } from '@/lib/effects/confetti'

// Final homepage chapter — pairs the membership-application CTA with a
// quiet newsletter signup. Two columns under a single plum-aurora
// background so the close feels like one editorial moment with two
// paths out (apply now / stay close).
//
// Newsletter writes to public.mailing_list, which requires first_name,
// last_name, email (all non-null). The form captures all three.

export function ApplyClose() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubscribe(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Please fill in all three fields.')
      return
    }
    setSubmitting(true)
    // Upsert by email — if someone signs up twice we refresh their
    // first/last name + clear any previous unsubscribed_at, rather
    // than blocking with a unique-violation error.
    const { error: err } = await supabase.from('mailing_list').upsert(
      {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        unsubscribed_at: null,
        source: 'website',
      },
      { onConflict: 'email' },
    )
    setSubmitting(false)
    if (err) {
      setError('Something went wrong. Please try again.')
      return
    }
    setSubmitted(true)
    void fireBronzeConfetti()
  }

  return (
    <section className="always-night relative overflow-hidden bg-plum py-24 md:py-32">
      <Aurora variant="dusk" z={0} />
      <Spotlight size={900} color="rgba(192, 152, 112, 0.20)" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-0 lg:divide-x lg:divide-bronze/20 items-stretch">
          {/* ── Apply column ──────────────────────────────────────── */}
          <div className="lg:pr-16 flex flex-col justify-between">
            <div>
              <Reveal type="up" delay={0}>
                <p className="eyebrow mb-7">Membership</p>
              </Reveal>
              <Reveal type="clip" delay={150}>
                <h2 className="display-md text-ivory leading-[1.05]">
                  Apply for membership.
                </h2>
              </Reveal>
              <Reveal type="up" delay={450}>
                <p className="body-prose text-ivory-soft mt-6 max-w-md">
                  The Club is a private members community. Applications are reviewed by the team.
                </p>
              </Reveal>
            </div>

            <Reveal type="up" delay={700} className="mt-10">
              <PremiumButton as="link" href="/membership-application">
                Apply for Membership
              </PremiumButton>
            </Reveal>
          </div>

          {/* ── Newsletter column (staggered 200ms behind Apply col) ── */}
          <div className="lg:pl-16 flex flex-col justify-between">
            <div>
              <Reveal type="up" delay={200}>
                <p className="eyebrow mb-7">Stay Close</p>
              </Reveal>
              <Reveal type="clip" delay={350}>
                <h2 className="display-md text-ivory leading-[1.05]">
                  Receive our notes.
                </h2>
              </Reveal>
              <Reveal type="up" delay={650}>
                <p className="body-prose text-ivory-soft mt-6 max-w-md">
                  Occasional, considered updates — upcoming evenings, new partnerships, a few thoughts from the team.
                </p>
              </Reveal>
            </div>

            <Reveal type="up" delay={900} className="mt-10">
              {submitted ? (
                <div className="border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-10 lg:p-12 text-center">
                  <div className="w-14 h-14 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-6">
                    <Check size={22} strokeWidth={1.5} className="text-bronze-light" />
                  </div>
                  <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-4">
                    Subscribed
                  </p>
                  <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.6rem,2.6vw,2.2rem)] leading-[1.1] text-ivory mb-4">
                    Thank you for subscribing.
                  </h3>
                  <p className="font-[family-name:var(--font-editorial)] italic text-[15px] text-ivory-soft leading-[1.7]">
                    A note will land in your inbox the next time the team has something
                    worth sharing.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      autoComplete="given-name"
                      className="bg-transparent border-b border-bronze/30 focus:border-bronze py-3 px-0 text-[15px] text-ivory placeholder:text-ivory-soft/40 outline-none transition-colors duration-300"
                    />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      autoComplete="family-name"
                      className="bg-transparent border-b border-bronze/30 focus:border-bronze py-3 px-0 text-[15px] text-ivory placeholder:text-ivory-soft/40 outline-none transition-colors duration-300"
                    />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    autoComplete="email"
                    className="w-full bg-transparent border-b border-bronze/30 focus:border-bronze py-3 px-0 text-[15px] text-ivory placeholder:text-ivory-soft/40 outline-none transition-colors duration-300"
                  />

                  {error && (
                    <p className="text-[12px] text-bronze-light italic">{error}</p>
                  )}

                  <div className="pt-2">
                    <PremiumButton as="button" disabled={submitting} type="submit">
                      {submitting ? 'Adding you…' : 'Subscribe'}
                    </PremiumButton>
                  </div>
                </form>
              )}
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// PremiumButton — double-stroke bronze pill with letter-spaced caps,
// slow hover fill from the centre, and an arrow that lifts diagonally.
// Visually heavier than a single-stroke button — the second inner
// hairline gives it the "engraved plaque" feel that reads as luxury.
// ─────────────────────────────────────────────────────────────────────

interface PremiumButtonBaseProps {
  children: React.ReactNode
  className?: string
}

type PremiumButtonProps =
  | (PremiumButtonBaseProps & { as: 'link'; href: string })
  | (PremiumButtonBaseProps & {
      as: 'button'
      type?: 'button' | 'submit'
      disabled?: boolean
      onClick?: () => void
    })

function PremiumButton(props: PremiumButtonProps) {
  const baseClass = cn(
    'group relative inline-block transition-opacity duration-500',
    'as' in props && props.as === 'button' && props.disabled && 'opacity-60 cursor-wait',
    props.className,
  )

  const inner = (
    <span className="block relative px-10 py-5 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
      {/* Inner hairline — the second stroke that makes it look engraved */}
      <span
        aria-hidden
        className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover:border-ink/20"
      />
      {/* Bronze fill that grows from centre on hover */}
      <span
        aria-hidden
        className="absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out"
      />
      {/* Label + arrow */}
      <span className="relative z-10 flex items-center gap-4 font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.36em] text-ivory group-hover:text-ink transition-colors duration-700">
        {props.children}
        <ArrowUpRight
          size={15}
          strokeWidth={1.5}
          className="transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
        />
      </span>
    </span>
  )

  if (props.as === 'link') {
    return (
      <Link href={props.href} className={baseClass}>
        {inner}
      </Link>
    )
  }
  return (
    <button
      type={props.type ?? 'button'}
      disabled={props.disabled}
      onClick={props.onClick}
      className={baseClass}
    >
      {inner}
    </button>
  )
}
