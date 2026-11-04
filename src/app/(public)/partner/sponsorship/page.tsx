import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { PillLink } from '@/components/website/forms/SiteButton'
import {
  CardGrid,
  FormPanel,
  NightHero,
  RuleList,
  SectionHead,
  SimpleTable,
  bodyClass,
  eyebrowClass,
} from '@/components/website/night/partner/blocks'
import { SponsorshipForm } from '@/components/website/night/partner/PartnerForms'
import {
  ANNUAL_CASES,
  ANNUAL_PILLARS,
  PACKAGE_INCLUDES,
  SEEN_BY,
  SPONSOR_OPTIONS,
  SPONSOR_TABLE,
} from '@/components/website/night/partner/content'
import { cn } from '@/lib/utils'

// /partner/sponsorship — "One moment, or the full year". Accepts
// ?event=<slug> (the "Sponsor this event" link on event pages) and
// pre-fills the enquiry form with that event.

const DESCRIPTION =
  'Join the calendar where it serves your objective, or headline across the year. Sponsorship with The Club from £5,000 + VAT per event.'

export const metadata: Metadata = {
  title: 'Sponsorship | Partner With Us | The Club',
  description: DESCRIPTION,
  alternates: { canonical: '/partner/sponsorship' },
  openGraph: { title: 'Sponsorship | The Club by Sarah Restrick', description: DESCRIPTION },
}

export default async function SponsorshipPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const { event: slug } = await searchParams
  let eventTitle: string | undefined
  let eventSlug: string | undefined
  if (slug && /^[a-z0-9-]{1,120}$/i.test(slug)) {
    // As the visitor — RLS only returns public, published events.
    const supabase = await createClient()
    const { data } = await supabase
      .from('events')
      .select('slug, title')
      .eq('slug', slug)
      .in('status', ['published', 'live'])
      .maybeSingle()
    if (data) {
      eventTitle = data.title
      eventSlug = data.slug
    }
  }

  return (
    <>
      <NightHero
        image="https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/partner/sponsorship-hero-bar.jpg"
        alt="A busy bar at an evening event hosted by The Club"
        eyebrow="Sponsorship & hosting"
        title="One moment, or the full year."
        lede="Join the calendar where it serves your objective, or headline across the year."
      >
        <PillLink href="#enquire">Enquire about sponsorship</PillLink>
      </NightHero>

      {/* ── Six options ─────────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <SectionHead eyebrow="Ways in" title="Six ways to be in the room." />
        <CardGrid items={SPONSOR_OPTIONS} cols={3} />
        <Reveal type="up" delay={150}>
          <div className="mt-12">
            <p className={cn(eyebrowClass, 'mb-5')}>Every package includes</p>
            <RuleList items={PACKAGE_INCLUDES} className="md:flex md:gap-12 md:space-y-0" />
          </div>
        </Reveal>
      </Chapter>

      {/* ── Opportunities table ─────────────────────────────── */}
      <Chapter density="tight" bg="graphite">
        <SectionHead eyebrow="All prices + VAT" title="Sponsorship opportunities." />
        <SimpleTable head={SPONSOR_TABLE.head} rows={SPONSOR_TABLE.rows} caption={SPONSOR_TABLE.note} />
      </Chapter>

      {/* ── Annual partnership ──────────────────────────────── */}
      <Chapter density="default" bg="ink" className="relative">
        <Aurora variant="soft" />
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHead
              eyebrow="Annual partnership · from £50,000 + VAT"
              title="A year built around your brand."
              lede="For businesses that want the full weight of The Club behind them. Every partnership is bespoke: marketing, events and PR across the calendar, shaped to your objectives."
              className="!mb-10"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-7">
              {ANNUAL_PILLARS.map((p, i) => (
                <Reveal key={p.title} type="up" delay={i * 80}>
                  <p className="font-[family-name:var(--font-display)] text-[1.25rem] text-ivory">{p.title}</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ivory-soft">{p.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
          <div className="lg:col-span-7">
            <p className={cn(eyebrowClass, 'mb-5')}>Case studies</p>
            <SimpleTable head={['Partner', 'Invested', 'Return']} rows={ANNUAL_CASES} />
            <Reveal type="up" delay={100}>
              <div className="mt-8 flex flex-wrap gap-x-12 gap-y-4">
                <p className="font-[family-name:var(--font-display)] italic text-[clamp(1.75rem,3vw,2.5rem)] text-bronze-light">
                  £460k invested
                </p>
                <p className="font-[family-name:var(--font-display)] italic text-[clamp(1.75rem,3vw,2.5rem)] text-ivory">
                  £7m+ returned
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </Chapter>

      {/* ── Marketing, PR & Commercial Partnerships ─────────── */}
      <Chapter density="tight" bg="graphite">
        <SectionHead eyebrow="Marketing, PR & Commercial Partnerships" title="Seen by the people who matter to you." />
        <CardGrid items={SEEN_BY} cols={4} />
      </Chapter>

      {/* ── Enquiry ─────────────────────────────────────────── */}
      <Chapter density="default" bg="ink" id="enquire" className="scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <FormPanel
            id="sponsorship-enquiry"
            eyebrow="Sponsorship enquiry"
            title={eventTitle ? `Sponsor ${eventTitle}.` : 'Tell us what you want to achieve.'}
          >
            <SponsorshipForm eventTitle={eventTitle} eventSlug={eventSlug} />
          </FormPanel>
          <p className={cn(bodyClass, 'mt-8 !text-[13.5px] !text-slate-haze')}>
            Prefer to talk? events@theclubgroup.co · +44 (0)7921 507 442
          </p>
        </div>
      </Chapter>
    </>
  )
}
