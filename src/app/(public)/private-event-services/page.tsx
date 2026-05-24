import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { PullQuote } from '@/components/website/night/primitives/PullQuote'
import { BentoGrid, BentoTile } from '@/components/website/night/effects/BentoGrid'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { ArrowUpRight, Calendar, MapPin, Wine, Sparkles, KeyRound, Music } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// Private Event Services — for-hire offering page.
//
// Structure:
//   00 Hero
//   01 What we do          — 4-tile bento of service categories
//   02 Recent commissions  — real events of type curated_luxury/retreat
//                            from the events table; falls back to
//                            curated_experiences if no upcoming entries
//   03 The process
//   04 Pull quote
//   05 Enquiry CTA         — plum aurora, direct link to /contact-us
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=2400&q=85'

const SERVICES = [
  {
    icon: Wine,
    eyebrow: 'Dinners',
    title: 'Curated suppers',
    detail: 'From eight at a kitchen counter to ninety in a private room. Wine pairings, off-menu kitchens, and tables that breathe.',
  },
  {
    icon: Sparkles,
    eyebrow: 'Salons',
    title: 'Conversations & launches',
    detail: 'Founder dinners, book launches, salon-style talks. The room sets up the conversation; we shape who&apos;s in it.',
  },
  {
    icon: KeyRound,
    eyebrow: 'Retreats',
    title: 'Weekends away',
    detail: 'Country houses, vineyards, occasional hotels. A weekend with the right twelve people often outperforms a year of networking.',
  },
  {
    icon: Music,
    eyebrow: 'Celebrations',
    title: 'Milestones',
    detail: 'Birthdays, anniversaries, the close of a chapter. Quiet, dramatic, considered. No band by default — but never not by request.',
  },
]

const PROCESS = [
  {
    step: '01',
    title: 'An enquiry',
    body: 'A short conversation about what you want the evening to mean — who&apos;s in the room, what the closing line of the night sounds like.',
  },
  {
    step: '02',
    title: 'A proposal',
    body: 'Within five working days, a written proposal: venue options, menu directions, hosting model, a budget you can react to without surprise.',
  },
  {
    step: '03',
    title: 'The night',
    body: 'We handle the entirety of the production — venue, kitchen, drinks, music, flowers, timing — and stand in the room with you on the night.',
  },
]

