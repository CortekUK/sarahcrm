'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useTheme } from '@/providers/ThemeProvider'

// Night-palette footer. Editorial-leaning rather than admin-y:
//  - Oversized wordmark on the left ("The Club" + tagline beneath)
//  - Three columns of links right (Discover, The Standard, Connect)
//  - Hairline divider, copyright + Instagram on a quiet baseline
//  - Bronze used only on hover, never as the default

const COLUMNS: Array<{ label: string; links: Array<{ href: string; text: string }> }> = [
  {
    label: 'Discover',
    links: [
      { href: '/about', text: 'The Club' },
      { href: '/memberships', text: 'Memberships' },
      { href: '/events', text: 'Events' },
      { href: '/gallery', text: 'Gallery' },
      { href: '/reviews', text: 'Testimonials' },
    ],
  },
  {
    label: 'The Standard',
    links: [
      { href: '/club-rules', text: 'Club Rules' },
      { href: '/private-event-services', text: 'Private Events' },
      { href: '/privacy-policy', text: 'Privacy Policy' },
    ],
  },
  {
    label: 'Connect',
    links: [
      { href: '/contact-us', text: 'Contact' },
      { href: '/concierge', text: 'Concierge' },
      { href: '/share-your-experience', text: 'Share Your Experience' },
      { href: '/membership-application', text: 'Apply for Membership' },
      { href: 'mailto:hello@theclubbysarahrestrick.com', text: 'hello@theclubbysarahrestrick.com' },
    ],
  },
]

export function NightFooter() {
  const { theme } = useTheme()
  const logoSrc = theme === 'day' ? '/logo-gold.png' : '/logo-white.png'
  return (
    <footer className="relative border-t border-graphite-line/80 bg-ink">
      {/* Editorial top section */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 pt-24 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          {/* Logo monogram + wordmark + tagline */}
          <div className="lg:col-span-5">
            <Link href="/" className="inline-flex items-start gap-5 leading-none group" aria-label="The Club — Home">
              <Image
                src={logoSrc}
                alt=""
                width={80}
                height={80}
                className="h-16 w-16 lg:h-20 lg:w-20 mt-1 opacity-85 group-hover:opacity-100 transition-opacity flex-shrink-0"
              />
              <span className="flex flex-col leading-none">
                <span className="font-[family-name:var(--font-display)] text-[clamp(2.5rem,4vw,3.75rem)] tracking-[-0.02em] text-ivory transition-colors group-hover:text-bronze-light">
                  The Club
                </span>
                <span className="eyebrow-quiet mt-2">by Sarah Restrick</span>
              </span>
            </Link>

            <p className="font-[family-name:var(--font-editorial)] italic text-lg text-ivory-soft/80 leading-relaxed max-w-md mt-8">
              Connecting leaders in business through luxury experience.
            </p>
          </div>

          {/* Link columns */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-10">
            {COLUMNS.map((col) => (
              // min-w-0 on the grid item is required for `break-words` /
              // `break-all` to actually shrink it below its intrinsic
              // content width — otherwise long unbreakable strings (the
              // contact email) push the whole footer wider than the
              // viewport and create body-level horizontal scroll.
              <div key={col.label} className="min-w-0">
                <p className="eyebrow-quiet mb-5">{col.label}</p>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link.href} className="min-w-0">
                      <Link
                        href={link.href}
                        className="block break-words font-[family-name:var(--font-sans)] text-[14px] font-light text-ivory-soft hover:text-bronze-light transition-colors duration-300"
                      >
                        {link.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Baseline */}
      <div className="border-t border-graphite-line/60">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-7 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze">
            © {new Date().getFullYear()} The Club by Sarah Restrick · London
          </p>
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-dim">
            Made with discretion
          </p>
        </div>
      </div>
    </footer>
  )
}
