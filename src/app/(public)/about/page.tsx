import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { ClubNumbers } from '@/components/website/night/about/ClubNumbers'
import { BarList } from '@/components/website/night/about/BarList'
import { EcosystemGraphic } from '@/components/website/night/about/EcosystemGraphic'
import { getClubStats } from '@/lib/cms/club-stats'

const DESCRIPTION =
  "A private members' club for founders, owners, senior executives and high-net-worth individuals, meeting through a calendar of luxury events at five-star venues across the UK and beyond."

export const metadata: Metadata = {
  title: 'The Club | The Club by Sarah Restrick',
  description: DESCRIPTION,
  openGraph: {
    title: 'The Club | The Club by Sarah Restrick',
    description: DESCRIPTION,
    images: ['https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/site/sarah-restrick-portrait.jpg'],
  },
}

// Figures are edited in the CMS (app_settings 'club_stats'); the admin save
// flushes this path, the window below is just the safety net.
export const revalidate = 300

// ─────────────────────────────────────────────────────────────────────
// /about — "The Club". Carries the brochure's Section I (The Club) and
// Section II (Reach), in the brief's order:
//   Welcome · The Club in numbers · The ecosystem · Personas ·
//   Database by sector · Regions + company size · Beyond the room ·
//   Brands we work with · The Club platform · CTA band
// Every figure / chart reads from getClubStats() (one editable source).
// Copy is the brochure's, verbatim.
// ─────────────────────────────────────────────────────────────────────

const PERSONAS: { title: string; body: string }[] = [
  {
    title: 'Ultra-high-net-worth',
    body: 'Individuals, families and family offices with private travel, collections and property',
  },
  {
    title: 'High-net-worth',
    body: 'Private clients and their families, entrepreneurs, talent and influencers',
  },
  {
    title: 'Founders & owners',
    body: '£1m–£100m+ businesses across corporate, luxury, lifestyle and hospitality',
  },
  { title: 'C-suite', body: 'Board-level decision makers across every sector' },
  {
    title: 'Investors',
    body: 'Angels, VCs, private investors, hedge funds and family offices',
  },
  {
    title: 'Luxury brands',
    body: 'Prestige retailers of cars, watches, art, jewellery and property',
  },
  {
    title: 'Venues',
    body: 'Five-star hotels, restaurants and nightlife in the UK, Europe and worldwide',
  },
]

const BRAND_ROWS: { category: string; brands: string[] }[] = [
  {
    category: 'Retail & Fashion',
    brands: ['Harrods', 'Selfridges', 'Harvey Nichols', 'Louis Vuitton', 'Ralph Lauren', 'Elite Pre Loved'],
  },
  { category: 'Watches & Jewellery', brands: ['Tiffany', 'Boodles', 'Mappin & Webb', 'AP Watches'] },
  {
    category: 'Automotive & Aviation',
    brands: ['HR Owen', 'Sytner', 'Stratstone', 'Atlas Helicopters', 'JET365', 'The Needs Group', 'Levare Aviation'],
  },
  {
    category: 'Finance & Professional',
    brands: [
      'Brown Shipley',
      'UBS',
      'Gallagher Insurance',
      'Together Money',
      'Ramsey Crookall',
      'TL Dallas',
      'JMW',
      'Myerson',
      'Sedulo',
      'Sinclair Law',
    ],
  },
  {
    category: 'Property & Lifestyle',
    brands: ['The Property Buying Co.', 'Mistoria Group', 'Black Label Supply', 'SGR Construction', 'ThinkUP'],
  },
  { category: 'Technology & Services', brands: ['Cloud Geeks', 'zally AI', 'DMR Training', 'Precursor'] },
]

const PLATFORM: { title: string; body: string }[] = [
  {
    title: 'Automated introductions',
    body: 'Members matched by client type, sector, assets and location, then tracked through to revenue',
  },
  {
    title: 'Events',
    body: 'Invitations to profiled guest lists, with booking, guest data and follow-up in one place',
  },
  {
    title: 'Qualified marketing',
    body: 'Campaigns to the segments that match your ideal client, with no competitor in your category',
  },
  {
    title: 'Benefits & access',
    body: 'Member profile, loyalty card, partner rates and event access in one app',
  },
  {
    title: "Members' Forum",
    body: 'A private feed and groups for requests, offers and referrals between members',
  },
  { title: 'Reporting', body: 'Introductions, conversions and commission tracked for ROI' },
]

