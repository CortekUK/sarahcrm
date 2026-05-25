'use client'

import { forwardRef, useEffect, useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase/client'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  Check,
  ChevronDown,
  Loader2,
  Search,
  X as XIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// /membership-application — premium 8-step editorial application.
//
// Steps (matching Sarah's existing flow on theclubbysarahrestrick.com):
//   I.   Contact Details        — name, email, phone, address
//   II.  Our Location           — Manchester / Leeds / London (visual card pick)
//   III. Events Interest        — multi-select chips
//   IV.  Build Profile          — photo, nationality, identity, bio
//   V.   Online Profiles        — LinkedIn / IG / X / YT / TikTok / Website (all optional)
//   VI.  Your Business          — company, sector, position, work email, scale
//   VII. Choose Membership      — Individual / Business / Corporate (image cards)
//   VIII.Select Payment         — Annual / Monthly
//
// Visual vocabulary:
//   • Diamond step indicator across the top (matches the original site
//     but on a dark editorial canvas, with bronze hairlines + ivory text)
//   • Each step has roman numeral + label eyebrow, display headline,
//     italic descriptor — feels like turning the page of a chapter
//   • Underline inputs (no boxes) — editorial, restrained
//   • Big image-card pickers for location / tier / payment
//   • Pill chips for interests
//   • PremiumPillButton on the primary CTA, text link on Back
//   • Reveal cascades on step entry; smooth direction-aware slide
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/theclub-section.png'
const PHOTO_BUCKET = 'content'
const PHOTO_FOLDER = 'applicants'

const STEPS = [
  {
    n: 'I',
    label: 'Contact Details',
    title: 'Begin with the formalities.',
    note: 'Where the team can write back to you.',
  },
  {
    n: 'II',
    label: 'Our Location',
    title: 'Choose your home city.',
    note: 'Membership grants access to events across all three.',
  },
  {
    n: 'III',
    label: 'Events Interest',
    title: 'Tell us what calls to you.',
    note: "Tick the evenings, days and rooms you'd like an invitation to.",
  },
  {
    n: 'IV',
    label: 'Build Profile',
    title: 'A short portrait of you.',
    note: 'A photograph, a few personal notes, and a brief bio. Members read these.',
  },
  {
    n: 'V',
    label: 'Online Profiles',
    title: 'Where else you live online.',
    note: 'All optional — useful for the team to put a face to the application.',
  },
  {
    n: 'VI',
    label: 'Your Business',
    title: 'Tell us about your work.',
    note: 'What you do, the scale of it, and where you sit within it.',
  },
  {
    n: 'VII',
    label: 'Choose Membership',
    title: 'Pick the membership.',
    note: 'Each is a 12-month contract. You can choose how to pay next.',
  },
  {
    n: 'VIII',
    label: 'Select Payment',
    title: 'Annual or monthly.',
    note: "How you'd like to honour the contract — the team will confirm by email.",
  },
] as const

const LOCATIONS = [
  { value: 'Manchester', image: '/manchester.png', caption: 'The original chapter.' },
  { value: 'Leeds', image: '/gallery/land1.png', caption: 'The new northern room.' },
  { value: 'London', image: '/gallery/bigland.png', caption: 'Capital evenings.' },
] as const

const INTERESTS = [
  'Monthly members events',
  'Private dining',
  'Sponsorship events',
  'Sporting events',
  'Fashion and retail events',
  'Business panels',
  'Corporate events',
  'Retreats',
  'Wellness days',
] as const

const NATIONALITIES = [
  'British',
  'Irish',
  'American',
  'Canadian',
  'Australian',
  'French',
  'German',
  'Italian',
  'Spanish',
  'Dutch',
  'Swiss',
  'Indian',
  'Pakistani',
  'Bangladeshi',
  'Chinese',
  'Japanese',
  'South Korean',
  'Saudi Arabian',
  'Emirati',
  'South African',
  'Nigerian',
  'Brazilian',
  'Mexican',
  'Prefer not to say',
  'Other',
]
const IDENTIFIES = ['Woman', 'Man', 'Non-binary', 'Prefer not to say']
const PRONOUNS = ['She / Her', 'He / Him', 'They / Them', 'Prefer not to say']
const TURNOVER = [
  'Under £100k',
  '£100k – £500k',
  '£500k – £1m',
  '£1m – £5m',
  '£5m – £25m',
  '£25m – £100m',
  '£100m+',
  'Prefer not to say',
]
const HEADCOUNT = ['1', '2 – 10', '11 – 50', '51 – 250', '251 – 1,000', '1,000+']

const TIERS = [
  {
    value: 'individual',
    label: 'Individual',
    price: '£2,500',
    contract: 'plus VAT · 12 month minimum term',
    body: 'A single representation. 6 Member tickets, 1 ticket at Member rate for paid events.',
    image: '/gallery/potrait.png',
  },
  {
    value: 'business',
    label: 'Business',
    price: '£15,000',
    contract: 'plus VAT · 12 month minimum term',
    body: 'Up to 4 representations. Brand showcase event with curated guestlist, corporate concierge included.',
    image: '/gallery/land2.png',
  },
  {
    value: 'corporate',
    label: 'Corporate',
    price: '£30,000',
    contract: 'plus VAT · 12 month minimum term',
    body: 'Up to 4 representations plus 1 sponsorship opportunity, brand showcase event and corporate concierge.',
    image: '/gallery/land3.png',
  },
] as const

// Pricing — all values in pence so we stay integer-clean for Stripe.
// Annual amounts are net (ex VAT) and match the public /memberships
// page exactly. Monthly amount = annual / 12, rounded to whole pence.
const PRICING: Record<
  'individual' | 'business' | 'corporate',
  { annual: number; monthly: number }
> = {
  individual: { annual: 250000, monthly: 20833 }, // £2,500 / £208.33
  business: { annual: 1500000, monthly: 125000 }, // £15,000 / £1,250
  corporate: { annual: 3000000, monthly: 250000 }, // £30,000 / £2,500
}
const VAT_RATE = 0.2 // UK standard rate

function pence(n: number) {
  // Format integer pence as £x,xxx.xx
  const pounds = n / 100
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  }).format(pounds)
}

