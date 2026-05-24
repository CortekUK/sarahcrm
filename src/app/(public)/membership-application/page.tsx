'use client'

import { forwardRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase/client'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { ArrowLeft, ArrowUpRight, Check } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────
// Membership Application — three-step editorial form.
//
// Step 1: About you  (first/last/email/phone)
// Step 2: Your work  (company/position/linkedin/industry)
// Step 3: Your story (preferred tier + bio + referral)
//
// Same Sora/Playfair editorial vocabulary as the rest of the site, but
// the entire flow lives on one page — three slides revealed in
// sequence, validated per-step. On submit, we insert into
// membership_applications and show a confirmation panel.
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=2400&q=85'

const applicationSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().optional(),
  company: z.string().min(1, 'Required'),
  position: z.string().min(1, 'Required'),
  linkedin_url: z.string().optional(),
  industry: z.string().optional(),
  preferred_tier: z.string(),
  referral_source: z.string().optional(),
  bio: z.string().min(20, 'Please share a few lines'),
})
type ApplicationData = z.infer<typeof applicationSchema>

const TIER_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'business', label: 'Business' },
  { value: 'unsure', label: 'Not yet sure' },
]

const STEPS = [
  { n: '01', label: 'About You' },
  { n: '02', label: 'Your Work' },
  { n: '03', label: 'Your Story' },
]

