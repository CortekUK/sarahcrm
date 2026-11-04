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
  RuleList,
  SectionHead,
  SimpleTable,
  StatGrid,
  TierCards,
  bodyClass,
  eyebrowClass,
} from '@/components/website/night/partner/blocks'
import {
  EventCards,
  PROGRAMME_EVENT_COLUMNS,
  type ProgrammeEvent,
} from '@/components/website/night/partner/EventCards'
import {
  FounderApplicationForm,
  InvestorApplicationForm,
  InvestorInterestForm,
  PitchPartnerForm,
} from '@/components/website/night/pitch/PitchForms'
import {
  FOUNDERS_REEL,
  PITCH_LEGAL_APPROVED,
  PODCAST_EPISODES,
  PODCAST_SUBSCRIBE,
} from '@/components/website/night/pitch/content'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// /pitch — PITCH® by Sarah Restrick (brief: "PITCH (new landing page)").
// Three audiences, three forms: founders (apply to pitch), investors (the
// Investor Panel — gated behind PITCH_LEGAL_APPROVED until Myerson signs
// off), partners (sponsorship enquiry).
//
// Never on this page (brief): the equity partner offer, revenue model,
// event economics, use of funds, company structure, amounts raised,
// Parced IO figures or success fees earned. Quoted copy is verbatim.
// ─────────────────────────────────────────────────────────────────────

const TITLE = 'PITCH by Sarah Restrick | The Club'
const DESCRIPTION =
  'A series of live, filmed events where selected founders pitch for investment to investors, business leaders and The Club Members.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/pitch' },
  openGraph: { title: TITLE, description: DESCRIPTION, images: ['https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/pitch-hero-bentley-lounge.jpg'] },
}

export const revalidate = 60

const PROCESS = [
  {
    n: '01',
    title: 'Qualify',
    body: 'Founder questionnaire and light due diligence confirm credibility before anyone is accepted.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/process-qualify.jpg',
    imageAlt: 'The Bentley Lounge at Co-op Live, set for a PITCH event',
  },
  {
    n: '02',
    title: 'Train',
    body: 'A group launch session plus three 1:1 sessions: business model, storytelling, then full pitch rehearsal.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/process-train.jpg',
    imageAlt: 'A private booth in the Bentley Lounge used for PITCH training',
  },
  {
    n: '03',
    title: 'Pitch',
    body: 'Live at premium venues in London and Manchester, delivered in front of investors and peers.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/process-pitch.jpg',
    imageAlt: 'A founder pitching live at a PITCH event',
  },
  {
    n: '04',
    title: 'Match',
    body: 'Post-event debrief, with follow-up meetings introduced to the right-fit investors in the room.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/process-match.jpg',
    imageAlt: 'The bar of the Bentley Lounge at Co-op Live',
  },
  {
    n: '05',
    title: 'Amplify',
    body: 'Every founder features on the PITCH podcast, extending reach well beyond the room.',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/process-amplify.jpg',
    imageAlt: 'The Bentley Record Room, where the PITCH podcast is recorded',
  },
]

const FOUNDER_GETS = [
  { title: 'An investment-ready pitch', body: 'Story, deck and numbers refined through PITCH training' },
  { title: 'Investors in the room', body: 'Investors and business leaders from The Club’s network' },
  { title: 'Expert support', body: 'Sessions from PITCH partner experts' },
  { title: 'Exposure', body: 'A professionally produced podcast and video episode' },
  { title: 'Introductions', body: 'Follow-up introductions to interested investors' },
  { title: 'The Club network', body: 'Founders, brands and business leaders across the UK' },
]

const WHO_FOR = [
  { label: 'Stage', value: 'Pre-seed to growth stage' },
  { label: 'Sectors', value: 'Open to all sectors' },
  { label: 'Tax relief', value: 'SEIS and EIS eligible businesses' },
  { label: 'Raise size', value: 'Typical raise £40k to £1.5m' },
]

const YOU_NEED = [
  'A UK-registered company',
  'A pitch deck and a clear investment ask',
  'Financials and forecasts',
  'Use of funds',
  'A current cap table',
  'SEIS/EIS Advance Assurance if you have it',
]

