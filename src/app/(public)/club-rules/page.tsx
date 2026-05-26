import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { TracingBeam } from '@/components/website/night/effects/TracingBeam'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'
import { getPageHero } from '@/lib/cms/heroes'

// ─────────────────────────────────────────────────────────────────────
// Club Rules — the official member guidelines, set as an editorial
// spread. All rule copy, the intro paragraph, the closing thank-you
// and the "last updated" date are VERBATIM from Sarah's source
// (provided 2026-05-25, originally published 15 January 2024). Only
// the section framing ("Article I", chapter headings, hero scaffolding)
// is our own editorial vocabulary.
//
// Nine articles, each on a two-column spread: Roman numeral on the
// left, headline + elaboration on the right. TracingBeam threads a
// bronze hairline down the column as the page unfolds. Hero / intro /
// close all match the editorial vocabulary used on /about and
// /memberships so the page sits with its peers.
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=2400&q=85'

const LAST_UPDATED = '15 January 2024'

const ARTICLES = [
  {
    n: 'I',
    headline: 'Individual Membership.',
    body: 'Membership is exclusively for the individual or named business representatives. Only previously authorised guests or representatives can attend events.',
  },
  {
    n: 'II',
    headline: 'Complimentary Monthly Member Events.',
    body: 'All monthly member events are complimentary as part of the Membership Agreement, offering an array of enriching experiences.',
  },
  {
    n: 'III',
    headline: 'Membership Duration.',
    body: 'Membership entails a 12-month minimum contract, not contingent on the number of events attended during this timeframe.',
  },
  {
    n: 'IV',
    headline: 'Additional Cost Events.',
    body: 'Private dining experiences and bespoke luxury events incur additional costs, with exclusive members’ rates and guest rates applying.',
  },
  {
    n: 'V',
    headline: 'Guest Authorisation.',
    body: 'Guests are subject to authorisation. All guests must be booked in and will receive a direct invitation.',
  },
  {
    n: 'VI',
    headline: 'Membership Fee Compliance.',
    body: 'Access to events is not permitted if monthly membership fees have not been paid.',
  },
  {
    n: 'VII',
    headline: 'Inclusivity.',
    body: 'We do not judge based on gender, race, religion, sexuality, or physicality. We expect our members and guests to embrace the same inclusive values.',
  },
  {
    n: 'VIII',
    headline: 'Behaviour Expectations.',
    body: 'Our curated environments are designed for positive connections. Inappropriate or upsetting behaviour will not be tolerated.',
  },
  {
    n: 'IX',
    headline: 'Payment for Additional Cost Events.',
    body: 'Additional cost events will be invoiced in advance and must be paid before attending. Cancellations within one week or a specified timeframe will be charged in full.',
  },
] as const

