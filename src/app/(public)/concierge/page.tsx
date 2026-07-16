'use client'

import { forwardRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase/client'
import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { ArrowUpRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fireBronzeConfetti } from '@/lib/effects/confetti'

// ─────────────────────────────────────────────────────────────────────
// /concierge — public concierge enquiry form for non-logged-in visitors.
//
// Doc requirement (Lead Automation): "Public concierge enquiry form
// available on website" — a website concierge enquiry creates a CRM
// record. It does exactly that by inserting into the SAME `enquiries`
// table the contact form uses (public-insert RLS lets anonymous visitors
// submit; `concierge_requests` requires a member and cannot). The
// enquiry then shows up on the admin Enquiries page with intent
// ['concierge'].
//
// Built on the exact contact-us pattern: react-hook-form + zodResolver,
// underline Fields, the bronze PremiumPillButton, the same hero + Aurora
// chapter vocabulary. Concierge specifics (request type, budget, dates,
// guests, details) are composed into the enquiry `message` — no new
// columns, no migration.
// ─────────────────────────────────────────────────────────────────────

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
  eyebrow: 'Concierge',
  headline: 'Tell us what you’re after.',
  lede: 'F1 and Wimbledon to private aviation and the impossible dinner reservation — send the details and the team takes it from there.',
}

const REQUEST_TYPES = [
  'F1',
  'Wimbledon',
  'Royal Ascot',
  'Monaco GP',
  'Henley',
  'Hotels',
  'Restaurants',
  'Private Aviation',
  'Fashion Weeks',
  'International Travel',
  'Travel',
  'Luxury Goods',
  'Private Events',
  'Other',
] as const

const enquirySchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().optional(),
  company: z.string().optional(),
  request_type: z.enum(REQUEST_TYPES, { error: 'Please choose what you need' }),
  budget: z.string().optional(),
  dates: z.string().optional(),
  guests: z.string().optional(),
  details: z.string().min(10, 'Please share a few more lines'),
})
type EnquiryData = z.infer<typeof enquirySchema>

// Compose the concierge specifics into the enquiry message. The
// `enquiries` table has no request_type/budget/dates columns, so we fold
// them into `message` in a readable, staff-friendly format.
function composeMessage(data: EnquiryData): string {
  const lines = [`Request type: ${data.request_type}`]
  if (data.budget?.trim()) lines.push(`Budget: ${data.budget.trim()}`)
  if (data.dates?.trim()) lines.push(`Dates: ${data.dates.trim()}`)
  if (data.guests?.trim()) lines.push(`Guests: ${data.guests.trim()}`)
  lines.push('', 'Details:', data.details.trim())
  return lines.join('\n')
}

