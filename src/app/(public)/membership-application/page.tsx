'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase/client'
import { useTheme, themeColors } from '@/components/website/ThemeContext'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const applicationSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().optional(),
  company: z.string().min(1, 'Required'),
  position: z.string().min(1, 'Required'),
  linkedin_url: z.string().optional(),
  preferred_tier: z.string(),
  industry: z.string().optional(),
  referral_source: z.string().optional(),
  bio: z.string().min(10, 'Please tell us a bit more'),
})

type ApplicationData = z.infer<typeof applicationSchema>

const steps = ['About You', 'Your Business', 'Membership']

export default function MembershipApplicationPage() {
  const { mode } = useTheme()
  const dark = themeColors[mode].dark
  const light = themeColors[mode].light
  const sectionRef = useRef<HTMLElement>(null)
  const imageWrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const ctx = gsap.context(() => {
      if (imageWrapRef.current) {
        ScrollTrigger.create({
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => {
            gsap.set(imageWrapRef.current, { y: self.progress * 100 })
          },
        })
      }

      if (contentRef.current) {
        ScrollTrigger.create({
          trigger: sectionRef.current,
          start: 'top top',
          end: '60% top',
          scrub: true,
          onUpdate: (self) => {
            gsap.set(contentRef.current, {
              opacity: 1 - self.progress,
              y: self.progress * 50,
            })
          },
        })
      }

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.fromTo('.app-hero-label', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 })
        .fromTo('.app-hero-headline', { clipPath: 'inset(0 0 100% 0)', y: 30 }, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1 }, '-=0.2')
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  async function nextStep() {
    const fieldsToValidate: (keyof ApplicationData)[][] = [
      ['first_name', 'last_name', 'email', 'phone'],
      ['company', 'position', 'linkedin_url'],
      ['preferred_tier', 'bio'],
    ]
    const valid = await trigger(fieldsToValidate[step])
    if (valid) setStep(step + 1)
  }

  async function onSubmit(data: ApplicationData) {
    setError(null)
    const { error: err } = await supabase
      .from('membership_applications')
      .insert({
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
      setError('Something went wrong. Please try again.')
      return
    }
    setSubmitted(true)
  }

  const inputStyles: React.CSSProperties = {
    backgroundColor: mode === 'evening' ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
    borderColor: light.border,
    color: light.text,
  }

  if (submitted) {
    return (
      <section
        className="min-h-screen flex items-center justify-center px-6 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div className="text-center max-w-lg">
          <div className="w-16 h-16 border border-[#B8975A] rotate-45 mx-auto mb-8 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="-rotate-45">
              <path d="M5 13l4 4L19 7" stroke="#B8975A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl text-white font-light mb-4">
            Application Received
          </h1>
          <p style={{ color: dark.textMuted }} className="leading-relaxed">
            Thank you for your interest in The Club. Our membership team will review your
            application and be in touch within 5 working days.
          </p>
        </div>
      </section>
    )
  }

  return (
    <>
      {/* Hero */}
      <section
        ref={sectionRef}
        className="relative h-[45vh] min-h-[380px] flex items-end overflow-hidden transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }} />

        <div ref={imageWrapRef} className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1582653291997-079a1c04e5a1?w=1920&q=80"
            alt=""
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div
            className="absolute inset-0 transition-all duration-[400ms]"
            style={{ background: `linear-gradient(to top, ${dark.bg}, ${dark.overlay || 'rgba(28,25,23,0.5)'} 50%, transparent)` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        </div>

        <div
          ref={contentRef}
          className="relative max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24 pb-16 md:pb-20 w-full"
        >
          <span
            className="app-hero-label font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block"
            style={{ opacity: 0 }}
          >
            Apply
          </span>
          <h1
            className="app-hero-headline font-[family-name:var(--font-heading)] text-4xl md:text-5xl lg:text-6xl font-light text-white leading-[1.1]"
            style={{ clipPath: 'inset(0 0 100% 0)' }}
          >
            Become a Member
          </h1>
        </div>
      </section>

      {/* Form */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: light.bg }}
      >
        <div className="max-w-2xl mx-auto px-6 md:px-16 lg:px-24">
          {/* Progress */}
          <div className="flex items-center justify-between mb-12">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 flex items-center justify-center text-xs font-medium border transition-colors"
                  style={{
                    borderColor: i <= step ? '#B8975A' : light.border,
                    color: i <= step ? '#B8975A' : light.textDim,
                  }}
                >
                  {i + 1}
                </div>
                <span
                  className="text-sm hidden md:block transition-colors duration-[400ms]"
                  style={{ color: i <= step ? light.text : light.textDim }}
                >
                  {s}
                </span>
                {i < steps.length - 1 && (
                  <div
                    className="w-12 lg:w-20 h-px"
                    style={{ backgroundColor: i < step ? '#B8975A' : light.border }}
                  />
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Step 1: About You */}
            {step === 0 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: light.textMuted }}>First Name *</label>
                    <input {...register('first_name')} className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors" style={inputStyles} />
                    {errors.first_name && <p className="text-xs text-[#C4694A] mt-1">{errors.first_name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: light.textMuted }}>Last Name *</label>
                    <input {...register('last_name')} className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors" style={inputStyles} />
                    {errors.last_name && <p className="text-xs text-[#C4694A] mt-1">{errors.last_name.message}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: light.textMuted }}>Email *</label>
                  <input type="email" {...register('email')} className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors" style={inputStyles} />
                  {errors.email && <p className="text-xs text-[#C4694A] mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: light.textMuted }}>Phone</label>
                  <input type="tel" {...register('phone')} className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors" style={inputStyles} />
                </div>
              </div>
            )}

            {/* Step 2: Business */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: light.textMuted }}>Company *</label>
                  <input {...register('company')} className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors" style={inputStyles} />
                  {errors.company && <p className="text-xs text-[#C4694A] mt-1">{errors.company.message}</p>}
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: light.textMuted }}>Job Title / Position *</label>
                  <input {...register('position')} className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors" style={inputStyles} />
                  {errors.position && <p className="text-xs text-[#C4694A] mt-1">{errors.position.message}</p>}
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: light.textMuted }}>LinkedIn Profile</label>
                  <input {...register('linkedin_url')} placeholder="https://linkedin.com/in/..." className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors placeholder:text-[#A09A93]" style={inputStyles} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: light.textMuted }}>Industry</label>
                  <select {...register('industry')} className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors" style={inputStyles}>
                    <option value="">Select industry</option>
                    <option value="technology">Technology</option>
                    <option value="finance">Finance &amp; Investment</option>
                    <option value="property">Property &amp; Real Estate</option>
                    <option value="professional-services">Professional Services</option>
                    <option value="hospitality">Hospitality &amp; Leisure</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="creative">Creative &amp; Media</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 3: Membership */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs uppercase tracking-wider mb-3" style={{ color: light.textMuted }}>Membership Tier *</label>
                  <div className="space-y-3">
                    {[
                      { value: 'individual', label: 'Individual \u2014 \u00A32,500/year' },
                      { value: 'business', label: 'Business \u2014 \u00A315,000/year' },
                      { value: 'partner', label: 'Partner \u2014 \u00A330,000/year' },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className="flex items-center gap-3 p-4 border cursor-pointer hover:border-[#B8975A] transition-colors"
                        style={{
                          borderColor: light.border,
                          backgroundColor: mode === 'evening' ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                        }}
                      >
                        <input type="radio" value={opt.value} {...register('preferred_tier')} className="accent-[#B8975A]" />
                        <span className="text-sm" style={{ color: light.text }}>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: light.textMuted }}>How did you hear about us?</label>
                  <input {...register('referral_source')} className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors" style={inputStyles} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: light.textMuted }}>Why do you want to join The Club? *</label>
                  <textarea {...register('bio')} rows={4} className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors resize-none" style={inputStyles} />
                  {errors.bio && <p className="text-xs text-[#C4694A] mt-1">{errors.bio.message}</p>}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-[#C4694A]">{error}</p>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="text-sm hover:text-[#B8975A] transition-colors"
                  style={{ color: light.textMuted }}
                >
                  Back
                </button>
              ) : (
                <div />
              )}

              {step < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="px-8 py-3.5 text-white text-sm font-medium tracking-[0.1em] transition-colors"
                  style={{ backgroundColor: mode === 'evening' ? '#B8975A' : '#1A1714' }}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-8 py-3.5 bg-[#B8975A] hover:bg-[#D4B978] text-white text-sm font-medium tracking-[0.1em] transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Application'}
                </button>
              )}
            </div>
          </form>
        </div>
      </section>
    </>
  )
}
