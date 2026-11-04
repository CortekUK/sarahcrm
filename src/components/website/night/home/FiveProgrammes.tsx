import Link from 'next/link'
import { HARRODS_APPROVED } from '@/components/website/night/london/content'
import { ArrowUpRight } from 'lucide-react'
import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { Reveal } from '../effects/Reveal'

// "Five programmes, one calendar" — each tile links to the filtered Events
// view (/events?programme=<key>, keys match events.programme) or, for PITCH
// and the London Series, to its own page.

const PROGRAMMES: { title: string; href: string }[] = [
  { title: 'Member Events', href: '/events?programme=member_event' },
  { title: 'Round Tables', href: '/events?programme=round_table' },
  { title: 'PITCH', href: '/pitch' },
  { title: 'Curated Experiences', href: '/events?programme=curated_experience' },
  { title: 'London Series at Harrods', href: HARRODS_APPROVED ? '/london-series' : '/events?programme=london_series' },
]

export function FiveProgrammes() {
  return (
    <Chapter density="tight" bg="ink">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-12">
        <div className="max-w-3xl">
          <Reveal type="up" delay={0}>
            <EditorialMeta label="The calendar" />
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h2 className="display-md mt-8 text-ivory">
              Five programmes,{' '}
              <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">
                one calendar
              </em>
              .
            </h2>
          </Reveal>
        </div>
        <Link
          href="/events"
          className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300 group"
        >
          Every event
          <ArrowUpRight
            size={14}
            strokeWidth={1.5}
            className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
          />
        </Link>
      </div>

      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {PROGRAMMES.map((p, i) => (
          <li key={p.title}>
            <Link
              href={p.href}
              className="group flex h-full min-h-[150px] lg:min-h-[200px] flex-col justify-between border border-bronze/30 p-6 lg:p-7 transition-colors duration-500 hover:border-bronze hover:bg-bronze/10"
            >
              <span className="font-[family-name:var(--font-meta)] text-[11px] tracking-[0.25em] tabular-nums text-bronze-light/80">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="flex items-end justify-between gap-3">
                <span className="font-[family-name:var(--font-display)] text-[clamp(1.3rem,1.7vw,1.6rem)] leading-tight text-ivory">
                  {p.title}
                </span>
                <ArrowUpRight
                  size={16}
                  strokeWidth={1.5}
                  className="shrink-0 text-bronze-light transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Chapter>
  )
}