// ── Investor Panel (Investor Panel deck) — PITCH_LEGAL_APPROVED only ──
const PANEL_FOR = [
  {
    n: '01',
    title: 'Angels and private investors',
    body: 'Back founders directly, deal by deal, with your own cheque size and sectors.',
  },
  { n: '02', title: 'VCs and investment funds', body: 'Pre-qualified deal flow at pre-seed and growth stage, met in person.' },
  {
    n: '03',
    title: 'SEIS and EIS investors',
    body: 'Opportunities in qualifying businesses with income tax and capital gains reliefs.',
  },
  { n: '04', title: 'Regional backers', body: 'Support for founders in Manchester and the North West, as well as London.' },
]

const YOUR_SEAT = [
  { title: 'A seat on the panel', body: 'Five to six pre-qualified founders pitch at every event' },
  { title: 'Invest directly', body: 'Back any business you choose, deal by deal' },
  { title: 'Pre-qualified deal flow', body: 'Every founder passes questionnaire and light due diligence' },
  { title: 'Follow-up through Match', body: 'Dedicated meetings with the founders you want to know more about' },
  { title: 'Visibility', body: 'Across The Club’s network, the PITCH podcast and social channels' },
  { title: 'The room', body: 'Fellow investors, business owners and The Club Members' },
]

// SEIS / EIS table — Investor Panel deck p.6. Subject to Myerson + HMRC
// check at publish date (PITCH_LEGAL_APPROVED).
const SEIS_EIS_ROWS = [
  ['Income tax relief', '50%', '30%'],
  ['Investor annual limit', '£200,000', '£1m (£2m knowledge-intensive)'],
  ['Capital gains on the shares', 'Tax-free after 3 years', 'Tax-free after 3 years'],
  ['Other gains', '50% reinvestment relief', 'Deferral relief'],
  ['If the business fails', 'Loss relief', 'Loss relief'],
  ['Minimum holding period', '3 years', '3 years'],
]

const HOW_TO_JOIN = [
  {
    n: '01',
    title: 'Apply',
    body: 'Complete the PITCH Investor Panel Application: your investor profile, typical cheque size, preferred sectors, stage and structure.',
  },
  {
    n: '02',
    title: 'Verify',
    body: 'Confirm your investor classification as a Self-Certified Sophisticated Investor or High Net Worth Individual, plus standard ID and AML checks.',
  },
  {
    n: '03',
    title: 'Attend',
    body: 'Choose your events in London or Manchester, meet the founders and follow up through Match.',
  },
]

// ── Partners (Sponsorship & Investment deck p.9) ─────────────────────
const PARTNER_TIERS = [
  {
    name: 'Headline Partner',
    price: '£25,000 + VAT',
    note: 'One per event',
    featured: true,
    items: [
      '“PITCH, presented by [Brand]”',
      'Category exclusivity and prime set branding',
      'Panel seat and first look at every founder',
      '10 VIP guests',
    ],
  },
  {
    name: 'Co-Partner',
    price: '£10,000 + VAT',
    note: 'Up to three per event',
    items: [
      '“In association with [Brand]”',
      'Secondary set branding and episode logo',
      'Expert session and sector introductions',
      '4 guests',
    ],
  },
  {
    name: 'Supporting Partner',
    price: '£5,000 + VAT',
    note: 'Up to four per event',
    items: [
      'Logo on end credits and signage',
      'Listing on the PITCH website',
      'One founder introduction on request',
      '2 guests',
    ],
  },
]

const PODCAST_REACH = [
  { figure: '7,000+', label: 'profiled CRM contacts receive every episode' },
  { figure: '16,300+', label: 'followers across LinkedIn, Instagram, Facebook and TikTok' },
  { figure: '98,000', label: 'Instagram views in 90 days' },
]

const PODCAST_PARTNER_OPTIONS = [
  'Series title sponsor',
  'Episode partner',
  'Guest founder or expert slot',
  'Branded segment',
  'Clips across social and CRM',
  'Recording at your venue',
]

const COMPLIANCE =
  'PITCH acts solely as an introducer between founders and investors, is not FCA authorised or regulated, and does not provide investment, legal or tax advice. Investor access is limited to certified high net worth and self-certified sophisticated investors. Tax reliefs depend on individual circumstances; take independent tax advice.'