export default async function ClubRulesPage() {
  const hero = await getPageHero('club-rules', {
    page_slug: 'club-rules',
    media_type: 'image',
    image_url: HERO_IMAGE,
    alt_text: 'A handwritten letter on a wooden desk',
    eyebrow: 'The Standard · Nine Articles',
    headline: 'The Club Rules.',
    lede: 'Guidelines for a harmonious and enriching experience for all.',
  })

  return (
    <>
      {/* ── 01 · Hero ──────────────────────────────────────────────── */}
      <section className="relative h-[78vh] min-h-[560px] w-full always-night overflow-hidden bg-ink">
        <PageHeroMedia
          mediaType={hero.media_type}
          imageUrl={hero.image_url}
          alt={hero.alt_text}
          videoUrl={hero.video_url}
          videoPosterUrl={hero.video_poster_url}
          overlay={0.6}
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-[55%] hero-fade-bottom pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-24">
          {hero.eyebrow && (
            <Reveal type="up" delay={0}>
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
                {hero.eyebrow}
              </p>
            </Reveal>
          )}
          {hero.headline && (
            <Reveal type="clip" delay={150}>
              <h1 className="display-xl max-w-4xl">{hero.headline}</h1>
            </Reveal>
          )}
          {hero.lede && (
            <Reveal type="up" delay={400}>
              <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.125rem,1.4vw,1.5rem)] text-ivory-soft mt-6 max-w-xl">
                {hero.lede}
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── 02 · Preamble ──────────────────────────────────────────── */}
      <Chapter density="tight" bg="ink" className="!py-16 md:!py-20">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal type="up" delay={0}>
            <span className="block h-px w-12 bg-bronze/55 mx-auto mb-7" />
          </Reveal>
          <Reveal type="up" delay={100}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
              A note from The Club
            </p>
          </Reveal>
          <Reveal type="clip" delay={200}>
            <h2 className="display-md">A community for our members.</h2>
          </Reveal>
          <Reveal type="up" delay={400}>
            <p className="mt-6 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.7] text-ivory-soft">
              At The Club, we believe in fostering a community where members can connect, build
              relationships, and indulge in quality events. To ensure a harmonious and enriching
              experience for all, we have outlined the following guidelines.
            </p>
          </Reveal>
          <Reveal type="up" delay={550}>
            <p className="mt-7 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze">
              Last updated {LAST_UPDATED}
            </p>
          </Reveal>
        </div>
      </Chapter>

      {/* ── 03 · The Articles ──────────────────────────────────────── */}
      <Chapter density="tight" bg="ink" className="!pt-6 md:!pt-10 !pb-20 md:!pb-24">
        <TracingBeam className="max-w-5xl mx-auto">
          <div className="mb-12">
            <EditorialMeta number="01" label="The Articles" />
            <Reveal type="clip" delay={150}>
              <h2 className="display-lg mt-7">Nine guidelines.</h2>
            </Reveal>
          </div>

          <ol className="space-y-12 lg:space-y-14">
            {ARTICLES.map((a) => (
              <li key={a.n}>
                {/* Hairline + Article label across the top of each spread */}
                <Reveal type="up" delay={0}>
                  <div className="flex items-center gap-4 mb-6">
                    <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light tabular-nums">
                      Article {a.n}
                    </span>
                    <span className="h-px flex-1 bg-bronze/25" />
                  </div>
                </Reveal>

                {/* Two-column editorial spread: oversized Roman numeral
                    on the left, headline + body on the right. Mirrors
                    the rhythm of the membership-application step
                    indicator so the page sits visually inside the same
                    family. */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-8 lg:gap-10">
                  <div className="md:col-span-3 lg:col-span-2">
                    <Reveal type="up" delay={100}>
                      <span
                        aria-hidden
                        className="font-[family-name:var(--font-display)] text-[clamp(2.75rem,5vw,4.5rem)] leading-none text-bronze/55 tabular-nums select-none"
                      >
                        {a.n}
                      </span>
                    </Reveal>
                  </div>
                  <div className="md:col-span-9 lg:col-span-10">
                    <Reveal type="clip" delay={200}>
                      <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2.2vw,2.125rem)] leading-[1.2] text-ivory">
                        {a.headline}
                      </h3>
                    </Reveal>
                    <Reveal type="up" delay={400}>
                      <p className="mt-4 body-prose max-w-prose">{a.body}</p>
                    </Reveal>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </TracingBeam>
      </Chapter>

      {/* ── 04 · Closing remarks ───────────────────────────────────── */}
      <Chapter density="tight" bg="ink" className="!py-16 md:!py-20">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal type="up" delay={0}>
            <span className="block h-px w-12 bg-bronze/55 mx-auto mb-7" />
          </Reveal>
          <Reveal type="up" delay={100}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
              In closing
            </p>
          </Reveal>
          <Reveal type="up" delay={250}>
            <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.125rem,1.4vw,1.4375rem)] leading-[1.75] text-ivory-soft">
              Thank you for being a valued member of The Club. These guidelines ensure a welcoming
              and enjoyable experience for all, as we continue to curate exceptional events and
              foster meaningful connections within our community.
            </p>
          </Reveal>
        </div>
      </Chapter>

      {/* ── 05 · Apply close ───────────────────────────────────────── */}
      <ApplyClose />
    </>
  )
}