export default function ConciergePage() {
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
      .eq('page_slug', 'concierge')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setHero({
          media_type: (data.media_type as 'image' | 'video') ?? 'image',
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
    mode: 'onChange',
  })

  async function onSubmit(data: EnquiryData) {
    setError(null)
    // Route through the server intake (scoring + owner routing + ack email +
    // sales task) rather than a bare browser insert into `enquiries`.
    try {
      const res = await fetch('/api/enquiries/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          phone: data.phone?.trim() || null,
          company: data.company?.trim() || null,
          message: composeMessage(data),
          intent: ['concierge'],
          source: 'concierge_form',
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean }
      if (!res.ok || !json.ok) {
        setError('Something went wrong. Please try again, or email us directly.')
        return
      }
    } catch {
      setError('Something went wrong. Please try again, or email us directly.')
      return
    }
    setSubmitted(true)
    void fireBronzeConfetti()
  }

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative h-[60vh] min-h-[440px] w-full always-night overflow-hidden bg-ink">
        <PageHeroMedia
          mediaType={hero.media_type}
          imageUrl={hero.image_url}
          alt={hero.alt_text}
          videoUrl={hero.video_url}
          videoPosterUrl={hero.video_poster_url}
          overlay={0.55}
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-[45%] hero-fade-bottom pointer-events-none" />
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
                  <h2 className="display-md">The details.</h2>
                </Reveal>
                <Reveal type="up" delay={200}>
                  <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft mt-5 mb-12">
                    A few lines is enough to start — the team will follow up personally.
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

                  {/* Request type — single-select tiles, matching the
                      contact form's subject vocabulary. */}
                  <Reveal type="up" delay={240}>
                    <Controller
                      name="request_type"
                      control={control}
                      render={({ field }) => (
                        <RequestTiles value={field.value} onChange={field.onChange} />
                      )}
                    />
                    {errors.request_type?.message && (
                      <p className="mt-3 text-[12px] text-bronze-light italic">
                        {errors.request_type.message}
                      </p>
                    )}
                  </Reveal>

                  <Reveal type="up" delay={300}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <Field label="Budget (optional)" placeholder="e.g. £10,000" {...register('budget')} />
                      <Field label="Dates (optional)" placeholder="e.g. 5–7 July" {...register('dates')} />
                      <Field label="Guests (optional)" placeholder="e.g. 4" {...register('guests')} />
                    </div>
                  </Reveal>

                  <Reveal type="up" delay={360}>
                    <Field
                      label="What you’re after"
                      as="textarea"
                      rows={6}
                      placeholder="The details that matter — what you’re looking for, any preferences."
                      error={errors.details?.message}
                      {...register('details')}
                    />
                  </Reveal>

                  {error && (
                    <div className="px-4 py-3 border border-plum-light/40 bg-plum/30 text-[13px] text-ivory">
                      {error}
                    </div>
                  )}

                  <Reveal type="up" delay={440} className="pt-4">
                    <PremiumPillButton type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Sending…' : 'Send the enquiry'}
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
                  What we handle
                </p>
                <p className="font-[family-name:var(--font-editorial)] italic text-[17px] text-ivory-soft leading-relaxed">
                  Sporting occasions, hotels and restaurants, private aviation, fashion weeks,
                  international travel, luxury goods and private events — if it can be arranged, we
                  will arrange it.
                </p>
              </div>
            </Reveal>

            <Reveal type="up" delay={350}>
              <div className="border-t border-graphite-line/60 pt-10">
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
                  Already a Member?
                </p>
                <p className="font-[family-name:var(--font-editorial)] italic text-[17px] text-ivory-soft leading-relaxed">
                  Members raise concierge requests inside the portal — you&apos;ll find a faster
                  reply there.
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
          </aside>
        </div>
      </Chapter>
    </>
  )
}

// ─── Components ──────────────────────────────────────────────────────

function SuccessPanel() {
  return (
    <Reveal type="up" delay={0}>
      <div className="border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 lg:p-14 text-center day:bg-white day:shadow-lg">
        <div className="w-14 h-14 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-6">
          <Check size={24} strokeWidth={1.5} className="text-bronze-light" />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
          Received
        </p>
        <h2 className="display-md mb-6">Your enquiry has reached us.</h2>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-relaxed max-w-md mx-auto">
          The concierge team will be in touch personally to take the next steps.
        </p>
      </div>
    </Reveal>
  )
}

// ─── Request-type tiles — single-select checklist ────────────────────

function RequestTiles({
  value,
  onChange,
}: {
  value: EnquiryData['request_type'] | undefined
  onChange: (v: EnquiryData['request_type']) => void
}) {
  return (
    <div>
      <label className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze mb-4">
        What do you need
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {REQUEST_TYPES.map((opt) => {
          const on = value === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              aria-pressed={on}
              className={cn(
                'group relative flex items-center gap-3 px-4 py-3 border text-left transition-all duration-300',
                on
                  ? 'border-bronze bg-bronze/10 shadow-[0_0_22px_-10px_rgba(192,152,112,0.6)]'
                  : 'border-graphite-line/70 bg-graphite/30 hover:border-bronze/55 hover:bg-bronze/5 day:bg-white day:border-graphite-line/55 day:shadow-sm day:hover:border-bronze/55 day:hover:bg-bronze/5',
              )}
            >
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
                  'font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.16em] transition-colors duration-300',
                  on ? 'text-bronze-light' : 'text-ivory-soft group-hover:text-ivory',
                )}
              >
                {opt}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── PremiumPillButton ──────────────────────────────────────────────

interface PremiumPillButtonProps {
  children: React.ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
}

function PremiumPillButton({ children, type = 'button', disabled, onClick }: PremiumPillButtonProps) {
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
