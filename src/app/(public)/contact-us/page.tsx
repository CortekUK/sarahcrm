'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase/client'
import { useTheme, themeColors } from '@/components/website/ThemeContext'
import { useReveal } from '@/components/website/home/useReveal'
import { MagneticButton } from '@/components/website/MagneticButton'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const enquirySchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  company: z.string().optional(),
  intent_type: z.string(),
  message: z.string().min(10, 'Please provide more detail'),
})

type EnquiryData = z.infer<typeof enquirySchema>

export default function ContactPage() {
  const { mode } = useTheme()
  const dark = themeColors[mode].dark
  const light = themeColors[mode].light
  const warm = themeColors[mode].warm
  const sectionRef = useRef<HTMLElement>(null)
  const imageWrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const formReveal = useReveal({ threshold: 0.05, y: 40 })
  const helpReveal = useReveal({ threshold: 0.1, y: 30 })
  const locationReveal = useReveal({ threshold: 0.1, y: 30 })
  const ctaReveal = useReveal(0.2)
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
      tl.fromTo('.contact-hero-label', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 })
        .fromTo('.contact-hero-headline', { clipPath: 'inset(0 0 100% 0)', y: 30 }, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1 }, '-=0.2')
        .fromTo('.contact-hero-sub', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  async function onSubmit(data: EnquiryData) {
    setError(null)
    const { intent_type, ...rest } = data
    const { error: err } = await supabase
      .from('enquiries')
      .insert({ ...rest, intent: [intent_type] })

    if (err) {
      setError('Something went wrong. Please try again.')
      return
    }
    setSubmitted(true)
  }

  const inputStyles: React.CSSProperties = {
    backgroundColor: mode === 'evening' ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
    borderColor: warm.border,
    color: warm.text,
  }

  return (
    <>
      {/* ═══════════════════════════════════════
          HERO
      ═══════════════════════════════════════ */}
      <section
        ref={sectionRef}
        className="relative h-[60vh] min-h-[500px] flex items-end overflow-hidden transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }} />

        <div ref={imageWrapRef} className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80"
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
            className="contact-hero-label font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block"
            style={{ opacity: 0 }}
          >
            Contact
          </span>
          <h1
            className="contact-hero-headline font-[family-name:var(--font-heading)] text-4xl md:text-5xl lg:text-6xl font-light text-white leading-[1.1]"
            style={{ clipPath: 'inset(0 0 100% 0)' }}
          >
            Get in touch
          </h1>
          <p
            className="contact-hero-sub mt-5 text-lg text-white/60 max-w-md"
            style={{ opacity: 0 }}
          >
            We&apos;d love to hear from you.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          FORM + CONTACT INFO
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={formReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
            {/* Info */}
            <div className="lg:col-span-4">
              <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
                Reach Out
              </span>
              <h2
                className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-light mb-6 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                We&apos;d love to hear from you
              </h2>
              <p
                className="text-[0.95rem] leading-[1.85] mb-10 transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                Whether you&apos;re interested in membership, have a private event
                enquiry, or simply want to learn more about The Club, we&apos;re here to help.
              </p>

              <div className="space-y-6">
                <div>
                  <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.2em] text-[#B8975A] block mb-1">
                    Email
                  </span>
                  <a
                    href="mailto:hello@theclubsarahrestrick.com"
                    className="text-sm hover:text-[#B8975A] transition-colors"
                    style={{ color: warm.text }}
                  >
                    hello@theclubsarahrestrick.com
                  </a>
                </div>
                <div>
                  <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.2em] text-[#B8975A] block mb-1">
                    Phone
                  </span>
                  <a
                    href="tel:+447880351645"
                    className="text-sm hover:text-[#B8975A] transition-colors"
                    style={{ color: warm.text }}
                  >
                    +44 7880 351 645
                  </a>
                </div>
                <div>
                  <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.2em] text-[#B8975A] block mb-1">
                    Social
                  </span>
                  <div className="flex gap-5">
                    <a href="https://www.instagram.com/theclubsarahrestrick/" target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[#B8975A] transition-colors" style={{ color: warm.text }}>Instagram</a>
                    <a href="https://www.linkedin.com/company/the-club-by-sarah-restrick/" target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[#B8975A] transition-colors" style={{ color: warm.text }}>LinkedIn</a>
                  </div>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-7 lg:col-start-6">
              {submitted ? (
                <div
                  className="p-12 text-center transition-colors duration-[400ms]"
                  style={{
                    backgroundColor: mode === 'evening' ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                    border: `1px solid ${warm.border}`,
                  }}
                >
                  <div className="w-12 h-12 border border-[#B8975A] rotate-45 mx-auto mb-6 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="-rotate-45">
                      <path d="M5 13l4 4L19 7" stroke="#B8975A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h3
                    className="font-[family-name:var(--font-heading)] text-xl mb-2 transition-colors duration-[400ms]"
                    style={{ color: warm.text }}
                  >
                    Message Sent
                  </h3>
                  <p className="text-sm transition-colors duration-[400ms]" style={{ color: warm.textMuted }}>
                    We&apos;ll be in touch shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: warm.textMuted }}>First Name *</label>
                      <input
                        {...register('first_name')}
                        className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors"
                        style={inputStyles}
                      />
                      {errors.first_name && <p className="text-xs text-[#C4694A] mt-1">{errors.first_name.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: warm.textMuted }}>Last Name *</label>
                      <input
                        {...register('last_name')}
                        className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors"
                        style={inputStyles}
                      />
                      {errors.last_name && <p className="text-xs text-[#C4694A] mt-1">{errors.last_name.message}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: warm.textMuted }}>Email *</label>
                    <input
                      type="email"
                      {...register('email')}
                      className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors"
                      style={inputStyles}
                    />
                    {errors.email && <p className="text-xs text-[#C4694A] mt-1">{errors.email.message}</p>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: warm.textMuted }}>Phone</label>
                      <input
                        type="tel"
                        {...register('phone')}
                        className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors"
                        style={inputStyles}
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: warm.textMuted }}>Company</label>
                      <input
                        {...register('company')}
                        className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors"
                        style={inputStyles}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: warm.textMuted }}>Enquiry Type</label>
                    <select
                      {...register('intent_type')}
                      className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors"
                      style={inputStyles}
                    >
                      <option value="general">General Enquiry</option>
                      <option value="membership">Membership</option>
                      <option value="private-events">Private Events</option>
                      <option value="sponsorship">Sponsorship &amp; Partnerships</option>
                      <option value="press">Press &amp; Media</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: warm.textMuted }}>Message *</label>
                    <textarea
                      {...register('message')}
                      rows={5}
                      className="w-full px-4 py-3 border text-sm focus:border-[#B8975A] focus:outline-none transition-colors resize-none"
                      style={inputStyles}
                    />
                    {errors.message && <p className="text-xs text-[#C4694A] mt-1">{errors.message.message}</p>}
                  </div>

                  {error && <p className="text-sm text-[#C4694A]">{error}</p>}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-10 py-4 bg-[#B8975A] hover:bg-[#D4B978] text-white text-sm font-medium tracking-[0.1em] uppercase transition-all duration-500 hover:tracking-[0.15em] disabled:opacity-50"
                  >
                    {isSubmitting ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          HOW WE CAN HELP
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div
          ref={helpReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="text-center mb-14">
            <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
              How We Can Help
            </span>
            <h2 className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-light text-white">
              Whatever your enquiry, we&apos;re here
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
            {[
              {
                title: 'Membership',
                desc: 'Learn about our tiers, benefits, and the application process. We\'ll guide you every step of the way.',
                link: '/memberships',
                linkText: 'View Memberships',
              },
              {
                title: 'Private Events',
                desc: 'Planning a corporate dinner, product launch, or celebration? Our team delivers bespoke experiences.',
                link: '/private-event-services',
                linkText: 'Explore Events',
              },
              {
                title: 'Venue Hire',
                desc: 'Book meeting rooms, event spaces, or co-working areas at [ONE] London Road in Alderley Edge.',
                link: '/one-london-road',
                linkText: 'View the Space',
              },
              {
                title: 'Partnerships',
                desc: 'Interested in sponsoring events or partnering with The Club? We work with premium brands.',
                link: null,
                linkText: null,
              },
            ].map((item) => (
              <div key={item.title}>
                <div className="w-8 h-px bg-[#B8975A] mb-5" />
                <h3 className="font-[family-name:var(--font-heading)] text-lg text-white mb-3">
                  {item.title}
                </h3>
                <p
                  className="text-sm leading-relaxed mb-4 transition-colors duration-[400ms]"
                  style={{ color: dark.textMuted }}
                >
                  {item.desc}
                </p>
                {item.link && (
                  <Link
                    href={item.link}
                    className="inline-flex items-center gap-2 text-[0.7rem] font-[family-name:var(--font-label)] uppercase tracking-[0.15em] text-[#B8975A] hover:text-[#D4B978] transition-colors"
                  >
                    {item.linkText}
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          LOCATION
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: light.bg }}
      >
        <div
          ref={locationReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
            <div className="lg:col-span-5 flex flex-col justify-center">
              <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
                Headquarters
              </span>
              <h2
                className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-light mb-6 transition-colors duration-[400ms]"
                style={{ color: light.text }}
              >
                [ONE] London Road
              </h2>
              <div
                className="space-y-1 text-[0.95rem] leading-[1.85] mb-8 transition-colors duration-[400ms]"
                style={{ color: light.textMuted }}
              >
                <p>1 London Road</p>
                <p>Alderley Edge, Cheshire</p>
                <p>SK9 7JT</p>
              </div>
              <p
                className="text-sm mb-8 transition-colors duration-[400ms]"
                style={{ color: light.textDim }}
              >
                Our workspace and event venue is open to members and by appointment.
                Located in the heart of Alderley Edge, one of the North West&apos;s most
                prestigious addresses.
              </p>
              <MagneticButton strength={0.3}>
                <Link
                  href="/one-london-road"
                  className="inline-flex items-center gap-3 text-sm font-medium tracking-[0.1em] uppercase text-[#B8975A] hover:text-[#D4B978] transition-colors"
                >
                  Explore the Space
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </MagneticButton>
            </div>

            <div className="lg:col-span-6 lg:col-start-7">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80"
                  alt="[ONE] London Road, Alderley Edge"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          CTA
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div ref={ctaReveal.ref} className="max-w-2xl mx-auto px-6 text-center">
          <h2
            className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light mb-4 transition-colors duration-[400ms]"
            style={{ color: warm.text }}
          >
            Ready to <em className="italic text-[#B8975A]">connect</em>?
          </h2>
          <p
            className="mb-10 transition-colors duration-[400ms]"
            style={{ color: warm.textMuted }}
          >
            Discover what membership at The Club can do for you and your business.
          </p>
          <MagneticButton strength={0.3}>
            <Link
              href="/memberships"
              className="inline-flex items-center gap-3 px-10 py-4 bg-[#B8975A] hover:bg-[#D4B978] text-white text-sm font-medium tracking-[0.1em] uppercase transition-all duration-500 hover:tracking-[0.15em]"
            >
              Explore Memberships
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </MagneticButton>
        </div>
      </section>
    </>
  )
}