export default function MembershipApplicationPage() {
  const [step, setStep] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationData>({
    resolver: zodResolver(applicationSchema),
    defaultValues: { preferred_tier: 'individual' },
  })

  async function nextStep() {
    const fields: (keyof ApplicationData)[][] = [
      ['first_name', 'last_name', 'email', 'phone'],
      ['company', 'position', 'linkedin_url', 'industry'],
      ['preferred_tier', 'bio'],
    ]
    const valid = await trigger(fields[step])
    if (valid) setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  async function onSubmit(data: ApplicationData) {
    setError(null)
    const { error: err } = await supabase.from('membership_applications').insert({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone || null,
      company: data.company || null,
      position: data.position || null,
      linkedin_url: data.linkedin_url || null,
      preferred_tier: data.preferred_tier,
      industry: data.industry || null,
      referral_source: data.referral_source || null,
      bio: data.bio || null,
    })
    if (err) {
      setError('Something went wrong. Please try again, or email us directly.')
      return
    }
    setSubmitted(true)
  }

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative h-[55vh] min-h-[400px] w-full overflow-hidden bg-ink">
        <KenBurnsImage
          src={HERO_IMAGE}
          alt="A handwritten application card on a wooden desk"
          motion="in"
          duration={32}
          overlay={0.6}
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-20">
          <EditorialMeta label="Apply for Membership" stamp="Five minutes" />
          <h1 className="display-xl mt-8 max-w-4xl">
            A few questions, written carefully.
          </h1>
          <p className="lede mt-7 max-w-xl">
            We read every application personally. Five minutes well-spent here saves both of us a half-hour later.
          </p>
        </div>
      </section>

      {/* ── Application ─────────────────────────────────────────────── */}
      <Chapter density="default" bg="ink" className="relative">
        <Aurora variant="soft" />

        <div className="relative z-10 max-w-3xl mx-auto">
          {submitted ? (
            <div className="border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 lg:p-16 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-7">
                <Check size={28} strokeWidth={1.5} className="text-bronze-light" />
              </div>
              <p className="eyebrow mb-6">Received with thanks</p>
              <h2 className="display-md mb-6">
                Your application has reached us.
              </h2>
              <p className="body-prose max-w-md mx-auto mb-2">
                We read every application personally. If your story reads, we&apos;ll write back to set up a short conversation — usually within seven days.
              </p>
              <p className="font-[family-name:var(--font-editorial)] italic text-ivory-soft mt-8">
                — Sarah
              </p>
            </div>
          ) : (
            <>
              {/* Step indicator */}
              <div className="flex items-center justify-center gap-6 mb-16">
                {STEPS.map((s, i) => (
                  <div
                    key={s.n}
                    className={`flex items-center gap-3 ${
                      i === step ? 'text-bronze-light' : i < step ? 'text-ivory-soft/60' : 'text-slate-dim'
                    }`}
                  >
                    <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] tabular-nums">
                      {s.n}
                    </span>
                    <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em]">
                      {s.label}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span className={`h-px w-10 ${i < step ? 'bg-bronze/40' : 'bg-graphite-line'}`} />
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-7">
                {step === 0 && (
                  <>
                    <EditorialMeta number={STEPS[0].n} label={STEPS[0].label} />
                    <h2 className="display-md mt-8 mb-10">Tell us who you are.</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="First name" error={errors.first_name?.message} {...register('first_name')} />
                      <Field label="Last name" error={errors.last_name?.message} {...register('last_name')} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="Email" type="email" error={errors.email?.message} {...register('email')} />
                      <Field label="Phone (optional)" {...register('phone')} />
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <EditorialMeta number={STEPS[1].n} label={STEPS[1].label} />
                    <h2 className="display-md mt-8 mb-10">Tell us what you do.</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="Company" error={errors.company?.message} {...register('company')} />
                      <Field label="Role" error={errors.position?.message} {...register('position')} />
                    </div>
                    <Field label="Industry" placeholder="e.g. Finance, technology, hospitality" {...register('industry')} />
                    <Field label="LinkedIn (optional)" placeholder="https://" {...register('linkedin_url')} />
                  </>
                )}

                {step === 2 && (
                  <>
                    <EditorialMeta number={STEPS[2].n} label={STEPS[2].label} />
                    <h2 className="display-md mt-8 mb-10">Tell us what you&apos;re hoping for.</h2>

                    <div>
                      <label className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze mb-4">
                        Membership type
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {TIER_OPTIONS.map((opt) => (
                          <label key={opt.value} className="cursor-pointer relative">
                            <input
                              type="radio"
                              value={opt.value}
                              {...register('preferred_tier')}
                              className="peer sr-only"
                            />
                            <span className="inline-block px-5 py-2.5 rounded-full border border-graphite-line text-[12px] text-ivory-soft hover:border-bronze/50 hover:text-ivory peer-checked:bg-bronze/15 peer-checked:border-bronze peer-checked:text-bronze-light transition-all duration-300">
                              {opt.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <Field
                      label="A few lines about yourself"
                      as="textarea"
                      rows={6}
                      placeholder="What you do, what you're curious about, what brings you to The Club."
                      error={errors.bio?.message}
                      {...register('bio')}
                    />

                    <Field
                      label="Who introduced you to us? (Optional)"
                      placeholder="A member, a friend, a piece of press…"
                      {...register('referral_source')}
                    />
                  </>
                )}

                {error && (
                  <div className="px-4 py-3 border border-plum-light/40 bg-plum/30 text-[13px] text-ivory">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between pt-8 border-t border-graphite-line/60">
                  <div>
                    {step > 0 && (
                      <button
                        type="button"
                        onClick={() => setStep((s) => s - 1)}
                        className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light transition-colors duration-300"
                      >
                        <ArrowLeft size={13} strokeWidth={1.5} />
                        Back
                      </button>
                    )}
                  </div>

                  {step < STEPS.length - 1 ? (
                    <button
                      type="button"
                      onClick={nextStep}
                      className="group inline-flex items-center gap-3 px-8 py-3.5 border border-bronze hover:bg-bronze rounded-full font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ivory hover:text-ink transition-all duration-500"
                    >
                      Continue
                      <ArrowUpRight
                        size={14}
                        strokeWidth={1.5}
                        className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
                      />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="group inline-flex items-center gap-3 px-8 py-3.5 border border-bronze hover:bg-bronze disabled:opacity-50 disabled:cursor-not-allowed rounded-full font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ivory hover:text-ink transition-all duration-500"
                    >
                      {isSubmitting ? 'Sending…' : 'Submit application'}
                      <ArrowUpRight
                        size={14}
                        strokeWidth={1.5}
                        className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
                      />
                    </button>
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

// ─── Field (same shape as on contact page) ────────────────────────────

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
