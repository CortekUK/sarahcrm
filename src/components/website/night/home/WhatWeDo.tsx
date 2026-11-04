import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { Reveal } from '../effects/Reveal'

// "What we do" — nine service tiles, each linking to its page.
// Titles only for now: tile copy is to be supplied by Sarah. Add it to
// `body` below when it arrives; an empty body simply isn't rendered.

const SERVICES: { title: string; href: string; body?: string }[] = [
  { title: 'Membership', href: '/memberships' },
  { title: 'Professional Matchmaking', href: '/memberships#matchmaking' },
  { title: 'Event Services', href: '/concierge#event-services' },
  { title: 'Brand Activations', href: '/partner' },
  { title: 'Sponsorship', href: '/partner/sponsorship' },
  { title: 'Commercial Partnerships', href: '/partner' },
  { title: 'Private Concierge', href: '/concierge' },
  { title: 'Marketing', href: '/partner' },
  { title: 'PR & Profile', href: '/partner' },
]

export function WhatWeDo() {
  return (
    <Chapter density="tight" bg="graphite">
      <div className="max-w-3xl mb-12 lg:mb-14">
        <Reveal type="up" delay={0}>
          <EditorialMeta label="What we do" />
        </Reveal>
        <Reveal type="clip" delay={150}>
          <h2 className="display-md mt-8 text-ivory">
            Our{' '}
            <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">services</em>.
          </h2>
        </Reveal>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-graphite-line/60">
        {SERVICES.map((s, i) => (
          <li key={s.title} className="border-r border-b border-graphite-line/60">
            <Link
              href={s.href}
              className="group flex h-full min-h-[120px] flex-col justify-between gap-6 p-7 lg:p-9 transition-colors duration-500 hover:bg-ink/40"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="font-[family-name:var(--font-meta)] text-[11px] tracking-[0.25em] tabular-nums text-bronze-light/80">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <ArrowUpRight
                  size={16}
                  strokeWidth={1.5}
                  className="text-bronze-light opacity-60 transition-all duration-500 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </div>
              <div>
                <p className="font-[family-name:var(--font-display)] text-[clamp(1.35rem,2vw,1.7rem)] leading-tight text-ivory group-hover:text-bronze-light transition-colors duration-500">
                  {s.title}
                </p>
                {s.body && (
                  <p className="mt-3 text-[14px] font-light leading-relaxed text-ivory-soft">{s.body}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Chapter>
  )
}
