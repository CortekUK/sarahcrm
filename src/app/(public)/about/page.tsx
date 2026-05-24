import Link from 'next/link'
import Image from 'next/image'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { PullQuote } from '@/components/website/night/primitives/PullQuote'
import { TracingBeam } from '@/components/website/night/effects/TracingBeam'
import { Marquee } from '@/components/website/night/effects/Marquee'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'
import { ArrowUpRight } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────
// About — editorial portrait of Sarah + The Club's origin story.
//
// Structure:
//   00 Hero            — portrait or atmospheric photo + display title
//   01 The Origin      — long-form column with tracing beam
//   02 Pull quote      — Sarah on the founding insight
//   03 The Standard    — three principles, magazine columns
//   04 Press marquee   — names Sarah's been associated with
//   05 Apply close
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=2400&q=85'

const PORTRAIT_IMAGE =
  'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=1600&q=85'

const PRINCIPLES = [
  {
    n: '01',
    title: 'The room is the brand.',
    body: 'We don\'t scale by adding members. We scale by being more careful with the ones we have. Every introduction we make is one we\'d be proud to make twice.',
  },
  {
    n: '02',
    title: 'Discretion before delight.',
    body: 'No published guest lists. No social tagging. No press at members\' events. What happens at The Club doesn\'t leave The Club, and that promise is enforced.',
  },
  {
    n: '03',
    title: 'A standard, not a guest list.',
    body: 'Membership is an invitation to a level of conversation, not a club card. If a member can\'t hold the standard, they\'re asked, gently, to step away.',
  },
]

const PRESS = [
  'Tatler',
  'Country & Town House',
  'The Times',
  'Vogue',
  'Financial Times',
  'Harper\'s Bazaar',
  'Spear\'s',
  'Vanity Fair',
]

export default function AboutPage() {
  return (
    <>
      {/* ── 00 · Hero ───────────────────────────────────────────────── */}
      <section className="relative h-[80vh] min-h-[560px] w-full overflow-hidden bg-ink">
        <KenBurnsImage
          src={HERO_IMAGE}
          alt="A quiet members' room at dusk"
          motion="in"
          duration={32}
          overlay={0.55}
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-24">
          <EditorialMeta label="About" stamp="London · Est. 2024" />
          <h1 className="display-xl mt-8 max-w-4xl">
            A small idea about who London should be meeting.
          </h1>
          <p className="lede mt-7 max-w-xl">
            The Club was started by Sarah Restrick in 2024 — quietly, then slightly less quietly, and now this.
          </p>
        </div>
      </section>

      {/* ── 01 · Origin (Sarah's voice) ─────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <TracingBeam>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-7">
              <EditorialMeta number="01" label="The Origin" />
              <h2 className="display-lg mt-12 mb-10">It started over a long lunch.</h2>

              <div className="body-prose space-y-7 max-w-prose">
                <p>
                  I&apos;d spent fifteen years arranging introductions for people who didn&apos;t need any more — founders, investors, surgeons, journalists, the gently powerful. They&apos;d come to me because the rooms they were being shown were the wrong rooms, and the apps they were being offered didn&apos;t understand the rules of conversation.
                </p>
                <p>
                  Over a long lunch in late 2023, a friend asked me what would happen if I just did it properly. Twelve nights a year. Hand-picked members. No app, no algorithm, no posting. I went home, opened a notebook, and started writing names.
                </p>
                <p>
                  The first night was in February 2024, in a private room above a wine shop in Marylebone. Sixteen people. We stayed until two. The morning after, I had nine emails asking when the next one was.
                </p>
                <p>
                  The Club is the version of those nights I always wanted. Considered. Discreet. Worth showing up for.
                </p>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="relative aspect-[4/5] overflow-hidden bg-graphite-2">
                <Image
                  src={PORTRAIT_IMAGE}
                  alt="Sarah Restrick"
                  fill
                  className="object-cover grayscale-[20%]"
                  sizes="(min-width: 1024px) 40vw, 100vw"
                />
                <div className="film-grain-night" />
              </div>
              <div className="mt-5 flex items-center gap-3">
                <span className="h-px w-10 bg-bronze/50" />
                <p className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light">
                  Sarah Restrick
                </p>
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.24em] text-slate-haze">
                  Founder
                </p>
              </div>
            </div>
          </div>
        </TracingBeam>
      </Chapter>

      {/* ── 02 · Pull quote ─────────────────────────────────────────── */}
      <Chapter density="tight" bg="graphite">
        <PullQuote attribution="Sarah Restrick" attributionDetail="Founder" align="center" size="xl">
          The best rooms in London aren&apos;t the loudest. They&apos;re the smallest ones, where the right people happen to already be talking.
        </PullQuote>
      </Chapter>

      {/* ── 03 · The Standard ──────────────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="max-w-2xl mb-16">
          <EditorialMeta number="02" label="The Standard" />
          <h2 className="display-lg mt-10">Three things we hold to.</h2>
          <p className="lede mt-7 max-w-xl">
            We&apos;re a small operation by design. These are the principles that make us boring on purpose, and excellent in practice.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-14">
          {PRINCIPLES.map((p) => (
            <div key={p.n} className="border-t border-bronze/30 pt-7">
              <span className="font-[family-name:var(--font-meta)] text-[12px] uppercase tracking-[0.32em] text-bronze-light tabular-nums">
                {p.n}
              </span>
              <h3 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(1.5rem,2vw,1.875rem)] leading-tight text-ivory">
                {p.title}
              </h3>
              <p className="mt-5 body-prose">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 flex items-center gap-3">
          <Link
            href="/club-rules"
            className="group inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
          >
            Read the full Club Rules
            <ArrowUpRight
              size={14}
              strokeWidth={1.5}
              className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
            />
          </Link>
        </div>
      </Chapter>

      {/* ── 04 · Press marquee ─────────────────────────────────────── */}
      <section className="bg-ink py-20 lg:py-28 border-t border-graphite-line/40 border-b border-graphite-line/40">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 mb-10 flex items-center gap-5">
          <span className="h-px flex-1 bg-graphite-line/80" />
          <p className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.42em] text-slate-haze">
            Sarah&apos;s work has been written about in
          </p>
          <span className="h-px flex-1 bg-graphite-line/80" />
        </div>
        <Marquee variant="press" duration={55}>
          {PRESS.map((p) => (
            <span
              key={p}
              className="font-[family-name:var(--font-display)] italic text-3xl text-ivory-soft/60 tracking-wide whitespace-nowrap"
            >
              {p}
            </span>
          ))}
        </Marquee>
      </section>

      {/* ── 05 · Apply close ─────────────────────────────────────────── */}
      <ApplyClose />
    </>
  )
}
