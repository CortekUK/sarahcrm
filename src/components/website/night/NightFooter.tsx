'use client'

import { HARRODS_APPROVED } from '@/components/website/night/london/content'
import Link from 'next/link'
import Image from 'next/image'
import { useTheme } from '@/providers/ThemeProvider'

// Night-palette footer. Editorial-leaning rather than admin-y:
//  - Oversized wordmark on the left ("The Club" + tagline beneath)
//  - Link columns right (Discover, Work With Us, The Standard) + Contact
//  - Hairline divider, copyright + company line on a quiet baseline
//  - Bronze used only on hover, never as the default
//
// Socials: Instagram only for now. Facebook + LinkedIn ("The Club by Sarah
// Restrick") are to be supplied by Sarah — add them to SOCIALS when known.

const COLUMNS: Array<{ label: string; links: Array<{ href: string; text: string }> }> = [
  {
    label: 'Discover',
    links: [
      { href: '/about', text: 'The Club' },
      { href: '/memberships', text: 'Memberships' },
      { href: '/events', text: 'Events' },
      { href: '/pitch', text: 'PITCH' },
      ...(HARRODS_APPROVED ? [{ href: '/london-series', text: 'London Series at Harrods' }] : []),
      { href: '/concierge', text: 'Concierge' },
      { href: '/portfolio', text: 'Portfolio' },
    ],
  },
  {
    label: 'Work With Us',
    links: [
      { href: '/partner', text: 'Partner With Us' },
      { href: '/rewards', text: 'Rewards & Benefits' },
      { href: '/success-stories', text: 'Success Stories' },
      { href: '/journal', text: 'Journal' },
      { href: '/share-your-experience', text: 'Share Your Experience' },
      { href: '/membership-application', text: 'Apply for Membership' },
    ],
  },
  {
    label: 'The Standard',
    links: [
      { href: '/club-rules', text: 'The Club Rules' },
      { href: '/privacy-policy', text: 'Privacy Policy' },
      { href: '/contact-us', text: 'Contact' },
    ],
  },
]

const CONTACTS: Array<{ href: string; text: string; label: string }> = [
  { href: 'mailto:membership@theclubgroup.co', text: 'membership@theclubgroup.co', label: 'Membership' },
  { href: 'mailto:events@theclubgroup.co', text: 'events@theclubgroup.co', label: 'Events' },
  { href: 'mailto:sarah@theclubgroup.co', text: 'sarah@theclubgroup.co', label: 'Sarah' },
  { href: 'tel:+447921507442', text: '+44 (0)7921 507 442', label: 'Telephone' },
]

const SOCIALS: Array<{ href: string; text: string }> = [
  { href: 'https://www.instagram.com/theclubsarahrestrick/', text: 'Instagram · @theclubsarahrestrick' },
]

const linkClass =
  'flex items-center min-h-[44px] sm:block sm:min-h-0 break-words font-[family-name:var(--font-sans)] text-[14px] font-light text-ivory-soft hover:text-bronze-light transition-colors duration-300'

export function NightFooter() {
  const { theme } = useTheme()
  const logoSrc = theme === 'day' ? '/logo-gold.png' : '/logo-white.png'
  return (
    <footer className="relative border-t border-graphite-line/80 bg-ink">
      {/* Editorial top section */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 pt-24 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          {/* Logo monogram + wordmark + tagline */}
          <div className="lg:col-span-4">
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

          {/* Link columns + contact */}
          <div className="lg:col-span-8 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 sm:gap-10">
            {COLUMNS.map((col) => (
              // min-w-0 on the grid item is required for `break-words` /
              // `break-all` to actually shrink it below its intrinsic
              // content width — otherwise long unbreakable strings push
              // the footer wider than the viewport.
              <div key={col.label} className="min-w-0">
                <p className="eyebrow-quiet mb-5">{col.label}</p>
                {/* Phones: each link is a 44px-tall tap target (spacing comes
                    from the link height). sm+ keeps the original rhythm. */}
                <ul className="space-y-0 sm:space-y-3">
                  {col.links.map((link) => (
                    <li key={link.href} className="min-w-0">
                      <Link href={link.href} className={linkClass}>
                        {link.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="min-w-0 col-span-2 lg:col-span-1">
              <p className="eyebrow-quiet mb-5">Contact</p>
              <ul className="space-y-0 sm:space-y-3">
                {CONTACTS.map((c) => (
                  <li key={c.href} className="min-w-0">
                    <a href={c.href} className={linkClass + ' [overflow-wrap:anywhere]'} aria-label={`${c.label}: ${c.text}`}>
                      {c.text}
                    </a>
                  </li>
                ))}
                {SOCIALS.map((s) => (
                  <li key={s.href} className="min-w-0 sm:pt-2">
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass + ' [overflow-wrap:anywhere]'}
                    >
                      {s.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Baseline */}
      <div className="border-t border-graphite-line/60">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-7 flex flex-col gap-3 text-center lg:text-left">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze">
              © {new Date().getFullYear()} The Club by Sarah Restrick
            </p>
            <a
              href="https://www.theclubgroup.co"
              className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-dim hover:text-bronze-light transition-colors"
            >
              www.theclubgroup.co
            </a>
          </div>
          <p className="text-[11.5px] font-light leading-relaxed text-slate-dim">
            Sarah Restrick Ltd, Company No. 13170374, registered office Booths Hall, Booths Park,
            Chelford Road, Knutsford, Cheshire WA16 8GS.
          </p>
        </div>
      </div>
    </footer>
  )
}
