'use client'

import { forwardRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase/client'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { ArrowUpRight, Mail, MapPin, Phone, Check } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────
// Contact — minimal enquiry form on a dark editorial spread.
//
// Structure:
//   00 Hero        — photograph + display title
//   01 Form + meta — split layout: form left, contact details right
//                    over a soft aurora glow
//   02 Locations   — brief address card for One London Road
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1604079628040-94301bb21b91?auto=format&fit=crop&w=2400&q=85'

const INTENT_OPTIONS = [
  { value: 'general', label: 'A general enquiry' },
  { value: 'membership', label: 'About membership' },
  { value: 'event', label: 'An upcoming event' },
  { value: 'private_event', label: 'Hosting a private event' },
  { value: 'press', label: 'Press / media' },
]

const enquirySchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  company: z.string().optional(),
  intent_type: z.string(),
  message: z.string().min(10, 'Please provide a few more lines'),
})

type EnquiryData = z.infer<typeof enquirySchema>

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EnquiryData>({
    resolver: zodResolver(enquirySchema),
    defaultValues: { intent_type: 'general' },
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
      {/* ── 00 · Hero ───────────────────────────────────────────────── */}
      <section className="relative h-[60vh] min-h-[440px] w-full overflow-hidden bg-ink">
        <KenBurnsImage
          src={HERO_IMAGE}
          alt="A study at dusk"
          motion="in"
          duration={32}
          overlay={0.6}
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-20">
          <EditorialMeta label="Get in touch" stamp="London" />
          <h1 className="display-xl mt-8 max-w-4xl">Say something useful, briefly.</h1>
          <p className="lede mt-7 max-w-xl">
            We read every message personally and reply within forty-eight hours, often sooner.
          </p>
        </div>
      </section>

      {/* ── 01 · Form + meta ────────────────────────────────────────── */}
      <Chapter density="default" bg="ink" className="relative">
        <Aurora variant="soft" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          {/* Form */}
          <div className="lg:col-span-7">
            {submitted ? (
              <div className="border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-6">
                  <Check size={24} strokeWidth={1.5} className="text-bronze-light" />
                </div>
                <p className="eyebrow mb-5">Received</p>
                <h2 className="display-md mb-5">
                  Thank you. We&apos;ll be in touch.
                </h2>
                <p className="body-prose max-w-md mx-auto">
                  Your note has reached us. We reply personally — usually within forty-eight hours.
                </p>
              </div>
            ) : (
              <>
                <EditorialMeta number="01" label="A short message" />
                <h2 className="display-md mt-10 mb-10">Write to us.</h2>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field
                      label="Email"
                      type="email"
                      error={errors.email?.message}
                      {...register('email')}
                    />
                    <Field label="Phone (optional)" {...register('phone')} />
                  </div>
                  <Field label="Company (optional)" {...register('company')} />

                  <div>
                    <label className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze mb-3">
                      Subject
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {INTENT_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className="cursor-pointer relative"
                        >
                          <input
                            type="radio"
                            value={opt.value}
                            {...register('intent_type')}
                            className="peer sr-only"
                          />
                          <span className="inline-block px-4 py-2 rounded-full border border-graphite-line text-[12px] text-ivory-soft hover:border-bronze/50 hover:text-ivory peer-checked:bg-bronze/15 peer-checked:border-bronze peer-checked:text-bronze-light transition-all duration-300">
                            {opt.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <Field
                    label="Message"
                    as="textarea"
                    rows={6}
                    error={errors.message?.message}
                    {...register('message')}
                  />

                  {error && (
                    <div className="px-4 py-3 border border-plum-light/40 bg-plum/30 text-[13px] text-ivory">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group inline-flex items-center gap-3 px-9 py-4 border border-bronze hover:bg-bronze disabled:opacity-50 disabled:cursor-not-allowed rounded-full font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ivory hover:text-ink transition-all duration-500"
                  >
                    {isSubmitting ? 'Sending…' : 'Send the message'}
                    <ArrowUpRight
                      size={15}
                      strokeWidth={1.5}
                      className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
                    />
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Meta column */}
          <aside className="lg:col-span-5 space-y-12">
            <div>
              <EditorialMeta label="Or write directly" />
              <ul className="mt-8 space-y-5">
                <ContactRow
                  icon={Mail}
                  label="Email"
                  href="mailto:hello@theclubbysarahrestrick.com"
                  value="hello@theclubbysarahrestrick.com"
                />
                <ContactRow
                  icon={Phone}
                  label="Telephone"
                  href="tel:+442012345678"
                  value="+44 20 1234 5678"
                />
                <ContactRow
                  icon={MapPin}
                  label="The club"
                  value="One London Road, London"
                />
              </ul>
            </div>

            <div className="border-t border-graphite-line/60 pt-10">
              <span className="eyebrow-quiet">For Members</span>
              <p className="font-[family-name:var(--font-editorial)] italic text-[17px] text-ivory-soft mt-4 leading-relaxed">
                Concierge requests are handled through the member portal — you&apos;ll get a faster reply there than here.
              </p>
            </div>
          </aside>
        </div>
      </Chapter>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

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
      <div className="w-9 h-9 rounded-full bg-bronze/10 border border-bronze/25 flex items-center justify-center flex-shrink-0">
        <Icon size={13} strokeWidth={1.5} className="text-bronze-light" />
      </div>
      <div>
        <span className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze">
          {label}
        </span>
        <span className="block mt-1 text-[14px] text-ivory">{value}</span>
      </div>
    </>
  )
  return (
    <li>
      {href ? (
        <a
          href={href}
          className="group flex items-start gap-4 hover:text-bronze-light transition-colors"
        >
          {inner}
        </a>
      ) : (
        <div className="flex items-start gap-4">{inner}</div>
      )}
    </li>
  )
}
