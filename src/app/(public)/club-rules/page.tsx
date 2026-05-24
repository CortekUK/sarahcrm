import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { PullQuote } from '@/components/website/night/primitives/PullQuote'
import { TracingBeam } from '@/components/website/night/effects/TracingBeam'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'

// ─────────────────────────────────────────────────────────────────────
// Club Rules — manifesto, set as an editorial spread.
//
// Reads like a hand-typed letter rather than a terms-and-conditions
// page. Numbered articles, each with a one-line statement + brief
// elaboration. TracingBeam pacing makes the page feel like an
// extended read.
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=2400&q=85'

const ARTICLES = [
  {
    n: '01',
    headline: 'Discretion comes first.',
    body: 'What happens at The Club doesn\'t leave The Club. No photographs are taken at events without explicit permission. No member is named in public marketing. We don\'t maintain a public guest list, and we don\'t respond to press enquiries about who attended which evening.',
  },
  {
    n: '02',
    headline: 'Phones stay in coats.',
    body: 'At dinners and salons, phones are stowed on arrival. If something genuinely urgent comes up, step away from the table to take it. The room works because the room is fully present.',
  },
  {
    n: '03',
    headline: 'You\'re always introduced.',
    body: 'No member arrives unannounced. The room is briefed on who you are before you arrive, and you on them. The conversation has already started before you sit down.',
  },
  {
    n: '04',
    headline: 'Networking is not the point.',
    body: 'Hand out a business card mid-conversation and you may not be invited back. Connections form quickly here because nobody is hunting for them. If you want to follow up with someone, ask the host — we make the introduction properly.',
  },
  {
    n: '05',
    headline: 'Guests are your responsibility.',
    body: 'Each member may bring one guest to most events, by name and at the host\'s discretion. Your guest reflects on you. If they don\'t hold the standard, the next invitation comes with a quiet note.',
  },
  {
    n: '06',
    headline: 'We don\'t talk about money at dinner.',
    body: 'Pricing, fees, fundraising, deal flow — not at the table. There\'s a coffee tomorrow morning for that. The dinner is for everything else.',
  },
  {
    n: '07',
    headline: 'The room is the standard.',
    body: 'Membership is a relationship, not a card. If a member can\'t hold the standard — repeatedly, after a conversation — we\'ll ask them, gently, to step back. The room is the brand.',
  },
]

export default function ClubRulesPage() {
  return (
    <>
      {/* ── 00 · Hero ───────────────────────────────────────────────── */}
      <section className="relative h-[60vh] min-h-[440px] w-full overflow-hidden bg-ink">
        <KenBurnsImage
          src={HERO_IMAGE}
          alt="A handwritten letter on a wooden desk"
          motion="in"
          duration={32}
          overlay={0.55}
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-20">
          <EditorialMeta label="The Standard" stamp="Seven articles" />
          <h1 className="display-xl mt-8 max-w-4xl">A short list of what we hold to.</h1>
          <p className="lede mt-7 max-w-xl">
            Not so much rules as a way of being in the room. We&apos;d rather have a small membership that holds these than a larger one that doesn&apos;t.
          </p>
        </div>
      </section>

      {/* ── 01 · The Articles ───────────────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <TracingBeam>
          <div className="max-w-2xl">
            <EditorialMeta number="01" label="The Articles" />
            <h2 className="display-lg mt-12 mb-6">Seven things.</h2>
            <p className="lede mb-16">
              Read them once. Carry the spirit of them, not the wording. We&apos;ll point it out, kindly, if anything slips.
            </p>

            <ol className="space-y-16">
              {ARTICLES.map((a) => (
                <li key={a.n} className="border-t border-bronze/20 pt-9">
                  <div className="flex items-center gap-4 mb-5">
                    <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light tabular-nums">
                      Article {a.n}
                    </span>
                    <span className="h-px flex-1 bg-bronze/20" />
                  </div>
                  <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.75rem,2.6vw,2.5rem)] leading-tight text-ivory">
                    {a.headline}
                  </h3>
                  <p className="mt-6 body-prose max-w-prose">{a.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </TracingBeam>
      </Chapter>

      {/* ── 02 · Close pull quote ───────────────────────────────────── */}
      <Chapter density="tight" bg="graphite">
        <PullQuote attribution="Sarah Restrick" attributionDetail="Founder" align="center" size="xl">
          These are the things that make the difference between an evening and a Tuesday.
        </PullQuote>
      </Chapter>

      {/* ── 03 · Apply close ────────────────────────────────────────── */}
      <ApplyClose />
    </>
  )
}
