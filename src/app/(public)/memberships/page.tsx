'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme, themeColors } from '@/components/website/ThemeContext'
import { useReveal } from '@/components/website/home/useReveal'
import { MagneticButton } from '@/components/website/MagneticButton'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePageHero } from '@/components/website/usePageHero'
import { Resources } from '@/components/website/Resources'

gsap.registerPlugin(ScrollTrigger)

/* ── Membership Benefits ── */
const benefits = [
  {
    title: 'Access to The Club Network',
    desc: 'Unlock privileged access to The Club\u2019s elite network of founders, CEOs and high-net-worth professionals for meaningful business connections.',
  },
  {
    title: 'Choose Your Membership',
    desc: 'Experience the freedom of choice with our flexible membership options, designed to cater to your individual preferences.',
  },
  {
    title: 'Advertise Your Business',
    desc: 'Elevate your visibility with the opportunity to showcase your brand through our member directory and website, reaching a discerning audience.',
  },
  {
    title: 'Access to Club Events',
    desc: 'Enjoy privileged access to The Club\u2019s exclusive events — curated to provide outstanding opportunities for building meaningful connections.',
  },
  {
    title: 'Monthly Members\u2019 Work In',
    desc: 'Participate in our monthly member work-in sessions, designed to foster collaboration and allow members to engage, share insights and grow together.',
  },
  {
    title: 'Private Dining Experiences',
    desc: 'Indulge in exquisite private dining experiences at exclusive member rates, curated to elevate networking and foster lasting relationships.',
  },
  {
    title: 'Bespoke & Ticketed Events',
    desc: 'Unlock exclusive member rates for both bespoke and ticketed events, ensuring you have privileged access to a diverse array of curated, high-profile experiences.',
  },
  {
    title: 'Curated Sponsored Events',
    desc: 'Enhance your brand\u2019s visibility and influence by accessing curated events included in Business and Corporate memberships, establishing a powerful presence within our elite community.',
  },
  {
    title: 'Corporate Luxury Concierge',
    desc: 'Experience the pinnacle of service with our Corporate Luxury Concierge, a premium offering exclusively available to Business and Corporate members.',
  },
]

/* ── Tier cards ── */
const tiers = [
  {
    name: 'Individual',
    price: '\u00A32,500',
    period: 'per annum',
    ideal: 'Founders, executives, and professionals',
    features: [
      'Access to all club events and dinners',
      'Bespoke member-to-member introductions',
      'Private members\u2019 digital community',
      'Concierge service for travel and dining',
      'Priority access to retreats and experiences',
      'Members\u2019 lounge access at [ONE] London Road',
    ],
  },
  {
    name: 'Business',
    price: '\u00A315,000',
    period: 'per annum',
    ideal: 'Companies connecting their leadership team',
    featured: true,
    features: [
      'Up to 5 named team members',
      'Branded events partnership opportunities',
      'Priority speaker and panel placement',
      'Quarterly strategy dinners with peers',
      'Dedicated relationship manager',
      'Co-branded content creation',
      'Access to all Individual benefits',
    ],
  },
  {
    name: 'Partner',
    price: '\u00A330,000',
    period: 'per annum',
    ideal: 'Brands seeking deep integration',
    features: [
      'Unlimited team access',
      'Title event sponsorship rights',
      'Co-branded luxury experiences',
      'Exclusive content creation & distribution',
      'Board-level introductions',
      'Annual retreat inclusion',
      'Premium visibility across all channels',
      'Access to all Business benefits',
    ],
  },
]

