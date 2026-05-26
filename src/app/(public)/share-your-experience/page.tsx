'use client'

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase/client'
import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { ArrowUpRight, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fireBronzeConfetti } from '@/lib/effects/confetti'

// /share-your-experience — review submission form.
//
// Same editorial vocabulary as /contact-us:
//   • Hero (CMS-driven via hero_slides slug='share-your-experience')
//   • Form chapter on Aurora background
//   • Underline-style inputs to match the rest of the site
//   • Premium bronze pill button as CTA
//   • Confetti + thank-you card on submit
//
// Reviews land as `status='pending'` in the DB; nothing publishes
// until an admin approves in /dashboard/reviews. RLS allows anonymous
// inserts but only with pending/active flags, never pre-approved.

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
  eyebrow: 'Members & Guests',
  headline: 'Share your experience.',
  lede: 'A few honest lines about your evening with us — read by the team, and (if you allow) shared with future members.',
}

interface EventOption {
  id: string
  title: string
}

const reviewSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Please enter a valid email'),
  company: z.string().optional(),
  title: z.string().optional(),
  event_id: z.string().optional(),
  body: z.string().min(80, 'A few more lines, please — at least 80 characters'),
})
type ReviewData = z.infer<typeof reviewSchema>

export default function ShareYourExperiencePage() {
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hero, setHero] = useState<HeroData>(HERO_FALLBACK)
  const [events, setEvents] = useState<EventOption[]>([])

  // Hero from CMS (optional — fallback above renders if no row).
  useEffect(() => {
    let cancelled = false
    supabase
      .from('hero_slides')
      .select(
        'media_type, image_url, alt_text, video_url, video_poster_url, eyebrow, headline, lede',
      )
      .eq('page_slug', 'share-your-experience')
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

  // Past + recent events for the optional dropdown. Limit to the
  // last 30 so the picker is small enough to scan quickly.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('events')
      .select('id, title, start_date')
      .in('status', ['published', 'live', 'completed'])
      .order('start_date', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (cancelled || !data) return
        setEvents(
          data.map((e) => ({ id: e.id as string, title: e.title as string })),
        )
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
  } = useForm<ReviewData>({
    resolver: zodResolver(reviewSchema),
    mode: 'onChange',
  })

  async function onSubmit(data: ReviewData) {
    setError(null)
    const { error: err } = await supabase.from('reviews').insert({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email.toLowerCase().trim(),
      company: data.company || null,
      title: data.title || null,
      event_id: data.event_id || null,
      body: data.body,
      // Defaults (status='pending', is_active=true) are enforced by
      // the RLS insert policy.
    })
    if (err) {
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

      {/* ── Form ───────────────────────────────────────────────────── */}
      {/* Theme-aware: cream surface + dark editorial type in day mode,
          ink + ivory in night mode. The underline inputs use brand
          tokens (text-ivory remaps to deep ink, border-graphite-line
          to cream-bordered) so they read in both palettes. */}
      <Chapter density="tight" bg="ink" className="relative">
        <Aurora variant="soft" />
        <div className="relative z-10 max-w-3xl mx-auto">
          {submitted ? (
            <SuccessPanel />
          ) : (
            <>
              <Reveal type="clip" delay={0}>
                <h2 className="display-md text-center">A few lines.</h2>
              </Reveal>
              <Reveal type="up" delay={200}>
                <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft text-center mt-5 mb-12 max-w-xl mx-auto">
                  Your review is read by the team first. With your permission, we may share it on our public page.
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
                    <Field
                      label="Company (optional)"
                      {...register('company')}
                    />
                  </div>
                </Reveal>

                <Reveal type="up" delay={160}>
                  <Field label="Title or role (optional)" {...register('title')} />
                </Reveal>

                {events.length > 0 && (
                  <Reveal type="up" delay={220}>
                    <Controller
                      name="event_id"
                      control={control}
                      render={({ field }) => (
                        <EventSelect
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          events={events}
                        />
                      )}
                    />
                  </Reveal>
                )}

                <Reveal type="up" delay={300}>
                  <Field
                    label="Your review"
                    as="textarea"
                    rows={6}
                    placeholder="What stayed with you about your evening with The Club…"
                    error={errors.body?.message}
                    {...register('body')}
                  />
                </Reveal>

                {error && (
                  <div className="px-4 py-3 border border-plum-light/40 bg-plum/30 text-[13px] text-ivory">
                    {error}
                  </div>
                )}

                <Reveal type="up" delay={380} className="pt-4 text-center">
                  <PremiumPillButton type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Sending…' : 'Share your review'}
                  </PremiumPillButton>
                  <p className="mt-6 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze">
                    Reviews are moderated before they appear on{' '}
                    <Link href="/reviews" className="text-bronze-light hover:text-ivory transition-colors">
                      /reviews
                    </Link>
                    .
                  </p>
                </Reveal>
              </form>
            </>
          )}
        </div>
      </Chapter>
    </>
  )
}

// ─── SuccessPanel ────────────────────────────────────────────────────

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
        <h2 className="display-md mb-6">Thank you for sharing.</h2>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-relaxed max-w-md mx-auto">
          The team reads every review. With your permission, we may share yours on{' '}
          <Link href="/reviews" className="text-bronze-light hover:text-ivory underline decoration-bronze/40 hover:decoration-bronze underline-offset-4 transition-colors">
            our reviews page
          </Link>{' '}
          alongside other members.
        </p>
      </div>
    </Reveal>
  )
}

