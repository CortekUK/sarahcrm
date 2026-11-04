import type { Metadata } from 'next'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { PillLink } from '@/components/website/forms/SiteButton'
import {
  CardGrid,
  FormPanel,
  NightHero,
  SectionHead,
  SimpleTable,
  StatGrid,
  TierCards,
  bodyClass,
  eyebrowClass,
  ledeClass,
} from '@/components/website/night/partner/blocks'
import {
  EventCards,
  PROGRAMME_EVENT_COLUMNS,
  type ProgrammeEvent,
} from '@/components/website/night/partner/EventCards'
import { caseStudyCards, portfolioSlugs } from '@/components/website/night/partner/caseStudies'
import { LondonInvitationForm, LondonPartnerForm } from '@/components/website/night/london/LondonForms'
import {
  BLUEPRINT,
  BRANDS_CONVERTED,
  BUILT_FOR,
  COMPARISON,
  HARRODS_APPROVED,
  HARRODS_CHANNELS,
  HARRODS_CHANNELS_NOTE,
  HARRODS_CLIENT_SOURCE,
  HARRODS_CLIENT_STATS,
  HARRODS_RESULTS,
  HARRODS_RESULTS_NOTE,
  HELIDECK_HERO,
  LONDON_HERO,
  LONDON_TITLE,
  NEUTRAL_HERO,
  TIERS,
  TIERS_FOOTNOTE,
  VENUE_COPY,
  VENUE_FACTS,
  WAYS_IN,
  WHO_IN_ROOM,
  WHO_IN_ROOM_LINE,
  detailFor,
} from '@/components/website/night/london/content'
import { cn } from '@/lib/utils'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────
// /london-series — The Club | London at Harrods — The Helideck Series.
// Built from The Harrods London Series deck. Everything Harrods-owned
// (photography, client data, channel prices, third-party results) waits
// on HARRODS_APPROVED; until then the route is noindex and kept out of
// nav / footer / sitemap.
// ─────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: LONDON_TITLE,
  description: LONDON_HERO,
  alternates: { canonical: '/london-series' },
  openGraph: { title: LONDON_TITLE, description: LONDON_HERO },
  ...(HARRODS_APPROVED ? {} : { robots: { index: false, follow: false } }),
}

export const revalidate = 60

