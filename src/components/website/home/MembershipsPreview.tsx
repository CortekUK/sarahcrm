'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useReveal } from './useReveal'

export function MembershipsPreview() {
  const section = useReveal(0.2)

  return (
    <section className="relative overflow-hidden">
      {/* Background texture */}
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1761116189895-9fa9541520d7?w=1920&q=80"
          alt=""
          fill
          className="object-cover opacity-[0.05]"
          sizes="100vw"
        />
      </div>
      <div className="absolute inset-0 bg-[#F3F0EA]/95" />

      <div className="relative py-28 md:py-40">
        <div
          ref={section.ref}
          className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="max-w-3xl mx-auto text-center">
            <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
              Membership
            </span>
            <h2 className="font-[family-name:var(--font-heading)] text-[clamp(2rem,4vw,3.5rem)] font-light text-[#1A1714] leading-[1.1]">
              Three tiers, one standard
            </h2>
            <p className="font-[family-name:var(--font-body)] text-base md:text-lg text-[#6B6560] leading-relaxed mt-6 max-w-xl mx-auto">
              Whether you&apos;re joining as an individual, bringing your leadership team,
              or seeking a deeper partnership &mdash; every member receives the same
              uncompromising standard of care.
            </p>

            {/* Tier names */}
            <div className="mt-14 flex items-center justify-center gap-8 md:gap-16">
              {['Individual', 'Business', 'Partner'].map((tier, i) => (
                <div key={tier} className="text-center">
                  <span className="font-[family-name:var(--font-heading)] text-xl md:text-2xl font-light text-[#1A1714]">
                    {tier}
                  </span>
                  {i === 1 && (
                    <span className="block font-[family-name:var(--font-label)] text-[0.55rem] uppercase tracking-[0.2em] text-[#B8975A] mt-1">
                      Most popular
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="w-12 h-px bg-[#B8975A] mx-auto mt-14" />

            <Link
              href="/memberships"
              className="group mt-8 inline-flex items-center gap-3 font-[family-name:var(--font-label)] text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[#1A1714] hover:text-[#B8975A] transition-colors duration-500"
            >
              Explore membership
              <div className="w-8 h-px bg-current transition-all duration-500 group-hover:w-12" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
