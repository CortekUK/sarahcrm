import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { MetaLink } from '@/components/website/forms/SiteButton'
import { NightHero, eyebrowClass, ledeClass } from '@/components/website/night/partner/blocks'
import { HOSPITALITY_PUBLIC, PARTNER_INTRO } from '@/components/website/night/partner/content'
import { cn } from '@/lib/utils'

// /partner — Partner With Us hub: Sponsorship · Curated Corporate Events,
// plus a smaller link to Membership (and Hospitality partnership while
// HOSPITALITY_PUBLIC). Intro copy to be supplied by Sarah (hidden while empty).

const DESCRIPTION =
  'Sponsorship and curated corporate events from The Club, for brands and businesses that want the right people in the room.'

export const metadata: Metadata = {
  title: 'Partner With Us | The Club by Sarah Restrick',
  description: DESCRIPTION,
  alternates: { canonical: '/partner' },
  openGraph: { title: 'Partner With Us | The Club by Sarah Restrick', description: DESCRIPTION },
}

const TILES = [
  {
    href: '/partner/sponsorship',
    eyebrow: 'From £5,000 per event',
    title: 'Sponsorship',
    body: 'Presence, introductions and content at one event or across the year.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/partner/sponsorship-speaker.jpg',
    alt: 'A partner brand speaking to guests at an event by The Club',
  },
  {
    href: '/partner/corporate-events',
    eyebrow: 'Per brief',
    title: 'Curated Corporate Events',
    body: 'The Club designs and runs an event for your own clients or team, with or without guests from our network.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/partner/corporate-table.jpg',
    alt: 'A dinner table dressed with candles and white flowers',
  },
]

export default function PartnerHubPage() {
  return (
    <>
      <NightHero
        image="https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/partner/partner-hero-long-table.jpg"
        alt="A long dinner table set by The Club in a city venue"
        eyebrow="Partner With Us"
        title="For brands and businesses."
        lede={PARTNER_INTRO || undefined}
      />

      <Chapter density="tight" bg="ink">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TILES.map((t, i) => (
            <Reveal key={t.href} type="up" delay={i * 120}>
              <Link
                href={t.href}
                className="group block border border-graphite-line/60 bg-graphite/40 day:bg-white day:shadow-sm hover:border-bronze/60 transition-colors duration-500"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={t.image}
                    alt={t.alt}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-[1.6s] group-hover:scale-[1.04]"
                  />
                </div>
                <div className="p-7 lg:p-10">
                  <p className={eyebrowClass}>{t.eyebrow}</p>
                  <h2 className="mt-4 display-sm">{t.title}</h2>
                  <p className="mt-4 text-[15px] leading-relaxed text-ivory-soft">{t.body}</p>
                  <span className="mt-8 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.3em] text-bronze-light">
                    Explore <ArrowUpRight size={13} strokeWidth={1.5} />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>

        <Reveal type="up" delay={200}>
          <div className="mt-14 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-10 border-t border-graphite-line/50 pt-10">
            <p className={cn(ledeClass, '!text-[16px]')}>Looking to join The Club yourself?</p>
            <div className="flex flex-wrap gap-6">
              <MetaLink href="/memberships">The Club Membership</MetaLink>
              {HOSPITALITY_PUBLIC && <MetaLink href="/partner/venues">Hospitality partnership</MetaLink>}
            </div>
          </div>
        </Reveal>
      </Chapter>
    </>
  )
}
