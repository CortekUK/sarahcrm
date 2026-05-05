'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme, themeColors } from '@/components/website/ThemeContext'
import { useReveal } from '@/components/website/home/useReveal'
import { MagneticButton } from '@/components/website/MagneticButton'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function OneLondonRoadPage() {
  const { mode } = useTheme()
  const dark = themeColors[mode].dark
  const light = themeColors[mode].light
  const warm = themeColors[mode].warm
  const sectionRef = useRef<HTMLElement>(null)
  const imageWrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const spaceReveal = useReveal({ threshold: 0.05, y: 40 })
  const featuresReveal = useReveal({ threshold: 0.1, y: 30 })
  const perksReveal = useReveal({ threshold: 0.1, y: 30 })
  const bookingReveal = useReveal({ threshold: 0.1, y: 30 })
  const locationReveal = useReveal(0.2)

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
      tl.fromTo('.olr-hero-label', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 })
        .fromTo('.olr-hero-headline', { clipPath: 'inset(0 0 100% 0)', y: 30 }, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1 }, '-=0.2')
        .fromTo('.olr-hero-sub', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
    }, sectionRef)

    return () => ctx.revert()
  }, [])

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
            src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1920&q=80"
            alt="[ONE] London Road interior"
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
            className="olr-hero-label font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block"
            style={{ opacity: 0 }}
          >
            Our Home
          </span>
          <h1
            className="olr-hero-headline font-[family-name:var(--font-heading)] text-4xl md:text-5xl lg:text-6xl font-light text-white leading-[1.1]"
            style={{ clipPath: 'inset(0 0 100% 0)' }}
          >
            [ONE] London Road
          </h1>
          <p
            className="olr-hero-sub mt-5 text-lg text-white/60"
            style={{ opacity: 0 }}
          >
            Alderley Edge, Cheshire
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          THE SPACE
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={spaceReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
            <div className="lg:col-span-5 flex flex-col justify-center">
              <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
                The Space
              </span>
              <h2
                className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light leading-[1.15] mb-8 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                A base that reflects our{' '}
                <em className="italic text-[#B8975A]">ambition</em>
              </h2>
              <div
                className="space-y-5 text-[0.95rem] leading-[1.85] transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>
                  The Club by Sarah Restrick is more than just a network — it&apos;s a
                  space to connect, collaborate and grow. And we&apos;re proud to call
                  [ONE] London Road our home.
                </p>
                <p>
                  Located in the heart of Alderley Edge, [ONE] London Road is a
                  beautifully designed, modern workspace offering flexible meeting rooms,
                  private offices and collaborative areas — the perfect environment for
                  The Club members to host, meet and do their best work.
                </p>
              </div>
            </div>

            <div className="lg:col-span-6 lg:col-start-7 grid grid-cols-2 gap-4">
              <div className="relative aspect-[3/4] col-span-2">
                <Image
                  src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80"
                  alt="[ONE] London Road workspace"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
              <div className="relative aspect-square">
                <Image
                  src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=80"
                  alt="Exterior grounds"
                  fill
                  className="object-cover"
                  sizes="25vw"
                />
              </div>
              <div className="relative aspect-square">
                <Image
                  src="https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=400&q=80"
                  alt="Collaborative workspace"
                  fill
                  className="object-cover"
                  sizes="25vw"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          FEATURES
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div
          ref={featuresReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
            {[
              { title: 'Members\' Lounge', desc: 'A refined space for working, meeting, and unwinding with complimentary refreshments.' },
              { title: 'Private Meeting Rooms', desc: 'Bookable boardrooms and meeting spaces for up to 12 guests.' },
              { title: 'Event Space', desc: 'A versatile venue for intimate dinners, launches, and workshops for up to 40 guests.' },
              { title: 'Concierge Desk', desc: 'On-hand support for reservations, travel, and anything else you need.' },
            ].map((feature) => (
              <div key={feature.title}>
                <div className="w-8 h-px bg-[#B8975A] mb-5" />
                <h3 className="font-[family-name:var(--font-heading)] text-lg text-white mb-2">
                  {feature.title}
                </h3>
                <p
                  className="text-sm leading-relaxed transition-colors duration-[400ms]"
                  style={{ color: dark.textMuted }}
                >
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          MEMBER PERKS
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={perksReveal.ref}
          className="max-w-3xl mx-auto px-6 md:px-16 lg:px-24 text-center"
        >
          <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
            Membership Benefits
          </span>
          <h2
            className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-light mb-6 transition-colors duration-[400ms]"
            style={{ color: warm.text }}
          >
            Member <em className="italic text-[#B8975A]">Perks</em> at [ONE] London Road
          </h2>
          <p
            className="mb-10 text-[0.95rem] leading-[1.85] transition-colors duration-[400ms]"
            style={{ color: warm.textMuted }}
          >
            As part of The Club, you get priority access to premium meeting rooms and
            workspaces — tailored to your needs and supported by a professional team.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left max-w-xl mx-auto">
            {[
              'Stylish, well-equipped meeting rooms',
              'Flexible office and co-working spaces',
              'Superfast WiFi and complimentary refreshments',
              'Warm, welcoming community of professionals',
            ].map((perk) => (
              <div key={perk} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#B8975A] mt-2 flex-shrink-0" />
                <p
                  className="text-sm leading-relaxed transition-colors duration-[400ms]"
                  style={{ color: warm.textMuted }}
                >
                  {perk}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          BOOKING CTA
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: light.bg }}
      >
        <div
          ref={bookingReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
            <div className="lg:col-span-5 flex flex-col justify-center">
              <h2
                className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-light leading-[1.3] mb-6 transition-colors duration-[400ms]"
                style={{ color: light.text }}
              >
                <em className="italic text-[#B8975A]">Exclusive</em> Spaces.{' '}
                <em className="italic text-[#B8975A]">Exceptional</em> Service.
              </h2>
              <div
                className="space-y-5 text-[0.95rem] leading-[1.85] transition-colors duration-[400ms]"
                style={{ color: light.textMuted }}
              >
                <p>
                  Whether you&apos;re meeting a client, hosting a team session or need a
                  quiet place to focus, [ONE] London Road has the space, style and
                  support you need.
                </p>
                <p>
                  Ready to book a room or office space? If you&apos;re a The Club member,
                  you&apos;re already halfway there. Enquire below about using the meeting
                  rooms or office spaces at [ONE] London Road.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <MagneticButton strength={0.3}>
                  <a
                    href="https://onelondonroad.co.uk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-3 px-10 py-4 bg-[#B8975A] hover:bg-[#D4B978] text-white text-sm font-medium tracking-[0.1em] uppercase transition-all duration-500 hover:tracking-[0.15em]"
                  >
                    Book Directly
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                </MagneticButton>
                <MagneticButton strength={0.3}>
                  <Link
                    href="/contact-us"
                    className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-medium tracking-[0.1em] uppercase transition-all duration-300"
                    style={{
                      border: `1px solid ${light.text}`,
                      color: light.text,
                    }}
                  >
                    Book Via The Club
                  </Link>
                </MagneticButton>
              </div>

              <p className="mt-5 text-xs font-medium text-[#B8975A] tracking-wide">
                Members get 10% OFF by quoting &lsquo;The Club&rsquo;
              </p>
            </div>

            <div className="lg:col-span-6 lg:col-start-7">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1462826303086-329426d1aef5?w=800&q=80"
                  alt="Private meeting room at [ONE] London Road"
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
          FIND US
      ═══════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div
          ref={locationReveal.ref}
          className="max-w-2xl mx-auto px-6 md:px-16 lg:px-24 text-center"
        >
          <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
            Find Us
          </span>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light text-white mb-4">
            1 London Road, Alderley Edge, Cheshire, SK9 7JT
          </h2>
          <p
            className="mb-8 transition-colors duration-[400ms]"
            style={{ color: dark.textMuted }}
          >
            Accessible for members only. Visitor access by appointment.
          </p>
          <MagneticButton strength={0.3}>
            <Link
              href="/contact-us"
              className="inline-flex items-center px-8 py-3.5 text-sm font-medium tracking-[0.1em] uppercase transition-all duration-300 text-white"
              style={{
                border: '1px solid rgba(255,255,255,0.3)',
              }}
            >
              Arrange a Visit
            </Link>
          </MagneticButton>
        </div>
      </section>
    </>
  )
}