/* ── Comparison table ── */
const comparisonFeatures: { label: string; individual: boolean; business: boolean; partner: boolean }[] = [
  { label: 'Access to The Club network', individual: true, business: true, partner: true },
  { label: 'Single membership for one individual', individual: true, business: false, partner: false },
  { label: 'Up to 5 team memberships', individual: false, business: true, partner: false },
  { label: 'Unlimited team memberships', individual: false, business: false, partner: true },
  { label: 'Member directory & website listing', individual: false, business: true, partner: true },
  { label: 'Access to all member events', individual: true, business: true, partner: true },
  { label: 'Monthly members\u2019 Work In sessions', individual: true, business: true, partner: true },
  { label: 'Exclusive rates for private dining', individual: true, business: true, partner: true },
  { label: 'Exclusive rates for bespoke & ticketed events', individual: true, business: true, partner: true },
  { label: 'Club concierge service', individual: true, business: true, partner: true },
  { label: 'Curated event with sponsorship', individual: false, business: true, partner: true },
  { label: 'Multiple curated events with sponsorship', individual: false, business: false, partner: true },
  { label: 'Bespoke marketing campaigns', individual: false, business: false, partner: true },
  { label: 'Sector exclusivity during membership term', individual: false, business: false, partner: true },
  { label: 'Designated hosts & guest management', individual: false, business: false, partner: true },
]

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mx-auto">
      <path d="M4 9.5l3.5 3.5L14 6" stroke="#B8975A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Dash() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mx-auto opacity-20">
      <path d="M6 9h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function MembershipsPage() {
  const { mode } = useTheme()
  const dark = themeColors[mode].dark
  const light = themeColors[mode].light
  const warm = themeColors[mode].warm
  const sectionRef = useRef<HTMLElement>(null)
  const imageWrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const introReveal = useReveal({ threshold: 0.15, y: 30 })
  const benefitsReveal = useReveal({ threshold: 0.05, y: 40 })
  const tiersReveal = useReveal({ threshold: 0.05, y: 40 })
  const comparisonReveal = useReveal({ threshold: 0.05, y: 30 })
  const experienceReveal = useReveal({ threshold: 0.15, y: 30 })
  const ctaReveal = useReveal(0.2)
  const heroOverride = usePageHero('memberships')

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
      tl.fromTo('.mem-hero-label', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 })
        .fromTo('.mem-hero-headline', { clipPath: 'inset(0 0 100% 0)', y: 30 }, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1 }, '-=0.2')
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <>
      {/* ── Hero ── */}
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
            src={heroOverride?.image_url ?? 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=80'}
            alt={heroOverride?.alt_text ?? ''}
            fill
            className="object-cover"
            priority
            sizes="100vw"
            unoptimized={!!heroOverride}
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
            className="mem-hero-label font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block"
            style={{ opacity: 0 }}
          >
            Membership
          </span>
          <h1
            className="mem-hero-headline font-[family-name:var(--font-heading)] text-4xl md:text-5xl lg:text-6xl font-light text-white leading-[1.1]"
            style={{ clipPath: 'inset(0 0 100% 0)' }}
          >
            An investment in your
            <br />
            most valuable asset — <em className="italic text-[#B8975A]">your network</em>
          </h1>
        </div>
      </section>

      {/* ── Intro / Philosophy ── */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={introReveal.ref}
          className="max-w-3xl mx-auto px-6 md:px-16 lg:px-24 text-center"
        >
          <div className="flex justify-center mb-8">
            <svg width="40" height="32" viewBox="0 0 40 32" fill="none">
              <path d="M0 32V19.2C0 6.4 8.8 0 17.6 0l-1.6 6.4C10.4 8 8 12.8 8 19.2h8V32H0zM24 32V19.2C24 6.4 32.8 0 41.6 0L40 6.4C34.4 8 32 12.8 32 19.2h8V32H24z" fill="#B8975A" opacity="0.15" />
            </svg>
          </div>
          <p
            className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-light leading-relaxed italic transition-colors duration-[400ms]"
            style={{ color: warm.text }}
          >
            Your network is your net worth. We don&apos;t just believe that —
            we architect it.
          </p>
          <p
            className="mt-6 text-sm transition-colors duration-[400ms]"
            style={{ color: warm.textMuted }}
          >
            Sarah Restrick, Founder &amp; CEO
          </p>
          <p
            className="mt-8 text-[0.95rem] leading-[1.85] max-w-2xl mx-auto transition-colors duration-[400ms]"
            style={{ color: warm.textMuted }}
          >
            Discover exclusive membership options and benefits at The Club, tailored to suit your needs.
            Whether as an individual or business entity, our memberships offer outstanding opportunities
            for connections, sponsored events, and luxury concierge services.
          </p>
        </div>
      </section>

      {/* ── Membership Benefits ── */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: light.bg }}
      >
        <div
          ref={benefitsReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="text-center mb-16">
            <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
              What You Get
            </span>
            <h2
              className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light transition-colors duration-[400ms]"
              style={{ color: light.text }}
            >
              Membership <em className="italic text-[#B8975A]">Benefits</em>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="group p-8 transition-all duration-[400ms]"
                style={{
                  backgroundColor: mode === 'evening' ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                  border: `1px solid ${light.border}`,
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
                    <rect x="3" y="3" width="14" height="14" transform="rotate(45 10 2.1)" stroke="#B8975A" strokeWidth="1.2" fill="none" />
                  </svg>
                  <h3
                    className="font-[family-name:var(--font-heading)] text-[1.05rem] font-normal transition-colors duration-[400ms]"
                    style={{ color: light.text }}
                  >
                    {benefit.title}
                  </h3>
                </div>
                <p
                  className="text-sm leading-relaxed transition-colors duration-[400ms]"
                  style={{ color: light.textMuted }}
                >
                  {benefit.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mid-page CTA ── */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div className="max-w-2xl mx-auto px-6 md:px-16 lg:px-24 text-center">
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light text-white mb-8">
            Become a <em className="italic text-[#B8975A]">member</em>
          </h2>
          <MagneticButton strength={0.3}>
            <Link
              href="/membership-application"
              className="inline-flex items-center gap-3 px-10 py-4 bg-[#B8975A] hover:bg-[#D4B978] text-white text-sm font-medium tracking-[0.1em] uppercase transition-all duration-500 hover:tracking-[0.15em]"
            >
              Apply Now
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </MagneticButton>
        </div>
      </section>

      {/* ── Membership Tiers ── */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={tiersReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="text-center mb-16">
            <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
              Membership Types
            </span>
            <h2
              className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light transition-colors duration-[400ms]"
              style={{ color: warm.text }}
            >
              Choose your <em className="italic text-[#B8975A]">level</em>
            </h2>
            <p
              className="mt-4 text-[0.95rem] max-w-2xl mx-auto transition-colors duration-[400ms]"
              style={{ color: warm.textMuted }}
            >
              Explore our Individual, Business, and Partner memberships, each designed
              with unique benefits to enhance your networking journey.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-start">
            {tiers.map((tier) => {
              const isFeatured = tier.featured
              return (
                <div
                  key={tier.name}
                  className={`relative p-8 lg:p-10 flex flex-col transition-all duration-[400ms] ${
                    isFeatured ? 'md:-mt-4 md:mb-[-16px]' : ''
                  }`}
                  style={{
                    backgroundColor: isFeatured
                      ? (mode === 'evening' ? '#0D0C0A' : '#1C1917')
                      : (mode === 'evening' ? 'rgba(255,255,255,0.04)' : '#FFFFFF'),
                    border: isFeatured ? 'none' : `1px solid ${warm.border}`,
                    boxShadow: isFeatured
                      ? '0 25px 50px -12px rgba(0,0,0,0.25)'
                      : (mode === 'evening' ? 'none' : '0 1px 3px rgba(0,0,0,0.04)'),
                  }}
                >
                  {isFeatured && (
                    <span className="absolute top-0 left-0 right-0 h-[3px] bg-[#B8975A]" />
                  )}
                  {isFeatured && (
                    <span className="absolute -top-3 right-8 bg-[#B8975A] text-white text-[0.6rem] font-medium uppercase tracking-[0.15em] px-3 py-1">
                      Most Popular
                    </span>
                  )}
                  <span className="font-[family-name:var(--font-label)] text-[0.65rem] font-medium uppercase tracking-[0.2em] text-[#B8975A]">
                    {tier.name}
                  </span>
                  <div className="mt-4 mb-2">
                    <span
                      className="font-[family-name:var(--font-heading)] text-3xl lg:text-4xl font-light transition-colors duration-[400ms]"
                      style={{ color: isFeatured ? '#FFFFFF' : warm.text }}
                    >
                      {tier.price}
                    </span>
                    <span
                      className="text-sm ml-2 transition-colors duration-[400ms]"
                      style={{ color: isFeatured ? 'rgba(255,255,255,0.5)' : warm.textDim }}
                    >
                      {tier.period}
                    </span>
                  </div>
                  <p
                    className="text-sm mb-8 transition-colors duration-[400ms]"
                    style={{ color: isFeatured ? 'rgba(255,255,255,0.6)' : warm.textMuted }}
                  >
                    {tier.ideal}
                  </p>

                  <div
                    className="mb-8 transition-colors duration-[400ms]"
                    style={{ borderTop: `1px solid ${isFeatured ? 'rgba(255,255,255,0.08)' : warm.border}` }}
                  />

                  <ul className="space-y-3.5 mb-10 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 flex-shrink-0">
                          <path d="M3 8.5l3 3 7-7" stroke="#B8975A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span
                          className="text-sm leading-snug transition-colors duration-[400ms]"
                          style={{ color: isFeatured ? 'rgba(255,255,255,0.85)' : warm.text }}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <MagneticButton strength={0.2}>
                    <Link
                      href="/membership-application"
                      className={`inline-flex items-center justify-center w-full px-6 py-3.5 text-sm font-medium tracking-[0.1em] uppercase transition-all duration-300 ${
                        isFeatured
                          ? 'bg-[#B8975A] hover:bg-[#D4B978] text-white'
                          : 'border border-[#B8975A] text-[#B8975A] hover:bg-[#B8975A] hover:text-white'
                      }`}
                    >
                      Apply Now
                    </Link>
                  </MagneticButton>
                </div>
              )
            })}
          </div>

          <div className="mt-16 text-center">
            <p
              className="text-sm max-w-lg mx-auto transition-colors duration-[400ms]"
              style={{ color: warm.textMuted }}
            >
              All memberships are subject to application and approval. We limit numbers
              to preserve the quality and intimacy that defines The Club experience.
            </p>
          </div>
        </div>
      </section>

      {/* ── Membership Comparison ── */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: light.bg }}
      >
        <div
          ref={comparisonReveal.ref}
          className="max-w-[1080px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="text-center mb-16">
            <div className="flex justify-center mb-6">
              <div
                className="w-14 h-14 flex items-center justify-center transition-colors duration-[400ms]"
                style={{ border: `1px solid ${light.border}` }}
              >
                <span className="font-[family-name:var(--font-heading)] text-xl text-[#B8975A] italic">C</span>
              </div>
            </div>
            <h2
              className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light transition-colors duration-[400ms]"
              style={{ color: light.text }}
            >
              Membership <em className="italic text-[#B8975A]">Comparison</em>
            </h2>
            <p
              className="mt-4 text-sm max-w-2xl mx-auto transition-colors duration-[400ms]"
              style={{ color: light.textMuted }}
            >
              Explore our membership benefits at a glance. Compare the exclusive offerings
              of our Individual, Business, and Partner memberships to find the perfect fit
              for your networking goals.
            </p>
          </div>

          {/* Table — desktop */}
          <div className="hidden md:block">
            {/* Header */}
            <div
              className="grid grid-cols-[1fr_100px_100px_100px] gap-0 pb-4 mb-2 transition-colors duration-[400ms]"
              style={{ borderBottom: `2px solid ${light.border}` }}
            >
              <div />
              <div className="text-center">
                <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.15em] text-[#B8975A]">
                  Individual
                </span>
              </div>
              <div className="text-center">
                <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.15em] text-[#B8975A]">
                  Business
                </span>
              </div>
              <div className="text-center">
                <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.15em] text-[#B8975A]">
                  Partner
                </span>
              </div>
            </div>

            {/* Rows */}
            {comparisonFeatures.map((row, i) => (
              <div
                key={row.label}
                className="grid grid-cols-[1fr_100px_100px_100px] gap-0 py-3.5 transition-colors duration-[400ms]"
                style={{
                  borderBottom: `1px solid ${light.border}`,
                  backgroundColor: i % 2 === 0
                    ? 'transparent'
                    : (mode === 'evening' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)'),
                }}
              >
                <span
                  className="text-sm pr-4 transition-colors duration-[400ms]"
                  style={{ color: light.text }}
                >
                  {row.label}
                </span>
                <div className="text-center" style={{ color: light.textDim }}>
                  {row.individual ? <Check /> : <Dash />}
                </div>
                <div className="text-center" style={{ color: light.textDim }}>
                  {row.business ? <Check /> : <Dash />}
                </div>
                <div className="text-center" style={{ color: light.textDim }}>
                  {row.partner ? <Check /> : <Dash />}
                </div>
              </div>
            ))}
          </div>

          {/* Table — mobile (stacked cards) */}
          <div className="md:hidden space-y-8">
            {(['Individual', 'Business', 'Partner'] as const).map((tierName) => (
              <div
                key={tierName}
                className="p-6 transition-colors duration-[400ms]"
                style={{
                  backgroundColor: mode === 'evening' ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                  border: `1px solid ${light.border}`,
                }}
              >
                <h3 className="font-[family-name:var(--font-label)] text-[0.65rem] font-medium uppercase tracking-[0.2em] text-[#B8975A] mb-5">
                  {tierName}
                </h3>
                <ul className="space-y-3">
                  {comparisonFeatures
                    .filter((row) => row[tierName.toLowerCase() as 'individual' | 'business' | 'partner'])
                    .map((row) => (
                      <li key={row.label} className="flex items-start gap-3">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 flex-shrink-0">
                          <path d="M2.5 7.5l3 3L11.5 4" stroke="#B8975A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span
                          className="text-sm transition-colors duration-[400ms]"
                          style={{ color: light.text }}
                        >
                          {row.label}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The Club Experience ── */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div
          ref={experienceReveal.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="text-center mb-16">
            <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
              What Awaits You
            </span>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light text-white">
              The Club <em className="italic text-[#B8975A]">experience</em>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
            {[
              {
                title: 'Curated Events',
                desc: 'Intimate dinners, exclusive retreats, and high-calibre gatherings at exceptional venues.',
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#B8975A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="6" width="24" height="22" rx="2" />
                    <path d="M4 12h24" />
                    <path d="M10 2v4M22 2v4" />
                    <circle cx="16" cy="20" r="3" />
                  </svg>
                ),
              },
              {
                title: 'Bespoke Introductions',
                desc: 'Handpicked introductions between members based on complementary interests and goals.',
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#B8975A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="10" cy="10" r="4" />
                    <circle cx="22" cy="10" r="4" />
                    <path d="M2 26c0-4.4 3.6-8 8-8 1.5 0 2.9.4 4.1 1.1" />
                    <path d="M30 26c0-4.4-3.6-8-8-8-1.5 0-2.9.4-4.1 1.1" />
                    <path d="M16 20v6M13 23h6" />
                  </svg>
                ),
              },
              {
                title: 'Concierge Service',
                desc: 'Restaurant reservations, travel arrangements, and access to experiences money can\'t buy.',
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#B8975A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 4l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
                  </svg>
                ),
              },
              {
                title: 'Private Community',
                desc: 'A trusted digital space to connect, share opportunities, and build lasting relationships.',
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#B8975A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 24V8a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H10l-4 4v-2z" />
                    <path d="M12 13h8M12 17h5" />
                  </svg>
                ),
              },
            ].map((item) => (
              <div key={item.title} className="text-center">
                <div className="flex justify-center mb-5">
                  {item.icon}
                </div>
                <h3 className="font-[family-name:var(--font-heading)] text-lg text-white mb-3">
                  {item.title}
                </h3>
                <p
                  className="text-sm leading-relaxed transition-colors duration-[400ms]"
                  style={{ color: dark.textMuted }}
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Resources / downloads (membership prospectus, etc.) ── */}
      <Resources
        pageSlug="memberships"
        heading="Membership resources"
        subheading="Download our membership prospectus, terms, and tier comparison."
      />

      {/* ── Final CTA ── */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={ctaReveal.ref}
          className="max-w-2xl mx-auto px-6 md:px-16 lg:px-24 text-center"
        >
          <h2
            className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-light mb-4 transition-colors duration-[400ms]"
            style={{ color: warm.text }}
          >
            Ready to <em className="italic text-[#B8975A]">join?</em>
          </h2>
          <p
            className="mb-10 transition-colors duration-[400ms]"
            style={{ color: warm.textMuted }}
          >
            Applications are reviewed on a rolling basis. Begin your journey
            with The Club today.
          </p>
          <MagneticButton strength={0.3}>
            <Link
              href="/membership-application"
              className="inline-flex items-center gap-3 px-10 py-4 bg-[#B8975A] hover:bg-[#D4B978] text-white text-sm font-medium tracking-[0.1em] uppercase transition-all duration-500 hover:tracking-[0.15em]"
            >
              Start Your Application
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </MagneticButton>
        </div>
      </section>

      {/* ── Tagline ── */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="font-[family-name:var(--font-heading)] text-xl md:text-2xl font-light text-white/80 italic">
            Connecting leaders in business through <span className="text-[#B8975A]">luxury</span> experience.
          </p>
        </div>
      </section>
    </>
  )
}