export default async function PitchPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('events')
    .select(PROGRAMME_EVENT_COLUMNS)
    .eq('programme', 'pitch')
    .in('status', ['published', 'live'])
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(12)
  const events = (data ?? []) as unknown as ProgrammeEvent[]

  const subscribe = PODCAST_SUBSCRIBE.filter((s) => s.href)
  const [featured, ...moreEpisodes] = PODCAST_EPISODES

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <NightHero
        tall
        image="https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/pitch-hero-bentley-lounge.jpg"
        alt="The Bentley Lounge at Co-op Live, home of PITCH in Manchester"
        topSlot={
          <Image
            src="https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/pitch-wordmark.png"
            alt="PITCH by Sarah Restrick"
            width={587}
            height={175}
            priority
            className="w-[220px] sm:w-[300px] h-auto mix-blend-screen"
          />
        }
        eyebrow="PITCH® by Sarah Restrick"
        title="A series of live, filmed events where selected founders pitch for investment to investors, business leaders and The Club Members."
      >
        <PillLink href="#apply">Apply to pitch</PillLink>
        <PillLink href="#investors">Join the Investor Panel</PillLink>
        <PillLink href="#partners">Partner with PITCH</PillLink>
      </NightHero>

      {/* ── What PITCH is ────────────────────────────────────── */}
      <Chapter density="tight" bg="ink" id="what">
        <SectionHead eyebrow="The format" title="What PITCH is." />
        <StatGrid
          items={[
            { figure: '6', label: 'founders pitching at each event' },
            { figure: '6', label: 'live events per series, plus the Launch Event' },
            { figure: '1', label: 'podcast and video episode from every event' },
          ]}
        />
        <Reveal type="up" delay={200}>
          <p className="mt-10 font-[family-name:var(--font-editorial)] italic text-[clamp(1.05rem,1.4vw,1.35rem)] text-ivory-soft">
            Live in London and Manchester, at premium venues such as Co-op Live Arena.
          </p>
        </Reveal>
      </Chapter>

      {/* ── The PITCH process ───────────────────────────────── */}
      <Chapter density="tight" bg="graphite" id="process">
        <SectionHead eyebrow="Your journey" title="The PITCH process." />
        <CardGrid items={PROCESS} cols={5} />
      </Chapter>

      {/* ── Founders reel ───────────────────────────────────── */}
      {FOUNDERS_REEL.length > 0 && (
        <Chapter density="tight" bg="ink" id="founders-reel">
          <SectionHead eyebrow="Founders" title="On the PITCH stage." />
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory">
            {FOUNDERS_REEL.map((f, i) => {
              const still = (
                <figure className="relative w-[200px] sm:w-[240px] shrink-0 snap-start">
                  <div className="relative aspect-[9/16] overflow-hidden border border-graphite-line/60">
                    <Image
                      src={f.image}
                      alt={`${f.company} pitching at PITCH`}
                      fill
                      sizes="240px"
                      className="object-cover"
                    />
                  </div>
                  <figcaption className="mt-3 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-ivory-soft">
                    {f.company}
                  </figcaption>
                </figure>
              )
              return (
                <Reveal key={f.company} type="up" delay={i * 80}>
                  {f.podcastUrl ? (
                    <a href={f.podcastUrl} target="_blank" rel="noopener noreferrer" aria-label={`${f.company} — listen to the episode`}>
                      {still}
                    </a>
                  ) : (
                    still
                  )}
                </Reveal>
              )
            })}
          </div>
        </Chapter>
      )}

      {/* ── For founders ────────────────────────────────────── */}
      <Chapter density="default" bg="ink" id="founders" className="border-t border-graphite-line/40">
        <SectionHead eyebrow="For founders" title="Everything you need to raise." />
        <CardGrid items={FOUNDER_GETS} cols={3} />

        <div className="mt-20 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
          <Reveal type="up" delay={0}>
            <div>
              <p className={cn(eyebrowClass, 'mb-6')}>Who it’s for</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-graphite-line/50 border border-graphite-line/50">
                {WHO_FOR.map((w) => (
                  <div key={w.label} className="bg-ink p-6">
                    <dt className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-slate-haze">
                      {w.label}
                    </dt>
                    <dd className="mt-3 font-[family-name:var(--font-display)] text-[1.25rem] leading-snug text-ivory">
                      {w.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
          <Reveal type="up" delay={120}>
            <div>
              <p className={cn(eyebrowClass, 'mb-6')}>What you’ll need</p>
              <RuleList items={YOU_NEED} />
            </div>
          </Reveal>
        </div>

        <Reveal type="up" delay={0}>
          <div className="mt-20 border border-bronze/40 bg-bronze/[0.05] p-8 lg:p-12">
            <p className={cn(eyebrowClass, 'mb-6')}>Your investment</p>
            {PITCH_LEGAL_APPROVED ? (
              <p className="font-[family-name:var(--font-display)] text-[clamp(1.35rem,2.2vw,1.9rem)] leading-snug text-ivory max-w-4xl">
                £500 + VAT upfront for due diligence · £4,500 + VAT for your pitch place · 5% success fee, paid only
                once investment converts. £5,000 + VAT in total.
              </p>
            ) : (
              // Success-fee wording held back until Myerson signs off.
              <p className="font-[family-name:var(--font-display)] text-[clamp(1.35rem,2.2vw,1.9rem)] leading-snug text-ivory max-w-4xl">
                £500 + VAT upfront for due diligence · £4,500 + VAT for your pitch place. £5,000 + VAT in total.
              </p>
            )}
            <p className="mt-6 font-[family-name:var(--font-editorial)] italic text-[17px] text-bronze-light">
              Series One applications close 30 November 2026.
            </p>
            <div className="mt-8">
              <PillLink href="#apply">Apply for a place</PillLink>
            </div>
          </div>
        </Reveal>

        <div className="mt-20 max-w-4xl">
          <FormPanel
            id="apply"
            eyebrow="Apply to pitch"
            title="Apply for a place."
            lede="Places are limited to six founders per event."
          >
            <FounderApplicationForm />
          </FormPanel>
        </div>
      </Chapter>

      {/* ── For investors ───────────────────────────────────── */}
      <Chapter density="default" bg="graphite" id="investors" className="relative">
        <Aurora variant="soft" />
        <div className="relative z-10">
          {PITCH_LEGAL_APPROVED ? (
            <>
              <SectionHead
                eyebrow="For investors"
                title="The Investor Panel."
                lede="Angel investors, VCs and private investors who want early sight of founder-led start-ups and growth-stage innovative businesses."
              />
              <p className={cn(eyebrowClass, 'mb-6')}>Who the panel is for</p>
              <CardGrid items={PANEL_FOR} cols={4} />

              <p className={cn(eyebrowClass, 'mt-20 mb-6')}>Your seat</p>
              <CardGrid items={YOUR_SEAT} cols={3} />

              <div className="mt-20">
                <p className={cn(eyebrowClass, 'mb-6')}>SEIS and EIS opportunities</p>
                <SimpleTable
                  head={['', 'SEIS', 'EIS']}
                  rows={SEIS_EIS_ROWS}
                  caption="Founders indicate SEIS/EIS status when they apply to PITCH. Reliefs depend on individual circumstances and HMRC rules; investors should take independent tax advice."
                />
              </div>

              <p className={cn(eyebrowClass, 'mt-20 mb-6')}>How to join</p>
              <CardGrid items={HOW_TO_JOIN} cols={3} />

              <Reveal type="up" delay={0}>
                <p className="mt-16 display-md">No fee to join.</p>
              </Reveal>

              <div className="mt-14 max-w-4xl">
                <FormPanel id="investor-apply" eyebrow="Apply to the Investor Panel" title="Take your seat on the panel.">
                  <InvestorApplicationForm />
                </FormPanel>
              </div>
            </>
          ) : (
            <div className="max-w-4xl">
              <SectionHead eyebrow="For investors" title="Investor Panel applications open soon — register interest." />
              <FormPanel id="investor-apply" eyebrow="Register interest" title="Be the first to know.">
                <InvestorInterestForm />
              </FormPanel>
            </div>
          )}
        </div>
      </Chapter>

      {/* ── For partners and sponsors ───────────────────────── */}
      <Chapter density="default" bg="ink" id="partners">
        <SectionHead eyebrow="For partners and sponsors" title="Event sponsorship tiers." />
        <TierCards tiers={PARTNER_TIERS} />
        <Reveal type="up" delay={0}>
          <div className="mt-6 border border-bronze/50 p-7 lg:p-9 flex flex-col md:flex-row md:items-center gap-4 md:gap-10">
            <p className={eyebrowClass}>Series Headline Partner · one brand only</p>
            <p className="font-[family-name:var(--font-display)] text-[clamp(1.25rem,2vw,1.75rem)] text-ivory">
              The Launch and all six events · £100k + VAT
            </p>
          </div>
        </Reveal>

        <div className="mt-20 max-w-4xl">
          <FormPanel id="partner-enquiry" eyebrow="Partner with PITCH" title="Enquire about partnership.">
            <PitchPartnerForm />
          </FormPanel>
        </div>
      </Chapter>

      {/* ── The PITCH Podcast ───────────────────────────────── */}
      <Chapter density="default" bg="graphite" id="podcast">
        <SectionHead
          eyebrow="The PITCH Podcast"
          title="Every founder, on air."
          lede="Each PITCH founder is recorded in conversation with Sarah and the investors in the room."
        />

        {featured && (
          <div className="mb-14">
            <div className="relative aspect-video border border-graphite-line/60 overflow-hidden">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(featured.youtubeId)}`}
                title={featured.title}
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
            <p className="mt-4 font-[family-name:var(--font-display)] text-[1.35rem] text-ivory">{featured.title}</p>
            <p className="text-[13.5px] text-slate-haze">{featured.founder}</p>
          </div>
        )}
        {moreEpisodes.length > 0 && (
          <div className="mb-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {moreEpisodes.map((ep) => (
              <div key={ep.youtubeId}>
                <div className="relative aspect-video border border-graphite-line/60 overflow-hidden">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(ep.youtubeId)}`}
                    title={ep.title}
                    loading="lazy"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
                <p className="mt-3 text-[15px] text-ivory">{ep.title}</p>
                <p className="text-[13px] text-slate-haze">
                  {ep.founder}
                  {ep.spotifyUrl && (
                    <>
                      {' · '}
                      <a href={ep.spotifyUrl} target="_blank" rel="noopener noreferrer" className="text-bronze-light hover:text-ivory">
                        Spotify
                      </a>
                    </>
                  )}
                  {ep.appleUrl && (
                    <>
                      {' · '}
                      <a href={ep.appleUrl} target="_blank" rel="noopener noreferrer" className="text-bronze-light hover:text-ivory">
                        Apple Podcasts
                      </a>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
        {subscribe.length > 0 && (
          <div className="mb-14 flex flex-wrap gap-3">
            {subscribe.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 border border-bronze/60 rounded-full font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.26em] text-ivory hover:bg-bronze hover:text-ink transition-colors"
              >
                Subscribe on {s.label}
              </a>
            ))}
          </div>
        )}

        <StatGrid items={PODCAST_REACH} />

        <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5">
            <Reveal type="up" delay={0}>
              <p className={cn(eyebrowClass, 'mb-5')}>Podcast partner options</p>
              <p className={bodyClass}>
                Every episode goes out to our full CRM and social audience, and the series grows with each recording.
                Partners who join now grow with it.
              </p>
              <div className="mt-8">
                <PillLink href="#partner-enquiry" small>
                  Enquire about partnership
                </PillLink>
              </div>
            </Reveal>
          </div>
          <div className="lg:col-span-7">
            <Reveal type="up" delay={120}>
              <RuleList items={PODCAST_PARTNER_OPTIONS} className="sm:columns-2 sm:gap-10 [&>li]:break-inside-avoid [&>li]:mb-3.5" />
            </Reveal>
          </div>
        </div>
      </Chapter>

      {/* ── Upcoming PITCH events (shared events table) ─────── */}
      {events.length > 0 && (
        <Chapter density="tight" bg="ink" id="pitch-events">
          <SectionHead eyebrow="Upcoming PITCH events" title="Take your seat." />
          <EventCards events={events} />
        </Chapter>
      )}

      {/* ── Compliance (required, visible) ──────────────────── */}
      <section className="bg-ink border-t border-graphite-line/50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-12">
          <p className="max-w-4xl text-[13px] leading-[1.8] text-slate-haze">{COMPLIANCE}</p>
        </div>
      </section>
    </>
  )
}