const PAYMENTS = [
  {
    value: 'annual',
    label: 'Annual',
    body: 'Settled in full at the start of your twelve-month term.',
  },
  {
    value: 'monthly',
    label: 'Monthly',
    body: 'Twelve equal instalments across the year.',
  },
] as const

// ─── Schema ────────────────────────────────────────────────────────────
const schema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().min(1, 'Required'),
  address_line_1: z.string().min(1, 'Required'),
  address_line_2: z.string().optional(),
  city: z.string().min(1, 'Required'),
  postcode: z.string().min(1, 'Required'),

  preferred_location: z.enum(['Manchester', 'Leeds', 'London'], {
    error: 'Please choose a city',
  }),

  interests: z.array(z.string()),

  photo_url: z.string().optional(),
  nationality: z.string().optional(),
  identifies_as: z.string().optional(),
  pronouns: z.string().optional(),
  bio: z.string().min(20, 'Please share a few lines about yourself'),

  linkedin_url: z.string().optional(),
  instagram_url: z.string().optional(),
  x_url: z.string().optional(),
  youtube_url: z.string().optional(),
  tiktok_url: z.string().optional(),
  website_url: z.string().optional(),

  company: z.string().min(1, 'Required'),
  industry: z.string().min(1, 'Required'),
  position: z.string().min(1, 'Required'),
  work_email: z.string().email('Please enter a valid work email').optional().or(z.literal('')),
  annual_turnover: z.string().optional(),
  employees: z.string().optional(),
  referral_name: z.string().optional(),

  preferred_tier: z.enum(['individual', 'business', 'corporate'], {
    error: 'Please choose a tier',
  }),
  payment_preference: z.enum(['annual', 'monthly'], {
    error: 'Please choose a payment option',
  }),
})
type FormData = z.infer<typeof schema>

// Which fields must validate before "Continue" advances the step.
const FIELDS_BY_STEP: (keyof FormData)[][] = [
  ['first_name', 'last_name', 'email', 'phone', 'address_line_1', 'city', 'postcode'],
  ['preferred_location'],
  [], // interests — optional
  ['bio'],
  [], // online profiles — all optional
  ['company', 'industry', 'position'],
  ['preferred_tier'],
  ['payment_preference'],
]

