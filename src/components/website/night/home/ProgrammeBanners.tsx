import Link from 'next/link'
import { HARRODS_APPROVED } from '@/components/website/night/london/content'
import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'

// Two half-width banners: PITCH and the London Series at Harrods. The
// imagery is The Club's own photography (no Harrods deck assets here — those
// need Harrods approval and live behind the London Series page's flag).

const BANNERS = [
  {
    href: '/pitch',
    eyebrow: 'PITCH by Sarah Restrick',
    title: 'PITCH',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/site/pitch-banner.jpg',
    alt: 'A bar lit for an evening event',
  },
  {
    href: HARRODS_APPROVED ? '/london-series' : '/events?programme=london_series',
    eyebrow: 'The London Series',
    title: 'London Series at Harrods',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/site/private-dining-long-table.jpg',
    alt: 'A long table dressed for a private dinner',
  },
] as const

export function ProgrammeBanners() {
  return (
    <section className="always-night bg-ink">
      <div className="grid grid-cols-1 md:grid-cols-2">
        {BANNERS.map((b) => (
          <Link
            key={b.href}
            href={b.href}
            className="group relative block aspect-[4/3] sm:aspect-[16/10] overflow-hidden"
          >
            <Image
              src={b.image}
              alt={b.alt}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/45 to-ink/10" />
            <div className="film-grain-night" />
            <div className="absolute inset-x-0 bottom-0 p-7 sm:p-10 lg:p-12">
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.38em] text-bronze-light">
                {b.eyebrow}
              </p>
              <p className="mt-4 flex items-end justify-between gap-4 font-[family-name:var(--font-display)] text-[clamp(1.75rem,3vw,2.75rem)] leading-[1.05] text-ivory">
                {b.title}
                <ArrowUpRight
                  size={22}
                  strokeWidth={1.25}
                  className="shrink-0 text-bronze-light transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
                />
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
