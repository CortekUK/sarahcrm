'use client'

import { forwardRef, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase/client'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { ArrowUpRight, Check, Mail, MapPin, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'

// Lightweight hero shape — populated from the CMS in a useEffect so the
// page can stay a client component (the contact form needs interactivity).
interface HeroData {
  media_type: 'image' | 'video'
  image_url: string | null
  alt_text: string
  video_url: string | null
  video_poster_url: string | null
  eyebrow: string | null
  headline: string | null
  lede: string | null
}

const HERO_FALLBACK: HeroData = {
  media_type: 'image',
  image_url: '/theclub-section.png',
  alt_text: 'The Club',
  video_url: null,
  video_poster_url: null,
  eyebrow: 'Get in Touch',
  headline: 'Contact us.',
  lede: 'A short note is enough — the team writes back personally.',
}

// ─────────────────────────────────────────────────────────────────────
// /contact-us — premium editorial contact page.
//
// Same vocabulary as /membership-application:
//   • Hero with real client photo (no eyebrow/stamp — restraint)
//   • Centred italic intro paragraph below the hero
//   • Form chapter on Aurora background — left form, right meta
//   • Subject options as a grid of checklist tiles (matches the
//     interests grid on the membership flow)
//   • PremiumPillButton as the primary CTA
//   • Closing "Three cities" strip mirroring the homepage locations
//
// No fabricated voice copy — labels and prompts only. Email is the one
// real contact channel we have; phone is left out until Sarah confirms
// a number for the public site.
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/theclub-section.png'

const SUBJECT_OPTIONS = [
  { value: 'general', label: 'A general enquiry' },
  { value: 'membership', label: 'About membership' },
  { value: 'event', label: 'An upcoming event' },
  { value: 'private_event', label: 'Hosting a private event' },
  { value: 'press', label: 'Press / media' },
] as const

const CITIES = [
  { name: 'Manchester', image: '/manchester.png', note: 'The original chapter.' },
  { name: 'Leeds', image: '/gallery/land1.png', note: 'The new northern room.' },
  { name: 'London', image: '/gallery/bigland.png', note: 'Capital evenings.' },
]

const enquirySchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().optional(),
  company: z.string().optional(),
  intent_type: z.enum(['general', 'membership', 'event', 'private_event', 'press'], {
    error: 'Please choose a subject',
  }),
  message: z.string().min(10, 'Please share a few more lines'),
})
type EnquiryData = z.infer<typeof enquirySchema>

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hero, setHero] = useState<HeroData>(HERO_FALLBACK)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('hero_slides')
      .select(
        'media_type, image_url, alt_text, video_url, video_poster_url, eyebrow, headline, lede',
      )
      .eq('page_slug', 'contact-us')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setHero({
          media_type: ((data.media_type as 'image' | 'video') ?? 'image'),
          image_url: data.image_url ?? HERO_FALLBACK.image_url,
          alt_text: data.alt_text ?? HERO_FALLBACK.alt_text,
          video_url: data.video_url,
          video_poster_url: data.video_poster_url,
          eyebrow: data.eyebrow ?? HERO_FALLBACK.eyebrow,
          headline: data.headline ?? HERO_FALLBACK.headline,
          lede: data.lede ?? HERO_FALLBACK.lede,
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EnquiryData>({
    resolver: zodResolver(enquirySchema),
    defaultValues: { intent_type: 'general' },
    mode: 'onChange',
  })

  async function onSubmit(data: EnquiryData) {
    setError(null)
    const { intent_type, ...rest } = data
    const { error: err } = await supabase
      .from('enquiries')
      .insert({ ...rest, intent: [intent_type] })
    if (err) {
      setError('Something went wrong. Please try again, or email us directly.')
      return
    }
    setSubmitted(true)
  }

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative h-[60vh] min-h-[440px] w-full overflow-hidden bg-ink">
        <PageHeroMedia
          mediaType={hero.media_type}
          imageUrl={hero.image_url}
          alt={hero.alt_text}
          videoUrl={hero.video_url}
          videoPosterUrl={hero.video_poster_url}
          overlay={0.55}
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-20">
          {hero.eyebrow && (
            <Reveal type="up" delay={0}>
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
                {hero.eyebrow}
              </p>
            </Reveal>
          )}
          {hero.headline && (
            <Reveal type="clip" delay={150}>
              <h1 className="display-xl max-w-4xl">{hero.headline}</h1>
            </Reveal>
          )}
          {hero.lede && (
            <Reveal type="up" delay={400}>
              <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.1875rem)] leading-[1.7] text-ivory-soft mt-6 max-w-2xl">
                {hero.lede}
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── Form + meta ─────────────────────────────────────────────── */}
      <Chapter density="tight" bg="ink" className="relative">
        <Aurora variant="soft" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 max-w-6xl mx-auto">
          {/* ── Form column ───────────────────────────────────────── */}
          <div className="lg:col-span-7">
            {submitted ? (
              <SuccessPanel />
            ) : (
              <>
                <Reveal type="clip" delay={0}>
                  <h2 className="display-md">A short note.</h2>
                </Reveal>
                <Reveal type="up" delay={200}>
                  <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft mt-5 mb-12">
                    Tell us a little about what brought you to the page.
                  </p>
                </Reveal>

                <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-7">
                  <Reveal type="up" delay={0}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field
                        label="First name"
                        error={errors.first_name?.message}
                        {...register('first_name')}
                      />
                      <Field
                        label="Last name"
                        error={errors.last_name?.message}
                        {...register('last_name')}
                      />
                    </div>
                  </Reveal>

                  <Reveal type="up" delay={80}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field
                        label="Email"
                        type="email"
                        error={errors.email?.message}
                        {...register('email')}
                      />
                      <Field label="Phone (optional)" {...register('phone')} />
                    </div>
                  </Reveal>

                  <Reveal type="up" delay={160}>
                    <Field label="Company (optional)" {...register('company')} />
                  </Reveal>

                  {/* Subject — checklist-style tiles, single select.
                      Matches the visual language of the interests step
                      on /membership-application: square tick on the
                      left, label on the right, bronze fill when active. */}
                  <Reveal type="up" delay={240}>
                    <Controller
                      name="intent_type"
                      control={control}
                      render={({ field }) => (
                        <SubjectTiles value={field.value} onChange={field.onChange} />
                      )}
                    />
                    {errors.intent_type?.message && (
                      <p className="mt-3 text-[12px] text-bronze-light italic">
                        {errors.intent_type.message}
                      </p>
                    )}
                  </Reveal>

                  <Reveal type="up" delay={320}>
                    <Field
                      label="Message"
                      as="textarea"
                      rows={7}
                      placeholder="A short note. We'll write back."
                      error={errors.message?.message}
                      {...register('message')}
                    />
                  </Reveal>

                  {error && (
                    <div className="px-4 py-3 border border-plum-light/40 bg-plum/30 text-[13px] text-ivory">
                      {error}
                    </div>
                  )}

                  <Reveal type="up" delay={400} className="pt-4">
                    <PremiumPillButton type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Sending…' : 'Send the message'}
                    </PremiumPillButton>
                  </Reveal>
                </form>
              </>
            )}
          </div>

          {/* ── Meta column ────────────────────────────────────────── */}
          <aside className="lg:col-span-5 space-y-12">
            <Reveal type="up" delay={200}>
              <div>
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-7">
                  Or write directly
                </p>
                <ul className="space-y-5">
                  <ContactRow
                    icon={Mail}
                    label="Email"
                    href="mailto:hello@theclubbysarahrestrick.com"
                    value="hello@theclubbysarahrestrick.com"
                  />
                  <ContactRow icon={MapPin} label="Cities" value="Manchester · Leeds · London" />
                </ul>
              </div>
            </Reveal>

            <Reveal type="up" delay={350}>
              <div className="border-t border-graphite-line/60 pt-10">
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
                  For Members
                </p>
                <p className="font-[family-name:var(--font-editorial)] italic text-[17px] text-ivory-soft leading-relaxed">
                  Concierge requests are handled through the member portal — you&apos;ll find a
                  faster reply there.
                </p>
                <Link
                  href="/login"
                  className="mt-7 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
                >
                  Open the member portal
                  <ArrowUpRight size={13} strokeWidth={1.5} />
                </Link>
              </div>
            </Reveal>

            <Reveal type="up" delay={500}>
              <div className="border-t border-graphite-line/60 pt-10">
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
                  Press
                </p>
                <p className="font-[family-name:var(--font-editorial)] italic text-[17px] text-ivory-soft leading-relaxed">
                  Editorial requests, partnership enquiries and brand collaborations — note your
                  outlet in the message and the team will route it accordingly.
                </p>
              </div>
            </Reveal>
          </aside>
        </div>
      </Chapter>

      {/* ── Locations strip ─────────────────────────────────────────── */}
      <section className="relative bg-graphite border-t border-graphite-line/40 py-24 lg:py-32 overflow-hidden">
        <Aurora variant="soft" />
        <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10">
          <Reveal type="up" delay={0}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light text-center mb-5">
              Three cities
            </p>
          </Reveal>
          <Reveal type="clip" delay={120}>
            <h2 className="display-md text-center mb-16 max-w-3xl mx-auto">
              Find us in <em className="italic text-bronze-light">Manchester, Leeds and London</em>.
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {CITIES.map((c, i) => (
              <Reveal key={c.name} type="up" delay={300 + i * 120}>
                <div className="group relative aspect-[3/4] overflow-hidden border border-graphite-line/40 hover:border-bronze/55 transition-colors duration-500">
                  <Image
                    src={c.image}
                    alt={c.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-ink/30 via-ink/50 to-ink/90 transition-opacity duration-500" />
                  <CornerBrackets />
                  <div className="absolute inset-x-0 bottom-0 p-6 lg:p-8">
                    <p className="font-[family-name:var(--font-display)] text-[26px] tracking-[0.02em] text-ivory">
                      {c.name}
                    </p>
                    <p className="font-[family-name:var(--font-editorial)] italic text-[14px] text-bronze-light mt-2">
                      {c.note}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

// ─── Components ──────────────────────────────────────────────────────

function SuccessPanel() {
  return (
    <Reveal type="up" delay={0}>
      <div className="border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 lg:p-14 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-6">
          <Check size={24} strokeWidth={1.5} className="text-bronze-light" />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
          Received
        </p>
        <h2 className="display-md mb-6">Your note has reached us.</h2>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-relaxed max-w-md mx-auto">
          The team will write back personally. In the meantime — quiet evenings on the calendar at
          all three clubs.
        </p>
      </div>
    </Reveal>
  )
}

// ─── Subject tiles — single-select checklist ─────────────────────────

function SubjectTiles({
  value,
  onChange,
}: {
  value: EnquiryData['intent_type'] | undefined
  onChange: (v: EnquiryData['intent_type']) => void
}) {
  return (
    <div>
      <label className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze mb-4">
        Subject
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SUBJECT_OPTIONS.map((opt) => {
          const on = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={on}
              className={cn(
                'group relative flex items-center gap-4 px-5 py-3.5 border text-left transition-all duration-300',
                on
                  ? 'border-bronze bg-bronze/10 shadow-[0_0_22px_-10px_rgba(192,152,112,0.6)]'
                  : 'border-graphite-line/70 bg-graphite/30 hover:border-bronze/55 hover:bg-bronze/5',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'shrink-0 w-4 h-4 flex items-center justify-center border transition-all duration-300',
                  on
                    ? 'bg-bronze border-bronze'
                    : 'border-graphite-line/80 group-hover:border-bronze/60',
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
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Contact row ────────────────────────────────────────────────────

function ContactRow({
  icon: Icon,
  label,
  href,
  value,
}: {
  icon: typeof Mail
  label: string
  href?: string
  value: string
}) {
  const inner = (
    <>
      <div className="w-10 h-10 rounded-full bg-bronze/10 border border-bronze/30 flex items-center justify-center flex-shrink-0">
        <Icon size={14} strokeWidth={1.5} className="text-bronze-light" />
      </div>
      <div className="min-w-0">
        <span className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze">
          {label}
        </span>
        <span className="block mt-1 text-[14.5px] text-ivory break-words">{value}</span>
      </div>
    </>
  )
  return (
    <li>
      {href ? (
        <a
          href={href}
          className="group flex items-center gap-4 hover:text-bronze-light transition-colors"
        >
          {inner}
        </a>
      ) : (
        <div className="flex items-center gap-4">{inner}</div>
      )}
    </li>
  )
}

// ─── Corner brackets ────────────────────────────────────────────────

function CornerBrackets() {
  return (
    <>
      <span aria-hidden className="absolute top-3 left-3 w-4 h-px bg-ivory/50" />
      <span aria-hidden className="absolute top-3 left-3 w-px h-4 bg-ivory/50" />
      <span aria-hidden className="absolute top-3 right-3 w-4 h-px bg-ivory/50" />
      <span aria-hidden className="absolute top-3 right-3 w-px h-4 bg-ivory/50" />
      <span aria-hidden className="absolute bottom-3 left-3 w-4 h-px bg-ivory/50" />
      <span aria-hidden className="absolute bottom-3 left-3 w-px h-4 bg-ivory/50" />
      <span aria-hidden className="absolute bottom-3 right-3 w-4 h-px bg-ivory/50" />
      <span aria-hidden className="absolute bottom-3 right-3 w-px h-4 bg-ivory/50" />
    </>
  )
}

// ─── PremiumPillButton ──────────────────────────────────────────────

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