export default async function LondonSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const [{ data }, slugs] = await Promise.all([
    supabase
      .from('events')
      .select(PROGRAMME_EVENT_COLUMNS)
      .eq('programme', 'london_series')
      .in('status', ['published', 'live'])
      .gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true })
      .limit(12),
    portfolioSlugs(supabase as unknown as SupabaseClient),
  ])
  const events = (data ?? []) as unknown as ProgrammeEvent[]
  const eventTitles = events.map((e) => e.title)
  const preselect = sp.event ? events.find((e) => e.slug === sp.event)?.title : undefined

  return (
    <>
      <NightHero
        tall
        image={HARRODS_APPROVED ? HELIDECK_HERO : NEUTRAL_HERO}
        alt={HARRODS_APPROVED ? 'The Harrods Helideck at dusk above Knightsbridge' : 'A long table set for a private dinner by The Club'}
        eyebrow="The Club | London at Harrods · 2026 – 2027"
        title="The Helideck Series."
        lede={LONDON_HERO}
      >
        <PillLink href="#partner-enquiry">Partner on an event</PillLink>
        <PillLink href="#invitation">Request an invitation</PillLink>
      </NightHero>

      {/* ── Two ways in ─────────────────────────────────────── */}
      <Chapter density="tight" bg="ink" id="opportunity">
        <SectionHead eyebrow="The opportunity" title="Two ways to reach the Harrods client." />
        <CardGrid items={WAYS_IN} cols={2} />
        <Reveal type="up" delay={150}>
          <p className={cn(bodyClass, 'mt-10 max-w-4xl')}>{BUILT_FOR}</p>
        </Reveal>
      </Chapter>

      {/* ── The venue ───────────────────────────────────────── */}
      <Chapter density="tight" bg="graphite" id="venue">
        <div className={cn('grid grid-cols-1 gap-12', HARRODS_APPROVED && 'lg:grid-cols-12 lg:gap-16')}>
          <div className={HARRODS_APPROVED ? 'lg:col-span-7' : ''}>
            <SectionHead eyebrow="The venue" title="The Harrods Helideck." lede={VENUE_COPY} />
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-graphite-line/50 border border-graphite-line/50">
              {VENUE_FACTS.map((f) => (
                <div key={f.label} className="bg-graphite p-5">
                  <dt className="font-[family-name:var(--font-display)] text-[1.75rem] leading-none text-bronze-light">
                    {f.figure}
                  </dt>
                  <dd className="mt-3 text-[13px] leading-snug text-ivory-soft">{f.label}</dd>
                </div>
              ))}
            </dl>
          </div>
          {HARRODS_APPROVED && (
            <div className="lg:col-span-5 relative aspect-[4/5] overflow-hidden border border-graphite-line/60">
              <Image
                src="https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/london-series/harrods/helideck-dinner.jpg"
                alt="Dinner set in the pavilion on the Harrods Helideck"
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-cover"
              />
            </div>
          )}
        </div>
      </Chapter>

      {/* ── Who's in the room ───────────────────────────────── */}
      <Chapter density="tight" bg="ink" id="audience">
        <SectionHead eyebrow="The audience" title="Who’s in the room." />
        <CardGrid items={WHO_IN_ROOM} cols={3} />
        <Reveal type="up" delay={150}>
          <p className={cn(ledeClass, 'mt-10 max-w-3xl')}>{WHO_IN_ROOM_LINE}</p>
        </Reveal>
      </Chapter>

      {/* ── Harrods client data (approval only) ─────────────── */}
      {HARRODS_APPROVED && (
        <Chapter density="tight" bg="graphite" id="harrods-client">
          <SectionHead eyebrow="The Harrods client" title="The audience behind the invitation." />
          <StatGrid items={HARRODS_CLIENT_STATS} />
          <p className="mt-6 text-[12.5px] text-slate-haze">{HARRODS_CLIENT_SOURCE}</p>
        </Chapter>
      )}

      {/* ── Six events, one rooftop ─────────────────────────── */}
      <Chapter density="default" bg="ink" id="events">
        <SectionHead eyebrow="The series · 2026 – 2027" title="Six events, one rooftop." />
        {events.length > 0 ? (
          <EventCards
            events={events}
            hrefBase="/london-series"
            useCover={HARRODS_APPROVED}
            imageFor={(e) => (HARRODS_APPROVED ? detailFor(e.title)?.image ?? null : null)}
          />
        ) : (
          <p className={ledeClass}>The full series calendar is being finalised — enquire for dates.</p>
        )}
      </Chapter>

      {/* ── The Club blueprint ──────────────────────────────── */}
      <Chapter density="default" bg="graphite" id="blueprint" className="relative">
        <Aurora variant="soft" />
        <div className="relative z-10">
          <SectionHead eyebrow="The Club blueprint" title="One event, built end to end by The Club." />
          <CardGrid items={BLUEPRINT} cols={4} />
          <Reveal type="up" delay={0}>
            <p className="mt-12 display-sm">Your brand takes over the room. We carry the event.</p>
          </Reveal>
          <Reveal type="up" delay={120}>
            <div className="mt-12">
              <p className={cn(eyebrowClass, 'mb-4')}>Brands we have converted business for</p>
              <p className={cn(bodyClass, 'max-w-5xl')}>{BRANDS_CONVERTED}</p>
            </div>
          </Reveal>
        </div>
      </Chapter>

      {/* ── Comparison ──────────────────────────────────────── */}
      <Chapter density="tight" bg="ink" id="why">
        <SectionHead eyebrow="Why partner with The Club" title="Building it yourself, or taking over ours." />
        <SimpleTable head={COMPARISON.head} rows={COMPARISON.rows} caption={COMPARISON.line} />
      </Chapter>

      {/* ── Event partnership tiers ─────────────────────────── */}
      <Chapter density="default" bg="graphite" id="tiers">
        <SectionHead eyebrow="Event partnership" title="Partnering on a Helideck event." />
        <TierCards tiers={TIERS} footnote={TIERS_FOOTNOTE} />
      </Chapter>

      {/* ── Harrods campaign channels + results (approval only) ─ */}
      {HARRODS_APPROVED && (
        <Chapter density="default" bg="ink" id="campaign">
          <SectionHead eyebrow="Harrods campaign partnership" title="Harrods channels, managed by The Club." />
          <SimpleTable head={['Channel', 'Duration', 'Indicative range']} rows={HARRODS_CHANNELS} caption={HARRODS_CHANNELS_NOTE} />
          <div className="mt-20">
            <SectionHead eyebrow="Harrods partner results" title="What brands have achieved at Harrods." />
            <StatGrid items={HARRODS_RESULTS} />
            <p className="mt-6 text-[12.5px] text-slate-haze">{HARRODS_RESULTS_NOTE}</p>
          </div>
        </Chapter>
      )}

      {/* ── Case studies ────────────────────────────────────── */}
      <Chapter density="default" bg={HARRODS_APPROVED ? 'graphite' : 'ink'} id="case-studies">
        <SectionHead eyebrow="Case studies" title="Introductions that sell." />
        <CardGrid items={caseStudyCards(['hr-owen', 'brand-and-influence', 'gleneagles'], slugs)} cols={3} />
      </Chapter>

      {/* ── Forms ───────────────────────────────────────────── */}
      <Chapter density="default" bg="graphite" id="enquire">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <FormPanel
            id="partner-enquiry"
            eyebrow="Partnership enquiries"
            title="Let’s put your brand in the room."
          >
            <LondonPartnerForm events={eventTitles} initialEvent={preselect} />
          </FormPanel>
          <FormPanel
            id="invitation"
            eyebrow="Guests"
            title="Request an invitation."
            lede="Every Helideck event is by invitation. Requests are approved individually."
          >
            <LondonInvitationForm events={eventTitles} initialEvent={preselect} />
          </FormPanel>
        </div>
      </Chapter>
    </>
  )
}
