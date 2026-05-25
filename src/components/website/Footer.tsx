'use client'

import Link from 'next/link'
import { DiamondLogo, Wordmark } from './Logo'
import { useReveal } from './home/useReveal'

const footerColumns = [
  {
    title: 'The Club',
    links: [
      { href: '/memberships', label: 'Memberships' },
      { href: '/events', label: 'Events' },
      { href: '/private-event-services', label: 'Private Events' },
      { href: '/gallery', label: 'Gallery' },
    ],
  },
  {
    title: 'About',
    links: [
      { href: '/about', label: 'Our Founder' },
      { href: '/contact-us', label: 'Contact Us' },
      { href: '/club-rules', label: 'Club Rules' },
    ],
  },
  {
    title: 'Connect',
    links: [
      { href: 'https://instagram.com', label: 'Instagram' },
      { href: 'https://linkedin.com', label: 'LinkedIn' },
      { href: '/login', label: 'Member Login' },
    ],
  },
]

export function Footer() {
  const reveal = useReveal({ threshold: 0.1, y: 30 })

  return (
    <footer ref={reveal.ref} className="bg-[#1A1714] text-white">
      {/* Main footer */}
      <div className="max-w-[1440px] mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8">
          {/* Brand column */}
          <div className="md:col-span-4">
            <div className="flex items-center gap-3 mb-6">
              <DiamondLogo size={32} className="text-[#B8975A]" />
              <Wordmark className="text-white" />
            </div>
            <p className="font-[family-name:var(--font-body)] text-sm text-white/50 leading-relaxed max-w-xs">
              A luxury private members networking club connecting exceptional
              business leaders across Manchester, Leeds, and London.
            </p>
          </div>

          {/* Link columns */}
          {footerColumns.map((col) => (
            <div key={col.title} className="md:col-span-2">
              <h4 className="font-[family-name:var(--font-label)] text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/40 mb-4">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/70 hover:text-[#B8975A] transition-colors link-hover-sweep"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter column */}
          <div className="md:col-span-2">
            <h4 className="font-[family-name:var(--font-label)] text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/40 mb-4">
              Stay Informed
            </h4>
            <p className="text-sm text-white/50 mb-4">
              Receive invitations to exclusive events.
            </p>
            <Link
              href="/membership-application"
              className="inline-block text-sm text-[#B8975A] border-b border-[#B8975A]/40 hover:border-[#B8975A] transition-colors pb-0.5"
            >
              Apply for membership
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} The Club by Sarah Restrick. All rights reserved.
          </p>
          <p className="text-xs text-white/30">
            Manchester &middot; Leeds &middot; London
          </p>
        </div>
      </div>
    </footer>
  )
}