export default async function PrivateEventServicesPage() {
  const supabase = await createClient()

  const now = new Date().toISOString()
  const { data: privateEvents } = await supabase
    .from('events')
    .select('id, slug, title, start_date, event_type, venue_name, venue_city, cover_image_url, description')
    .in('status', ['published', 'live'])
    .in('event_type', ['curated_luxury', 'retreat'])
    .gte('start_date', now)
    .order('start_date', { ascending: true })
    .limit(3)

  const { data: pastHighlights } = await supabase
    .from('curated_experiences')
    .select('id, title, description, image_url, link_url')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(6)

  return (
    <>
      {/* ── 00 · Hero ───────────────────────────────────────────────── */}
      <section className="relative h-[80vh] min-h-[560px] w-full overflow-hidden bg-ink">
        <KenBurnsImage
          src={HERO_IMAGE}
          alt="An elegant private dining setup"
          motion="in"
          duration={32}
          overlay={0.55}
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-24">
          <EditorialMeta label="Private Events" stamp="For hire" />
          <h1 className="display-xl mt-8 max-w-4xl">
            Your evening, hosted by The Club.
          </h1>
          <p className="lede mt-7 max-w-xl">
            We close rooms, set tables, choose the music, and stand in the room with you. The version of an evening you&apos;d organise yourself if you had a second life and a small army.
          </p>
        </div>
      </section>

      {/* ── 01 · What we do ─────────────────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="max-w-2xl mb-16">
          <EditorialMeta number="01" label="What We Do" />
          <h2 className="display-lg mt-10">Four kinds of evening.</h2>
        </div>

        <BentoGrid>
          {SERVICES.map((s) => (
            <BentoTile
              key={s.eyebrow}
              span="col-span-12 md:col-span-6 row-span-1"
              hover="none"
            >
              <div className="absolute inset-0 p-8 md:p-10 flex flex-col">
                <div className="w-11 h-11 rounded-full bg-bronze/10 border border-bronze/30 flex items-center justify-center mb-7">
                  <s.icon size={17} strokeWidth={1.4} className="text-bronze-light" />
                </div>
                <span className="eyebrow-quiet">{s.eyebrow}</span>
                <h3 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.375rem,1.8vw,1.75rem)] leading-tight text-ivory">
                  {s.title}
                </h3>
                <p
                  className="mt-4 text-[14px] text-ivory-soft/85 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: s.detail }}
                />
              </div>
            </BentoTile>
          ))}
        </BentoGrid>
      </Chapter>

      {/* ── 02 · Recent commissions ─────────────────────────────────── */}
      {(privateEvents && privateEvents.length > 0) && (
        <Chapter density="default" bg="graphite">
          <div className="max-w-2xl mb-16">
            <EditorialMeta number="02" label="Forthcoming" />
            <h2 className="display-lg mt-10">Commissions on the calendar.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {privateEvents.map((ev) => (
              <Link
                key={ev.id}
                href={`/events/${ev.slug}`}
                className="group block bg-ink border border-graphite-line/40 hover:border-bronze/40 transition-colors duration-500"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-graphite">
                  {ev.cover_image_url ? (
                    <Image
                      src={ev.cover_image_url}
                      alt={ev.title}
                      fill
                      className="object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-[1.04]"
                      sizes="(min-width: 1024px) 33vw, 100vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-[family-name:var(--font-display)] text-5xl text-slate-dim">
                        {ev.title.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
                  <div className="film-grain-night" />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 text-[11px] text-bronze-light">
                    <Calendar size={11} strokeWidth={1.5} />
                    <span className="uppercase tracking-[0.24em]">{formatDate(ev.start_date)}</span>
                  </div>
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl text-ivory leading-tight">
                    {ev.title}
                  </h3>
                  {(ev.venue_name || ev.venue_city) && (
                    <p className="mt-2 text-[12px] text-slate-haze uppercase tracking-[0.18em]">
                      {[ev.venue_name, ev.venue_city].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </Chapter>
      )}

      {/* ── Past highlights (curated_experiences) ───────────────────── */}
      {pastHighlights && pastHighlights.length > 0 && (
        <Chapter density="default" bg="ink">
          <div className="max-w-2xl mb-16">
            <EditorialMeta number={privateEvents && privateEvents.length > 0 ? '03' : '02'} label="Past Highlights" />
            <h2 className="display-lg mt-10">Recent commissions.</h2>
            <p className="lede mt-6 max-w-xl">
              A handful of evenings we&apos;ve built, with permission to share.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {pastHighlights.map((exp) => (
              <div
                key={exp.id}
                className="group bg-graphite border border-graphite-line/40 hover:border-bronze/40 transition-colors duration-500"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-ink">
                  {exp.image_url ? (
                    <Image
                      src={exp.image_url}
                      alt={exp.title}
                      fill
                      className="object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-[1.04]"
                      sizes="(min-width: 1024px) 33vw, 100vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-graphite">
                      <span className="font-[family-name:var(--font-display)] text-5xl text-slate-dim">
                        {exp.title.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="film-grain-night" />
                </div>
                <div className="p-6">
                  <h3 className="font-[family-name:var(--font-display)] text-xl text-ivory leading-tight">
                    {exp.title}
                  </h3>
                  {exp.description && (
                    <p className="mt-3 text-[13.5px] text-ivory-soft/80 leading-relaxed line-clamp-3">
                      {exp.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Chapter>
      )}

      {/* ── 03 · The Process ─────────────────────────────────────────── */}
      <Chapter density="default" bg="graphite">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-4">
            <EditorialMeta number="04" label="The Process" />
            <h2 className="display-md mt-10">Three steps. About six weeks.</h2>
            <p className="body-prose mt-6 max-w-md">
              We take a small number of commissions a year. Lead time is six weeks for an intimate dinner, three months for a weekend.
            </p>
          </div>
          <div className="lg:col-span-8 space-y-12">
            {PROCESS.map((p) => (
              <div key={p.step} className="grid grid-cols-12 gap-6 border-t border-graphite-line/60 pt-10">
                <div className="col-span-2">
                  <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light tabular-nums">
                    {p.step}
                  </span>
                </div>
                <div className="col-span-10">
                  <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2vw,2rem)] text-ivory leading-tight">
                    {p.title}
                  </h3>
                  <p className="mt-3 body-prose max-w-prose">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Chapter>

      {/* ── 04 · Pull quote ──────────────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <PullQuote attribution="A recent client" align="center" size="lg">
          The whole night felt like ours, and not like a production. That&apos;s the trick.
        </PullQuote>
      </Chapter>

      {/* ── 05 · Enquiry close ──────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-plum py-32 md:py-44">
        <Aurora variant="dusk" z={0} />
        <div className="relative z-10 max-w-[1600px] mx-auto px-6 lg:px-10 text-center">
          <p className="eyebrow mb-10">Begin a Commission</p>
          <h2 className="display-xl text-ivory leading-[0.95] max-w-4xl mx-auto">
            Tell us about the evening you&apos;d like to host.
          </h2>
          <p className="lede mt-10 max-w-xl mx-auto">
            A short message gets a real reply, usually within forty-eight hours.
          </p>
          <div className="mt-14 flex items-center justify-center gap-6">
            <Link
              href="/contact-us"
              className="group inline-flex items-center gap-3 px-9 py-4 border border-bronze hover:bg-bronze rounded-full font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ivory hover:text-ink transition-all duration-500"
            >
              Send a Note
              <ArrowUpRight
                size={15}
                strokeWidth={1.5}
                className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
              />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