export default function MembershipApplicationPage() {
  const [step, setStep] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formScrollRef = useRef<HTMLDivElement>(null)

  const {
    register,
    handleSubmit,
    trigger,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { interests: [] },
    mode: 'onChange',
  })

  function scrollToFormTop() {
    if (typeof window === 'undefined' || !formScrollRef.current) return
    const top = formScrollRef.current.getBoundingClientRect().top + window.scrollY - 80
    window.scrollTo({ top, behavior: 'smooth' })
  }

  async function next() {
    const fields = FIELDS_BY_STEP[step]
    const valid = fields.length === 0 ? true : await trigger(fields)
    if (!valid) return
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
    scrollToFormTop()
  }
  function back() {
    setStep((s) => Math.max(0, s - 1))
    scrollToFormTop()
  }

  async function onSubmit(data: FormData) {
    setError(null)
    // The /api/membership-application/checkout endpoint saves the
    // application (via service role, bypassing RLS) and creates a
    // Stripe checkout session for the chosen tier + cadence. We then
    // redirect the browser to Stripe; on completion the user lands on
    // /membership-application/success.
    try {
      const res = await fetch('/api/membership-application/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) {
        setError(json.error || 'Something went wrong opening checkout. Please try again.')
        return
      }
      window.location.href = json.url
    } catch (err) {
      console.error(err)
      setError('Something went wrong. Please try again, or email us directly.')
    }
  }

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative h-[60vh] min-h-[440px] w-full overflow-hidden bg-ink">
        <KenBurnsImage
          src={HERO_IMAGE}
          alt="The Club"
          motion="in"
          duration={32}
          overlay={0.55}
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-20">
          <Reveal type="clip" delay={150}>
            <h1 className="display-xl max-w-4xl">Apply for Membership.</h1>
          </Reveal>
        </div>
      </section>

      {/* ── Intro copy — verbatim client text ───────────────────────── */}
      <section className="bg-ink pt-10 lg:pt-14 pb-20 lg:pb-28">
        <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
          <Reveal type="up" delay={0}>
            <span className="block h-px w-12 bg-bronze/50 mx-auto mb-8" />
          </Reveal>
          <Reveal type="up" delay={100}>
            <p className="font-[family-name:var(--font-editorial)] text-[clamp(1.125rem,1.4vw,1.375rem)] leading-[1.7] text-ivory-soft">
              Embark on a journey with us and become a member of The Club — designed to elevate
              your professional connections and business opportunities. Immerse yourself in a
              curated calendar of events spanning the vibrant cities of{' '}
              <em className="italic text-bronze-light">Manchester, Leeds and London</em>. Seize the
              opportunity to enhance your network and amplify your business presence by applying
              for membership to The Club.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Application ─────────────────────────────────────────────── */}
      <Chapter density="tight" bg="ink" className="relative">
        <Aurora variant="soft" />

        <div ref={formScrollRef} className="relative z-10 max-w-6xl mx-auto">
          {submitted ? (
            <SuccessPanel />
          ) : (
            <>
              {/* Diamond step indicator with inline glowing progress line */}
              <StepIndicator step={step} />

              {/* Step head — title + italic descriptor, centred. */}
              <div key={`head-${step}`} className="text-center mb-14">
                <Reveal type="clip" delay={0}>
                  <h2 className="display-md">{STEPS[step].title}</h2>
                </Reveal>
                <Reveal type="up" delay={200}>
                  <p className="font-[family-name:var(--font-editorial)] italic text-[17px] text-ivory-soft mt-5 max-w-xl mx-auto">
                    {STEPS[step].note}
                  </p>
                </Reveal>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                {/* Per-step content. `key` resets reveal animations on
                    step change so each step's fields fade in cleanly. */}
                <div key={`body-${step}`}>
                  {step === 0 && (
                    <ContactStep register={register} errors={errors} />
                  )}
                  {step === 1 && (
                    <Controller
                      name="preferred_location"
                      control={control}
                      render={({ field }) => (
                        <LocationStep
                          value={field.value}
                          onChange={field.onChange}
                          error={errors.preferred_location?.message}
                        />
                      )}
                    />
                  )}
                  {step === 2 && (
                    <Controller
                      name="interests"
                      control={control}
                      render={({ field }) => (
                        <InterestsStep value={field.value ?? []} onChange={field.onChange} />
                      )}
                    />
                  )}
                  {step === 3 && (
                    <ProfileStep
                      register={register}
                      errors={errors}
                      watch={watch}
                      setValue={setValue}
                      control={control}
                    />
                  )}
                  {step === 4 && <OnlineProfilesStep register={register} />}
                  {step === 5 && (
                    <BusinessStep register={register} errors={errors} control={control} />
                  )}
                  {step === 6 && (
                    <Controller
                      name="preferred_tier"
                      control={control}
                      render={({ field }) => (
                        <TierStep
                          value={field.value}
                          onChange={field.onChange}
                          error={errors.preferred_tier?.message}
                        />
                      )}
                    />
                  )}
                  {step === 7 && (
                    <Controller
                      name="payment_preference"
                      control={control}
                      render={({ field }) => (
                        <PaymentStep
                          value={field.value}
                          onChange={field.onChange}
                          error={errors.payment_preference?.message}
                          tier={watch('preferred_tier')}
                        />
                      )}
                    />
                  )}
                </div>

                {error && (
                  <div className="mt-10 px-4 py-3 border border-plum-light/40 bg-plum/30 text-[13px] text-ivory text-center">
                    {error}
                  </div>
                )}

                {/* Footer controls — back link + premium pill */}
                <div className="flex items-center justify-between gap-6 mt-12">
                  <div className="min-w-[80px]">
                    {step > 0 && (
                      <button
                        type="button"
                        onClick={back}
                        className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light transition-colors duration-300"
                      >
                        <ArrowLeft size={13} strokeWidth={1.5} />
                        Back
                      </button>
                    )}
                  </div>

                  {step < STEPS.length - 1 ? (
                    <PremiumPillButton type="button" onClick={next}>
                      Continue
                    </PremiumPillButton>
                  ) : (
                    <PremiumPillButton type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Opening checkout…' : 'Apply and Pay'}
                    </PremiumPillButton>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </Chapter>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Step indicator — 8 diamonds across the top with a hairline progress
// line threaded through their vertical centre. The segment between the
// active diamond and the next one glows with a slow bronze pulse,
// signalling forward motion. Completed segments are solid bronze;
// upcoming segments are dim graphite.
// ─────────────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  return (
    <Reveal type="up" delay={0}>
      <div className="mb-16">
        {/* Grid gives every step exactly 1/8 of the row width, so labels
            can wrap onto two lines inside their own column without
            colliding with the next one (this is what was breaking when
            "Choose Membership" / "Select Payment" sat next to each
            other in a flex layout). */}
        <div className="grid grid-cols-8 items-start">
          {STEPS.map((s, i) => {
            const state = i === step ? 'active' : i < step ? 'done' : 'upcoming'
            const isLast = i === STEPS.length - 1
            const segDone = i < step
            const segActive = i === step

            return (
              <div key={s.n} className="relative flex flex-col items-center">
                {/* Connector segment to the next column. Sits at the
                    y-centre of the diamond (half its height) and runs
                    from this diamond's right edge to the next diamond's
                    left edge. Diamond size is w-9 (36px → 18px from
                    centre to edge) on mobile, w-11 (44px → 22px) on
                    md+. */}
                {!isLast && (
                  <div
                    aria-hidden
                    className="absolute h-px top-[17px] md:top-[21px] pointer-events-none left-[calc(50%+18px)] right-[calc(-50%+18px)] md:left-[calc(50%+22px)] md:right-[calc(-50%+22px)]"
                  >
                    <div
                      className={cn(
                        'absolute inset-0 transition-colors duration-700',
                        segDone ? 'bg-bronze' : 'bg-graphite-line/60',
                      )}
                    />
                    {segActive && (
                      // Bronze pulse: gradient fades to transparent at
                      // both ends so the drop-shadow glow can't bleed
                      // back into the diamonds. drop-shadow (not
                      // box-shadow) respects the alpha channel — the
                      // transparent edges cast no glow.
                      <span
                        className="absolute inset-0 animate-membership-pulse"
                        style={{
                          background:
                            'linear-gradient(to right, rgba(192,152,112,0) 0%, rgba(192,152,112,1) 22%, rgba(192,152,112,1) 78%, rgba(192,152,112,0) 100%)',
                          filter:
                            'drop-shadow(0 0 3px rgba(192,152,112,0.7)) drop-shadow(0 0 8px rgba(192,152,112,0.35))',
                        }}
                      />
                    )}
                  </div>
                )}

                {/* Diamond — bg-ink so it visually "breaks" the line at
                    its position, z-10 to sit above the connector. */}
                <div
                  className={cn(
                    'relative z-10 w-9 h-9 md:w-11 md:h-11 rotate-45 flex items-center justify-center border transition-all duration-500 bg-ink',
                    state === 'active' &&
                      'border-bronze bg-bronze/15 shadow-[0_0_24px_-6px_rgba(192,152,112,0.75)]',
                    state === 'done' && 'border-bronze/55',
                    state === 'upcoming' && 'border-graphite-line/70',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-[3px] border transition-colors duration-500',
                      state === 'active' && 'border-bronze/40',
                      state === 'done' && 'border-bronze/25',
                      state === 'upcoming' && 'border-graphite-line/40',
                    )}
                  />
                  <span
                    className={cn(
                      '-rotate-45 font-[family-name:var(--font-meta)] text-[10px] tracking-[0.18em] tabular-nums transition-colors duration-500',
                      state === 'active' && 'text-bronze-light',
                      state === 'done' && 'text-bronze/80',
                      state === 'upcoming' && 'text-slate-dim',
                    )}
                  >
                    {state === 'done' ? <Check size={11} strokeWidth={2} /> : s.n}
                  </span>
                </div>

                {/* Label — every label is two words, rendered one per
                    line so all eight columns share the same two-line
                    rhythm (otherwise short labels like "Build Profile"
                    sit on a single line and the row reads ragged). */}
                <span
                  className={cn(
                    'mt-3 hidden md:block text-center font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.22em] leading-[1.45] max-w-[110px] transition-colors duration-500',
                    state === 'active' && 'text-bronze-light',
                    state === 'done' && 'text-ivory-soft/70',
                    state === 'upcoming' && 'text-slate-dim',
                  )}
                >
                  {s.label.split(' ').map((word, i) => (
                    <span key={i} className="block">
                      {word}
                    </span>
                  ))}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </Reveal>
  )
}

// ─── Step 1 — Contact Details ────────────────────────────────────────

function ContactStep({
  register,
  errors,
}: {
  register: ReturnType<typeof useForm<FormData>>['register']
  errors: ReturnType<typeof useForm<FormData>>['formState']['errors']
}) {
  return (
    <Reveal type="up" delay={0}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="First name" error={errors.first_name?.message} {...register('first_name')} />
          <Field label="Last name" error={errors.last_name?.message} {...register('last_name')} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Field label="Contact number" error={errors.phone?.message} {...register('phone')} />
        </div>
        <Field
          label="Address line 1"
          error={errors.address_line_1?.message}
          {...register('address_line_1')}
        />
        <Field label="Address line 2 (optional)" {...register('address_line_2')} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="City" error={errors.city?.message} {...register('city')} />
          <Field label="Postcode" error={errors.postcode?.message} {...register('postcode')} />
        </div>
      </div>
    </Reveal>
  )
}

// ─── Step 2 — Location ───────────────────────────────────────────────

function LocationStep({
  value,
  onChange,
  error,
}: {
  value: FormData['preferred_location'] | undefined
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <Reveal type="up" delay={0}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {LOCATIONS.map((l) => {
          const active = value === l.value
          return (
            <button
              type="button"
              key={l.value}
              onClick={() => onChange(l.value)}
              className={cn(
                'group relative aspect-[3/4] overflow-hidden border transition-all duration-500 text-left',
                active
                  ? 'border-bronze shadow-[0_0_36px_-12px_rgba(192,152,112,0.55)]'
                  : 'border-graphite-line/50 hover:border-bronze/55',
              )}
            >
              <Image
                src={l.image}
                alt={l.value}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className={cn(
                  'object-cover transition-transform duration-[1200ms] ease-out',
                  active ? 'scale-105' : 'scale-100 group-hover:scale-105',
                )}
              />
              <div
                className={cn(
                  'absolute inset-0 transition-opacity duration-500',
                  active ? 'bg-ink/55' : 'bg-ink/70 group-hover:bg-ink/55',
                )}
              />

              {/* Corner brackets — brighten when active */}
              <CornerBrackets active={active} />

              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
                <h3 className="font-[family-name:var(--font-display)] text-[26px] tracking-[0.02em] text-ivory">
                  {l.value}
                </h3>
                <p
                  className={cn(
                    'font-[family-name:var(--font-editorial)] italic text-[14px] transition-colors duration-500',
                    active ? 'text-bronze-light' : 'text-ivory-soft/70',
                  )}
                >
                  {l.caption}
                </p>
                {active && (
                  <span className="mt-1 inline-flex items-center justify-center w-6 h-6 rounded-full bg-bronze text-ink">
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      {error && (
        <p className="mt-6 text-[12px] text-bronze-light italic text-center">{error}</p>
      )}
    </Reveal>
  )
}

function CornerBrackets({ active }: { active: boolean }) {
  const colour = active ? 'bg-bronze-light' : 'bg-ivory/50'
  return (
    <>
      <span aria-hidden className={cn('absolute top-3 left-3 w-4 h-px', colour)} />
      <span aria-hidden className={cn('absolute top-3 left-3 w-px h-4', colour)} />
      <span aria-hidden className={cn('absolute top-3 right-3 w-4 h-px', colour)} />
      <span aria-hidden className={cn('absolute top-3 right-3 w-px h-4', colour)} />
      <span aria-hidden className={cn('absolute bottom-3 left-3 w-4 h-px', colour)} />
      <span aria-hidden className={cn('absolute bottom-3 left-3 w-px h-4', colour)} />
      <span aria-hidden className={cn('absolute bottom-3 right-3 w-4 h-px', colour)} />
      <span aria-hidden className={cn('absolute bottom-3 right-3 w-px h-4', colour)} />
    </>
  )
}

// ─── Step 3 — Events Interest ────────────────────────────────────────

function InterestsStep({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  function toggle(item: string) {
    if (value.includes(item)) onChange(value.filter((v) => v !== item))
    else onChange([...value, item])
  }
  return (
    <Reveal type="up" delay={0}>
      {/* Grid keeps every option the same width on a row — no more
          jagged "Private Dining vs Fashion And Retail Events" gaps.
          Each tile is a horizontal row with the label left and a small
          square check on the right, which reads as a checklist rather
          than scattered pills. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto">
        {INTERESTS.map((item) => {
          const on = value.includes(item)
          return (
            <button
              key={item}
              type="button"
              onClick={() => toggle(item)}
              aria-pressed={on}
              className={cn(
                'group relative flex items-center gap-4 px-5 py-4 border text-left transition-all duration-300',
                on
                  ? 'border-bronze bg-bronze/10 shadow-[0_0_22px_-10px_rgba(192,152,112,0.6)]'
                  : 'border-graphite-line/70 bg-graphite/30 hover:border-bronze/55 hover:bg-bronze/5',
              )}
            >
              {/* Square check mark — much more editorial than a pill */}
              <span
                aria-hidden
                className={cn(
                  'shrink-0 w-4 h-4 flex items-center justify-center border transition-all duration-300',
                  on ? 'bg-bronze border-bronze' : 'border-graphite-line/80 group-hover:border-bronze/60',
                )}
              >
                {on && <Check size={10} strokeWidth={3} className="text-ink" />}
              </span>
              <span
                className={cn(
                  'font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.22em] transition-colors duration-300',
                  on ? 'text-bronze-light' : 'text-ivory-soft group-hover:text-ivory',
                )}
              >
                {item}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-center mt-10 text-[12px] italic text-slate-haze font-[family-name:var(--font-editorial)]">
        Optional — tick as many as you like.
      </p>
    </Reveal>
  )
}

// ─── Step 4 — Build Profile ──────────────────────────────────────────

function ProfileStep({
  register,
  errors,
  watch,
  setValue,
  control,
}: {
  register: ReturnType<typeof useForm<FormData>>['register']
  errors: ReturnType<typeof useForm<FormData>>['formState']['errors']
  watch: ReturnType<typeof useForm<FormData>>['watch']
  setValue: ReturnType<typeof useForm<FormData>>['setValue']
  control: ReturnType<typeof useForm<FormData>>['control']
}) {
  const photoUrl = watch('photo_url')
  return (
    <Reveal type="up" delay={0}>
      <div className="space-y-8">
        <PhotoUploader value={photoUrl} onChange={(v) => setValue('photo_url', v ?? '')} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Controller
            name="nationality"
            control={control}
            render={({ field }) => (
              <EditorialSelect
                label="Nationality (optional)"
                options={NATIONALITIES}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="identifies_as"
            control={control}
            render={({ field }) => (
              <EditorialSelect
                label="How do you identify?"
                options={IDENTIFIES}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="pronouns"
            control={control}
            render={({ field }) => (
              <EditorialSelect
                label="Pronouns"
                options={PRONOUNS}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        <Field
          label="A short bio"
          as="textarea"
          rows={6}
          placeholder="Tell us about you — how you got to where you are now in business, what you're looking for, what you currently do for networking."
          error={errors.bio?.message}
          {...register('bio')}
        />
      </div>
    </Reveal>
  )
}

function PhotoUploader({
  value,
  onChange,
}: {
  value?: string
  onChange: (v: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handle(file: File) {
    setErr(null)
    if (file.size > 8 * 1024 * 1024) {
      setErr('File is too large (max 8 MB).')
      return
    }
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
      const safe = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .slice(0, 40)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const rnd = Math.random().toString(36).slice(2, 8)
      const path = `${PHOTO_FOLDER}/${stamp}-${rnd}-${safe}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
      if (uploadErr) {
        setErr(uploadErr.message)
        return
      }
      const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
      onChange(data.publicUrl)
    } finally {
      setUploading(false)
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handle(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <p className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze mb-3">
        Upload a profile photo
      </p>
      <div className="flex items-center gap-5">
        <div
          className={cn(
            'relative w-24 h-24 rounded-full border overflow-hidden flex items-center justify-center transition-colors duration-500',
            value ? 'border-bronze/60' : 'border-graphite-line/60',
          )}
        >
          {value ? (
            <Image src={value} alt="Profile" fill sizes="96px" className="object-cover" unoptimized />
          ) : (
            <Camera size={20} className="text-slate-dim" strokeWidth={1.5} />
          )}
          {uploading && (
            <div className="absolute inset-0 bg-ink/70 flex items-center justify-center">
              <Loader2 size={18} className="animate-spin text-bronze-light" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 items-start">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-bronze/55 hover:border-bronze rounded-full font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-bronze-light hover:text-ivory hover:bg-bronze/15 transition-all duration-300"
          >
            <Camera size={13} strokeWidth={1.5} />
            {value ? 'Replace photo' : 'Choose photo'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze hover:text-bronze-light transition-colors"
            >
              <XIcon size={11} strokeWidth={1.5} />
              Remove
            </button>
          )}
          <p className="text-[11px] text-slate-dim">JPG, PNG or WebP — up to 8 MB. Optional.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          className="hidden"
        />
      </div>
      {err && <p className="mt-3 text-[12px] text-bronze-light italic">{err}</p>}
    </div>
  )
}

// ─── Step 5 — Online Profiles ────────────────────────────────────────

function OnlineProfilesStep({
  register,
}: {
  register: ReturnType<typeof useForm<FormData>>['register']
}) {
  return (
    <Reveal type="up" delay={0}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="LinkedIn URL" placeholder="https://" {...register('linkedin_url')} />
        <Field label="Instagram URL" placeholder="https://" {...register('instagram_url')} />
        <Field label="X URL" placeholder="https://" {...register('x_url')} />
        <Field label="YouTube URL" placeholder="https://" {...register('youtube_url')} />
        <Field label="TikTok URL" placeholder="https://" {...register('tiktok_url')} />
        <Field label="Website URL" placeholder="https://" {...register('website_url')} />
      </div>
    </Reveal>
  )
}

// ─── Step 6 — Business ───────────────────────────────────────────────

function BusinessStep({
  register,
  errors,
  control,
}: {
  register: ReturnType<typeof useForm<FormData>>['register']
  errors: ReturnType<typeof useForm<FormData>>['formState']['errors']
  control: ReturnType<typeof useForm<FormData>>['control']
}) {
  return (
    <Reveal type="up" delay={0}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Business name" error={errors.company?.message} {...register('company')} />
          <Field
            label="Business sector"
            placeholder="e.g. Finance, technology, hospitality"
            error={errors.industry?.message}
            {...register('industry')}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Your position" error={errors.position?.message} {...register('position')} />
          <Field
            label="Work email (optional)"
            type="email"
            placeholder="you@company.com"
            error={errors.work_email?.message}
            {...register('work_email')}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Controller
            name="annual_turnover"
            control={control}
            render={({ field }) => (
              <EditorialSelect
                label="Annual turnover"
                options={TURNOVER}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="employees"
            control={control}
            render={({ field }) => (
              <EditorialSelect
                label="Employees"
                options={HEADCOUNT}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            )}
          />
        </div>
        <Field
          label="Member who can recommend you (optional)"
          placeholder="If you know an existing Member, add their name"
          {...register('referral_name')}
        />
      </div>
    </Reveal>
  )
}

// ─── Step 7 — Membership Tier ────────────────────────────────────────

function TierStep({
  value,
  onChange,
  error,
}: {
  value: FormData['preferred_tier'] | undefined
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <Reveal type="up" delay={0}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {TIERS.map((t) => {
          const active = value === t.value
          return (
            <button
              type="button"
              key={t.value}
              onClick={() => onChange(t.value)}
              className={cn(
                'group relative aspect-[3/4] overflow-hidden border transition-all duration-500 text-left',
                active
                  ? 'border-bronze shadow-[0_0_36px_-12px_rgba(192,152,112,0.55)]'
                  : 'border-graphite-line/50 hover:border-bronze/55',
              )}
            >
              <Image
                src={t.image}
                alt={t.label}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className={cn(
                  'object-cover transition-transform duration-[1200ms] ease-out',
                  active ? 'scale-105' : 'scale-100 group-hover:scale-105',
                )}
              />
              <div
                className={cn(
                  'absolute inset-0 transition-opacity duration-500',
                  active
                    ? 'bg-gradient-to-b from-ink/40 via-ink/65 to-ink/90'
                    : 'bg-gradient-to-b from-ink/55 via-ink/75 to-ink/95',
                )}
              />

              <CornerBrackets active={active} />

              <div className="absolute inset-x-0 bottom-0 p-6 lg:p-7 flex flex-col gap-3">
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
                  {t.label}
                </p>
                <p className="font-[family-name:var(--font-display)] text-[32px] leading-none text-ivory">
                  {t.price}
                </p>
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] text-ivory-soft/70">
                  {t.contract}
                </p>
                <p className="font-[family-name:var(--font-editorial)] italic text-[13.5px] leading-[1.55] text-ivory-soft mt-2">
                  {t.body}
                </p>
                <div className="mt-3 h-px bg-bronze/30" />
                <span
                  className={cn(
                    'inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] transition-colors duration-500',
                    active ? 'text-bronze-light' : 'text-ivory-soft/70 group-hover:text-bronze-light',
                  )}
                >
                  {active ? (
                    <>
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-bronze text-ink">
                        <Check size={11} strokeWidth={2.5} />
                      </span>
                      Selected
                    </>
                  ) : (
                    'Choose this tier'
                  )}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      {error && (
        <p className="mt-6 text-[12px] text-bronze-light italic text-center">{error}</p>
      )}
    </Reveal>
  )
}

// ─── Step 8 — Payment ────────────────────────────────────────────────

function PaymentStep({
  value,
  onChange,
  error,
  tier,
}: {
  value: FormData['payment_preference'] | undefined
  onChange: (v: string) => void
  error?: string
  tier: FormData['preferred_tier'] | undefined
}) {
  const tierInfo = tier ? TIERS.find((t) => t.value === tier) : undefined

  return (
    <Reveal type="up" delay={0}>
      {/* Both cards share a row. `items-start` lets the active one
          grow taller (with its receipt) without pulling the other to
          match height — so the unselected card stays compact. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        {PAYMENTS.map((p) => {
          const active = value === p.value
          const showReceipt = active && !!tierInfo

          // This option's own subtotal/VAT/total
          let subtotal = 0
          if (tierInfo) {
            subtotal =
              p.value === 'annual'
                ? PRICING[tierInfo.value].annual
                : PRICING[tierInfo.value].monthly
          }
          const vat = Math.round(subtotal * VAT_RATE)
          const total = subtotal + vat
          const perLabel = p.value === 'annual' ? '/ year' : '/ month'

          return (
            <button
              type="button"
              key={p.value}
              onClick={() => onChange(p.value)}
              className={cn(
                'group relative overflow-hidden border p-8 lg:p-10 text-left transition-all duration-500',
                active
                  ? 'border-bronze bg-bronze/10 shadow-[0_0_36px_-12px_rgba(192,152,112,0.55)]'
                  : 'border-graphite-line/50 hover:border-bronze/55 bg-graphite/40',
              )}
            >
              <CornerBrackets active={active} />

              {/* Card head — always rendered the same on both cards */}
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
                Pay {p.value}
              </p>
              <h3 className="font-[family-name:var(--font-display)] text-[28px] leading-tight text-ivory mt-3">
                {p.label}
              </h3>
              <p className="font-[family-name:var(--font-editorial)] italic text-[14.5px] text-ivory-soft mt-3 leading-[1.6]">
                {p.body}
              </p>
              <span
                className={cn(
                  'mt-6 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] transition-colors duration-500',
                  active ? 'text-bronze-light' : 'text-ivory-soft/70 group-hover:text-bronze-light',
                )}
              >
                {active ? (
                  <>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-bronze text-ink">
                      <Check size={11} strokeWidth={2.5} />
                    </span>
                    Selected
                  </>
                ) : (
                  'Choose this option'
                )}
              </span>

              {/* Receipt — only on the active card. Sits below the
                  divider so the card visually "unfolds" when selected.
                  The other card keeps its original compact shape. */}
              {showReceipt && tierInfo && (
                <div className="mt-7 pt-7 border-t border-bronze/30 space-y-6 animate-receipt-unfold">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--font-display)] text-[20px] text-ivory leading-tight">
                        {tierInfo.label} Membership
                      </p>
                      <p className="font-[family-name:var(--font-editorial)] italic text-[12.5px] text-ivory-soft mt-1">
                        12 month contract · paid {p.value}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-[family-name:var(--font-display)] text-[24px] text-ivory leading-none tabular-nums">
                        {pence(subtotal)}
                      </p>
                      <p className="font-[family-name:var(--font-meta)] text-[9px] uppercase tracking-[0.28em] text-slate-haze mt-1">
                        {perLabel}
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-bronze/20" />

                  <dl className="space-y-2.5 text-[13.5px]">
                    <div className="flex items-center justify-between">
                      <dt className="text-ivory-soft">Subtotal</dt>
                      <dd className="text-ivory tabular-nums">{pence(subtotal)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-ivory-soft">VAT (20%)</dt>
                      <dd className="text-ivory tabular-nums">{pence(vat)}</dd>
                    </div>
                  </dl>

                  <div className="pt-5 border-t border-bronze/30 flex items-baseline justify-between gap-4">
                    <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
                      Due {p.value === 'annual' ? 'today' : 'today, then monthly'}
                    </p>
                    <p className="font-[family-name:var(--font-display)] text-[28px] text-ivory leading-none tabular-nums">
                      {pence(total)}
                    </p>
                  </div>

                  <p className="font-[family-name:var(--font-editorial)] italic text-[11.5px] text-slate-haze text-center pt-1">
                    You&apos;ll be taken to Stripe to complete payment securely.
                  </p>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="mt-6 text-[12px] text-bronze-light italic text-center">{error}</p>
      )}
    </Reveal>
  )
}

// ─── Success Panel ───────────────────────────────────────────────────

function SuccessPanel() {
  return (
    <Reveal type="up" delay={0}>
      <div className="border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 lg:p-16 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-7">
          <Check size={28} strokeWidth={1.5} className="text-bronze-light" />
        </div>
        <p className="eyebrow mb-6">Received with thanks</p>
        <h2 className="display-md mb-6">Your application has reached us.</h2>
        <p className="body-prose max-w-md mx-auto">
          The team will review it personally. If your application reads, we&apos;ll write back to
          arrange a short conversation — usually within seven days.
        </p>
        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
        >
          Return to the homepage
          <ArrowUpRight size={13} strokeWidth={1.5} />
        </Link>
      </div>
    </Reveal>
  )
}

// ─────────────────────────────────────────────────────────────────────
// PremiumPillButton — double-stroke bronze pill, centre-out fill.
// Same vocabulary as ApplyClose on the homepage so the entire close
// flow feels stitched together.
// ─────────────────────────────────────────────────────────────────────

interface PremiumPillButtonProps {
  children: React.ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
}

function PremiumPillButton({
  children,
  type = 'button',
  disabled,
  onClick,
}: PremiumPillButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative inline-block transition-opacity duration-500',
        disabled && 'opacity-60 cursor-wait',
      )}
    >
      <span className="block relative px-9 py-4 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
        <span
          aria-hidden
          className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover:border-ink/20"
        />
        <span
          aria-hidden
          className="absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out"
        />
        <span className="relative z-10 flex items-center gap-3 font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ivory group-hover:text-ink transition-colors duration-700">
          {children}
          <ArrowUpRight
            size={14}
            strokeWidth={1.5}
            className="transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
          />
        </span>
      </span>
    </button>
  )
}

// ─── Field — underline input / textarea ─────────────────────────────

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label: string
  error?: string
  as?: 'input' | 'textarea'
  rows?: number
}

const Field = forwardRef<HTMLInputElement | HTMLTextAreaElement, FieldProps>(
  ({ label, error, as = 'input', rows, ...rest }, ref) => {
    const inputClass =
      'w-full px-0 py-3 bg-transparent border-b border-graphite-line/80 focus:border-bronze focus:outline-none text-[15px] text-ivory placeholder:text-slate-dim transition-colors'
    return (
      <div>
        <label className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze mb-3">
          {label}
        </label>
        {as === 'textarea' ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            rows={rows ?? 5}
            className={inputClass + ' resize-none'}
            {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            className={inputClass}
            {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
        {error && <p className="mt-2 text-[12px] text-bronze-light italic">{error}</p>}
      </div>
    )
  },
)
Field.displayName = 'Field'

// ─── EditorialSelect — custom dropdown with dark theme ──────────────
// Native <select> opens a system-styled popup with blue highlights and
// a white background that breaks the editorial dark theme. This is a
// button + popover that we control entirely: bronze hover, ink panel,
// keyboard accessible, click-outside to close.

interface EditorialSelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  error?: string
}

function EditorialSelect({ label, value, onChange, options, error }: EditorialSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Show search only when the list is long enough to need it
  const showSearch = options.length > 8

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // When the menu opens: clear stale query, focus search, and scroll
  // the selected row into view.
  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    if (showSearch && inputRef.current) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    if (listRef.current) {
      const selected = listRef.current.querySelector('[data-selected="true"]')
      if (selected) selected.scrollIntoView({ block: 'nearest' })
    }
  }, [open, showSearch])

  return (
    <div className="relative" ref={wrapRef}>
      <label className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze mb-3">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-0 py-3 bg-transparent border-b text-[15px] text-left transition-colors',
          open ? 'border-bronze' : 'border-graphite-line/80 hover:border-bronze/50',
        )}
      >
        <span className={cn(value ? 'text-ivory' : 'text-slate-dim')}>{value || 'Select…'}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn(
            'text-slate-haze transition-transform duration-300',
            open && 'rotate-180 text-bronze-light',
          )}
        />
      </button>

      {open && (
        // data-lenis-prevent stops the site-wide Lenis smooth-scroll
        // from hijacking wheel events inside the dropdown — otherwise
        // the page scrolls and the dropdown list doesn't.
        <div
          data-lenis-prevent
          className="absolute left-0 right-0 top-full mt-2 z-50 bg-graphite border border-bronze/40 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md"
        >
          {showSearch && (
            <div className="px-3 pt-3 pb-2 border-b border-graphite-line/60">
              <div className="relative">
                <Search
                  size={13}
                  strokeWidth={1.5}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-haze pointer-events-none"
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-7 pr-2 py-2 bg-graphite-2 border border-graphite-line/60 focus:border-bronze rounded-sm text-[13px] text-ivory placeholder:text-slate-dim outline-none transition-colors"
                />
              </div>
            </div>
          )}
          <div
            ref={listRef}
            role="listbox"
            className="max-h-64 overflow-y-auto overscroll-contain"
          >
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] italic text-slate-haze">
                No matches.
              </p>
            ) : (
              filtered.map((o) => {
                const selected = value === o
                return (
                  <button
                    key={o}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-selected={selected}
                    onClick={() => {
                      onChange(o)
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-[13.5px] transition-colors',
                      selected
                        ? 'bg-bronze/15 text-bronze-light'
                        : 'text-ivory-soft hover:bg-bronze/10 hover:text-ivory',
                    )}
                  >
                    <span>{o}</span>
                    {selected && <Check size={12} strokeWidth={2} className="text-bronze-light" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-[12px] text-bronze-light italic">{error}</p>}
    </div>
  )
}