// ─── Event select ────────────────────────────────────────────────────
//
// Custom listbox — the native <select> on Windows opens the OS picker,
// which renders with a bright blue highlight and stark white menu that
// clashes badly with the editorial dark surface. This replacement keeps
// the same underline trigger but opens a styled panel: graphite-2 base,
// bronze hairline, bronze highlight on hover/keyboard focus, soft check
// glyph on the active row. Fully keyboard-accessible (↑/↓/Enter/Esc),
// closes on outside click.

function EventSelect({
  value,
  onChange,
  events,
}: {
  value: string
  onChange: (v: string) => void
  events: EventOption[]
}) {
  const PLACEHOLDER = '— A general review of The Club —'
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  // Items array prefixed with the "general review" placeholder so it
  // behaves identically to the other options in the keyboard nav loop.
  const items = [{ id: '', title: PLACEHOLDER }, ...events]
  const selected = items.find((i) => i.id === value) ?? items[0]

  // Portal target is only available client-side.
  useEffect(() => {
    setMounted(true)
  }, [])

  // Measure trigger position whenever the panel opens, and keep it
  // pinned on scroll/resize. We portal the panel to <body>, so its
  // own ancestors no longer matter — but the trigger does move when
  // the page scrolls, so we re-measure on every scroll tick.
  useLayoutEffect(() => {
    if (!open) return
    function measure() {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.bottom + 8, left: r.left, width: r.width })
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open])

  // Outside-click closes panel. We have to check both the trigger
  // and the portaled panel since they're no longer DOM siblings.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Seed highlight to currently-selected row on open.
  useEffect(() => {
    if (!open) return
    const idx = items.findIndex((i) => i.id === value)
    setHighlight(idx >= 0 ? idx : 0)
  }, [open, value, items])

  // Scroll highlighted row into view as the user keyboard-navigates.
  useEffect(() => {
    if (!open || highlight < 0 || !panelRef.current) return
    const row = panelRef.current.children[highlight] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [open, highlight])

  function pick(id: string) {
    onChange(id)
    setOpen(false)
  }

  function onTriggerKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
      case 'ArrowDown':
        e.preventDefault()
        setHighlight((i) => Math.min(i + 1, items.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlight((i) => Math.max(i - 1, 0))
        break
      case 'Home':
        e.preventDefault()
        setHighlight(0)
        break
      case 'End':
        e.preventDefault()
        setHighlight(items.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (highlight >= 0 && highlight < items.length) pick(items[highlight].id)
        break
    }
  }

  return (
    <div>
      <label className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze mb-3">
        Which event was this about? (optional)
      </label>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        className={cn(
          'w-full flex items-center justify-between gap-3 bg-transparent border-b py-3 pr-1 text-[15px] text-ivory text-left outline-none transition-colors cursor-pointer',
          open ? 'border-bronze' : 'border-graphite-line/80 hover:border-graphite-line',
        )}
      >
        <span className={cn('truncate', !selected.id && 'text-ivory-soft')}>
          {selected.title}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            'text-bronze-light shrink-0 transition-transform duration-300',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Portal to <body>:
          1. Escapes the Reveal/GSAP parent's stacking context, so the
             panel actually paints above the form fields below.
          2. `data-lenis-prevent` tells Lenis (smooth-scroll) not to
             intercept wheel/touch events inside the list — without
             this the dropdown can't scroll on a Lenis page. */}
      {mounted && open && rect &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            tabIndex={-1}
            data-lenis-prevent
            style={{
              position: 'fixed',
              top: rect.top,
              left: rect.left,
              width: rect.width,
              zIndex: 1000,
            }}
            className="max-h-72 overflow-y-auto bg-graphite-2 border border-graphite-line/70 shadow-[0_18px_40px_rgba(0,0,0,0.35)] py-1"
          >
            {items.map((item, idx) => {
              const isSelected = item.id === value
              const isHighlighted = idx === highlight
              const isPlaceholder = item.id === ''
              return (
                <div
                  key={item.id || '__placeholder'}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => pick(item.id)}
                  className={cn(
                    'px-4 py-2.5 text-[14px] cursor-pointer transition-colors flex items-center gap-2',
                    isPlaceholder ? 'text-ivory-soft italic' : 'text-ivory',
                    isHighlighted && 'bg-bronze/15 text-bronze-light',
                    isSelected && !isHighlighted && 'text-bronze-light',
                  )}
                >
                  <Check
                    size={12}
                    strokeWidth={2}
                    className={cn(
                      'shrink-0 text-bronze-light transition-opacity',
                      isSelected ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{item.title}</span>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}

// ─── PremiumPillButton (matches /contact-us) ────────────────────────

function PremiumPillButton({
  children,
  type = 'button',
  disabled,
}: {
  children: React.ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  return (
    <button
      type={type}
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

// ─── Field (underline input + textarea, same as contact-us) ─────────

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