const eyebrowClass =
  'font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.36em] text-bronze-light'

export default async function AboutPage() {
  const stats = await getClubStats()

  return (
    <>
      {/* ── Welcome to The Club ─────────────────────────────────── */}
      <section className="bg-ink pt-32 pb-20 lg:pt-44 lg:pb-28">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="lg:col-span-7">
              <Reveal type="up" delay={0}>
                <EditorialMeta label="Welcome to The Club" />
              </Reveal>
              <Reveal type="clip" delay={150}>
                <h1 className="display-lg mt-10 mb-10 text-ivory">
                  Connecting leaders in business through{' '}
                  <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">
                    luxury experience.
                  </em>
                </h1>
              </Reveal>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10 max-w-2xl">
                <Reveal type="up" delay={350}>
                  <p className="body-prose">
                    A private members&apos; club for founders, owners, senior executives and
                    high-net-worth individuals, meeting through a calendar of luxury events at
                    five-star venues across the UK and beyond.
                  </p>
                </Reveal>
                <Reveal type="up" delay={500}>
                  <p className="body-prose">
                    Value comes from strategy and direct introductions. Membership is capped and by
                    referral, and every applicant is vetted to protect the quality of the room.
                  </p>
                </Reveal>
              </div>
            </div>
            <div className="lg:col-span-5">
              <Reveal type="scale" delay={200}>
                <div className="relative aspect-[594/844] max-w-[460px] mx-auto lg:ml-auto overflow-hidden border border-graphite-line/40">
                  <Image
                    src="https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/site/sarah-restrick-portrait.jpg"
                    alt="Sarah Restrick, founder of The Club"
                    fill
                    priority
                    sizes="(min-width: 1024px) 34vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="mt-5 flex items-center gap-3 max-w-[460px] mx-auto lg:ml-auto">
                  <span className="h-px w-8 bg-bronze/55" />
                  <p className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light">
                    Sarah Restrick
                  </p>
                  <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.24em] text-slate-haze">
                    Founder
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Club in numbers (shared with the homepage) ───────── */}
      <ClubNumbers tiles={stats.numbers} bg="graphite" />

      {/* ── The ecosystem ────────────────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-16 items-center">
          <div className="lg:col-span-6">
            <Reveal type="up" delay={0}>
              <EditorialMeta label="The ecosystem" />
            </Reveal>
            <Reveal type="clip" delay={150}>
              <h2 className="display-md mt-8 mb-8 text-ivory">
                One room.{' '}
                <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">
                  Every network in it.
                </em>
              </h2>
            </Reveal>
            <Reveal type="up" delay={300}>
              <p className="body-prose max-w-xl">
                Membership opens more than our own network. Every member brings their connections,
                and every brand partner opens doors to its private clients. One introduction leads to
                the next.
              </p>
            </Reveal>
            {stats.ecosystem.length > 0 && (
              <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 max-w-xl">
                {stats.ecosystem.map((t, i) => (
                  <Reveal key={`${t.value}-${i}`} type="up" delay={400 + i * 100} className="min-w-0">
                    <p className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2.2vw,2.25rem)] leading-none text-ivory">
                      {t.value}
                    </p>
                    <p className="mt-3 font-[family-name:var(--font-meta)] text-[9.5px] sm:text-[10px] uppercase tracking-[0.24em] text-slate-haze leading-relaxed">
                      {t.label}
                    </p>
                  </Reveal>
                ))}
              </div>
            )}
            <Reveal type="up" delay={700}>
              <p className="mt-10 font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft max-w-xl">
                Founders, owners, investors, C-suite, HNW and UHNW individuals, and local to global
                brands.
              </p>
            </Reveal>
          </div>
          <div className="lg:col-span-6">
            <Reveal type="scale" delay={200}>
              <EcosystemGraphic />
            </Reveal>
          </div>
        </div>
      </Chapter>

      {/* ── Who The Club puts in the room ───────────────────────── */}
      <Chapter density="tight" bg="graphite">
        <div className="max-w-3xl mb-12">
          <Reveal type="up" delay={0}>
            <EditorialMeta label="Reach · Our personas" />
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h2 className="display-md mt-8 text-ivory">
              Who The Club puts{' '}
              <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">
                in the room
              </em>
              .
            </h2>
          </Reveal>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PERSONAS.map((p, i) => (
            <Reveal
              key={p.title}
              type="up"
              delay={i * 80}
              className="border border-graphite-line/60 bg-ink/40 p-7 lg:p-8"
            >
              <p className="font-[family-name:var(--font-display)] text-[22px] leading-tight text-ivory">
                {p.title}
              </p>
              <span aria-hidden className="block h-px w-8 bg-bronze/60 my-4" />
              <p className="text-[14px] font-light leading-relaxed text-ivory-soft">{p.body}</p>
            </Reveal>
          ))}
        </div>
      </Chapter>

      {/* ── The database by sector ──────────────────────────────── */}
      {stats.sectors.length > 0 && (
        <Chapter density="tight" bg="ink">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
            <div className="lg:col-span-4">
              <Reveal type="up" delay={0}>
                <EditorialMeta label="Reach · Demographics" />
              </Reveal>
              <Reveal type="clip" delay={150}>
                <h2 className="display-md mt-8 text-ivory">
                  The database{' '}
                  <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">
                    by sector
                  </em>
                  .
                </h2>
              </Reveal>
              {stats.sectors_source && (
                <p className="mt-8 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze">
                  Source: {stats.sectors_source}
                </p>
              )}
            </div>
            <div className="lg:col-span-8">
              <BarList bars={stats.sectors} dense />
            </div>
          </div>
        </Chapter>
      )}

      {/* ── Where they are, and the businesses they run ─────────── */}
      {(stats.regions.length > 0 || stats.company_size.length > 0) && (
        <Chapter density="tight" bg="graphite">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
            <Reveal type="clip" delay={0}>
              <h2 className="display-md text-ivory max-w-3xl">
                Where they are, and the businesses{' '}
                <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">
                  they run
                </em>
                .
              </h2>
            </Reveal>
            {stats.demographics_stamp && (
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze shrink-0">
                {stats.demographics_stamp}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            <BarList bars={stats.regions} caption="By region" />
            <BarList bars={stats.company_size} caption="By company size (employees)" />
          </div>
          {stats.company_size_note && (
            <p className="mt-14 font-[family-name:var(--font-editorial)] italic text-[clamp(1.1rem,1.6vw,1.4rem)] leading-relaxed text-ivory max-w-3xl">
              {stats.company_size_note}
            </p>
          )}
        </Chapter>
      )}

      {/* ── Beyond the room ─────────────────────────────────────── */}
      {(stats.beyond.length > 0 || stats.channels.length > 0) && (
        <Chapter density="tight" bg="ink">
          <div className="max-w-3xl mb-12">
            <Reveal type="up" delay={0}>
              <EditorialMeta label="Reach · Digital" />
            </Reveal>
            <Reveal type="clip" delay={150}>
              <h2 className="display-md mt-8 text-ivory">
                Beyond the room:{' '}
                <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">
                  CRM, social and content
                </em>
                .
              </h2>
            </Reveal>
          </div>
          {stats.beyond.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10">
              {stats.beyond.map((t, i) => (
                <Reveal key={`${t.value}-${i}`} type="up" delay={i * 90} className="border-t border-bronze/40 pt-6">
                  <p className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,3rem)] leading-none text-ivory">
                    {t.value}
                  </p>
                  <p className="mt-4 text-[14px] font-light leading-relaxed text-ivory-soft">{t.label}</p>
                </Reveal>
              ))}
            </div>
          )}
          {stats.channels.length > 0 && (
            <div className="mt-14 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 border-t border-graphite-line/60 pt-10">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-12">
                {stats.channels.map((c, i) => (
                  <div key={`${c.label}-${i}`}>
                    <dt className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-bronze-light">
                      {c.label}
                    </dt>
                    <dd className="mt-2 font-[family-name:var(--font-display)] text-[clamp(1.6rem,2.4vw,2.1rem)] text-ivory tabular-nums">
                      {c.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {stats.audience_notes.length > 0 && (
                <div className="space-y-1">
                  {stats.audience_notes.map((n) => (
                    <p key={n} className="text-[13px] font-light text-slate-haze">
                      {n}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </Chapter>
      )}

      {/* ── The brands we work with ─────────────────────────────── */}
      <Chapter density="tight" bg="graphite">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-4">
            <Reveal type="up" delay={0}>
              <EditorialMeta label="Reach · Brand partners" />
            </Reveal>
            <Reveal type="clip" delay={150}>
              <h2 className="display-md mt-8 text-ivory">
                The brands{' '}
                <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">
                  we work with
                </em>
                .
              </h2>
            </Reveal>
          </div>
          <dl className="lg:col-span-8 divide-y divide-graphite-line/60 border-y border-graphite-line/60">
            {BRAND_ROWS.map((row) => (
              <div key={row.category} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-6 py-5">
                <dt className="sm:col-span-4 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.3em] text-bronze-light pt-1">
                  {row.category}
                </dt>
                <dd className="sm:col-span-8 text-[15px] font-light leading-relaxed text-ivory-soft">
                  {row.brands.join(' · ')}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Chapter>

      {/* ── The Club platform ───────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          <div className="lg:col-span-4">
            <Reveal type="up" delay={0}>
              <EditorialMeta label="The Club platform" />
            </Reveal>
            <Reveal type="clip" delay={150}>
              <h2 className="display-md mt-8 text-ivory">
                Our own CRM{' '}
                <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">
                  and member web app
                </em>
                .
              </h2>
            </Reveal>
            <Reveal type="up" delay={300}>
              <p className="body-prose mt-8">
                Launching with the new membership. Every contact is profiled by sector, role,
                turnover, assets and location, so introductions, invitations and campaigns reach the
                right people.
              </p>
            </Reveal>
          </div>
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PLATFORM.map((t, i) => (
              <Reveal
                key={t.title}
                type="up"
                delay={i * 80}
                className="border border-graphite-line/60 p-7"
              >
                <p className="font-[family-name:var(--font-display)] text-[20px] text-ivory">{t.title}</p>
                <p className="mt-3 text-[14px] font-light leading-relaxed text-ivory-soft">{t.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
        <Reveal type="up" delay={200}>
          <p className="mt-16 text-center font-[family-name:var(--font-editorial)] italic text-[clamp(1.35rem,2.4vw,2rem)] leading-snug text-ivory max-w-3xl mx-auto">
            Partners can now reach our full profiled database of{' '}
            <span className="text-bronze-light not-italic font-[family-name:var(--font-display)]">7,000+</span>.
          </p>
        </Reveal>
      </Chapter>

      {/* ── CTA band ────────────────────────────────────────────── */}
      <section className="always-night bg-plum py-20 md:py-24">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col md:flex-row md:items-center md:justify-between gap-10">
          <div>
            <p className={eyebrowClass}>Working with us</p>
            <h2 className="display-md mt-5 text-ivory max-w-2xl">
              Membership, sponsorship and{' '}
              <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">
                hospitality partnership
              </em>
              .
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <CtaLink href="/membership-application" primary>
              Apply for Membership
            </CtaLink>
            <CtaLink href="/partner">Partner With Us</CtaLink>
          </div>
        </div>
      </section>
    </>
  )
}

function CtaLink({
  href,
  primary = false,
  children,
}: {
  href: string
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={
        'group inline-flex items-center justify-center gap-3 min-h-[48px] px-8 py-3.5 rounded-full border font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.3em] transition-colors duration-500 ' +
        (primary
          ? 'border-bronze bg-bronze text-ink hover:bg-bronze-light'
          : 'border-bronze/60 text-bronze-light hover:border-bronze hover:text-ivory')
      }
    >
      {children}
      <ArrowUpRight
        size={14}
        strokeWidth={1.5}
        className="transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
      />
    </Link>
  )
}
