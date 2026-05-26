import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { TierExpandRow, type TierData } from '@/components/website/night/memberships/TierExpandRow'
import { BenefitsBento, type BenefitItem } from '@/components/website/night/memberships/BenefitsBento'
import { createClient } from '@/lib/supabase/server'
import { getPageHero } from '@/lib/cms/heroes'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// /memberships — premium rebuild.
//
// Voice copy is verbatim from Sarah's reference screenshots.
// Composition is our own; the previous draft borrowed the reference's
// 3×3 card grid + 3-in-a-row pricing strip, which felt like a catalogue,
// not a private members club. This version:
//
//   01 Hero               — full-bleed, italic lead-in line
//   02 Benefits           — 9 alternating editorial chapters (image one
//                           side, numeral + title + italic body the other)
//                           — pure magazine vocabulary, every benefit gets
//                           a real moment instead of being a 1/9th tile
//   03 Tier scenes        — three atmospheric full-bleed plates, each
//                           70vh tall, image bg with editorial overlay.
//                           No card chrome, no "The X Membership"
//                           eyebrow — just the price, the lede, the
//                           features, the Apply CTA. Reads like three
//                           deliberate scenes, not three rate cards.
//   04 Comparison         — editorial spec sheet, generous row spacing
//   05 Closing tagline    — brand line over atmospheric still
//   06 Apply close (shared)
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/gallery/bigland.png' // PLACEHOLDER

const BENEFITS = [
  {
    n: 'I',
    title: 'Access to The Club Network',
    body:
      "Unlock privileged access to The Club's elite network of members, connecting you with key industry leaders and high-net-worth professionals for unmatched business opportunities.",
    image: '/gallery/bigland.png',
  },
  {
    n: 'II',
    title: 'Choose Your Membership',
    body:
      'Experience the freedom of choice with our flexible membership options, designed to cater to your individual preferences, ensuring a tailored and versatile networking experience.',
    image: '/gallery/land1.png',
  },
  {
    n: 'III',
    title: 'Advertise Your Business',
    body:
      'Elevate your visibility with the opportunity to showcase your brand through strategic advertising on our member directory and website, reaching a discerning audience of influential professionals and decision-makers.',
    image: '/gallery/land2.png',
  },
  {
    n: 'IV',
    title: 'Access to The Club Events',
    body:
      "Enjoy privileged access to The Club's exclusive members-only events, curated to provide a premium networking experience and unique opportunities for building meaningful connections within our distinguished community.",
    image: '/gallery/land3.png',
  },
  {
    n: 'V',
    title: 'Monthly Members "Work In"',
    body:
      'Participate in our monthly member work-in sessions, designed to foster collaboration and productivity, providing a dedicated space for members to engage, share insights, and advance their professional endeavors together.',
    image: '/gallery/potrait.png',
  },
  {
    n: 'VI',
    title: 'Private Dining Experiences',
    body:
      'Indulge in exquisite private dining experiences at exclusive member rates, curated to elevate your culinary journey and provide a luxurious backdrop for building connections and hosting memorable business gatherings.',
    image: '/theclub-section.png',
  },
  {
    n: 'VII',
    title: 'Bespoke & Ticketed Events',
    body:
      'Unlock exclusive member rates for both bespoke and ticketed events, ensuring you have privileged access to a diverse range of curated experiences, from intimate gatherings to high-profile events, designed to enrich your networking journey.',
    image: '/theapproch-image.png',
  },
  {
    n: 'VIII',
    title: 'Curated Sponsored Events',
    body:
      'Enhance your brand visibility and influence by sponsoring curated events included in our Business and Corporate memberships. Position your business at the forefront of exclusive gatherings, establishing a powerful presence within our elite community.',
    image: '/manchester.png',
  },
  {
    n: 'IX',
    title: 'Corporate Luxury Concierge',
    body:
      'Experience the pinnacle of service with our Corporate Luxury Concierge, a premier offering exclusively included in our Business and Corporate memberships. Enjoy personalized assistance to complement your professional lifestyle.',
    image: '/gallery/bigland.png',
  },
] as const

// Hardcoded fallback — used ONLY if the membership_plans table is
// empty or unreachable. Edit copy + pricing from /dashboard/website/memberships
// in production; this exists so the page never renders blank in dev /
// during a Supabase outage.
const FALLBACK_TIERS: TierData[] = [
  {
    name: 'Individual',
    price: '£2,500',
    contract: '12 months · plus VAT',
    image: '/theclub-section.png',
    lede:
      'A single representation in the room. Quiet, considered, and built for the founder who keeps their own calendar.',
    features: [
      '1 representation',
      '12 month minimum term',
      'Businesses can take multiple individual memberships',
      '6 Member tickets',
      '1 Ticket at Member Rate for paid events',
    ],
    href: '/membership-application?tier=individual',
  },
  {
    name: 'Business',
    price: '£15,000',
    contract: '12 months · plus VAT',
    image: '/gallery/land2.png',
    lede:
      'Up to four seats with shared invitations, a brand showcase evening, and the corporate concierge on call.',
    features: [
      'Up to 4 representations / guests',
      '12 month minimum term',
      '6 Member tickets',
      '4 Tickets at Member rates for paid events',
      '1 brand showcase event with curated guestlist of prospects (additional fees apply)',
      'Corporate & luxury concierge',
    ],
    href: '/membership-application?tier=business',
  },
  {
    name: 'Corporate',
    price: '£30,000',
    contract: '12 months · plus VAT',
    image: '/gallery/land3.png',
    lede:
      'A full partnership — your team across the calendar, a sponsorship moment, and a showcase evening of your own.',
    features: [
      'Up to 4 representations / guests',
      '12 month minimum term',
      '6 Member tickets',
      '4 Tickets at Member rates for paid events',
      '1 brand showcase event with curated guestlist of prospects (additional fees apply)',
      '1 sponsorship opportunity included',
      'Corporate & luxury concierge',
    ],
    href: '/membership-application?tier=corporate',
  },
]

function formatGBP(pence: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100)
}

const COMPARISON: { label: string; cells: [boolean, boolean, boolean] }[] = [
  { label: 'Access to The Club network', cells: [true, true, true] },
  { label: 'Single membership for one individual', cells: [true, false, false] },
  { label: 'Up to 4 memberships', cells: [false, true, true] },
  { label: "Advertising on Member's Directory and website", cells: [true, true, true] },
  { label: "Access to The Club Member's Events", cells: [true, true, true] },
  { label: '"Work in" Mondays with The Club members', cells: [true, true, true] },
  { label: 'Exclusive member rates for private dining experiences', cells: [true, true, true] },
  { label: 'Exclusive members rates for bespoke and ticketed events', cells: [true, true, true] },
  { label: 'Access to The Club concierge service', cells: [false, true, true] },
  {
    label: '1 event curated for your business with sponsorship (all costs included)',
    cells: [false, true, false],
  },
  {
    label:
      '4 events curated for your business with sponsorship (based on agreed budget and requirements)',
    cells: [false, false, true],
  },
  { label: 'Bespoke marketing campaign', cells: [false, false, true] },
  {
    label: 'Exclusivity — only one business per sector during your membership term',
    cells: [false, false, true],
  },
  {
    label: 'Top level concierge services including designated team and guest management',
    cells: [false, false, true],
  },
]

export default async function MembershipsPage() {
  const supabase = await createClient()
  const [{ data: planRows }, { data: benefitRows }, hero] = await Promise.all([
    supabase
      .from('membership_plans')
      .select('slug, name, lede, contract_terms, annual_price_pence, features, image_url')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    // CMS-managed benefit cards. RLS restricts the public read to
    // is_visible = true, so any card the admin has hidden in
    // /dashboard/website/membership-benefits drops out automatically.
    // We sort by position so the asymmetric SPANS in BenefitsBento line
    // up with their intended slots.
    supabase
      .from('membership_benefits')
      .select('position, numeral, title, body, image_url')
      .eq('is_visible', true)
      .order('position', { ascending: true }),
    getPageHero('memberships', {
      page_slug: 'memberships',
      media_type: 'image',
      image_url: HERO_IMAGE,
      alt_text: 'A members’ evening',
      eyebrow: 'At The Club',
      headline: 'Memberships.',
      lede: 'Three ways to belong. Each is a 12 month decision.',
    }),
  ])

  // Map DB → TierData shape that TierExpandRow expects. Falls back to
  // the hardcoded list if the table is empty so the page never blanks.
  const tiers: TierData[] =
    planRows && planRows.length > 0
      ? planRows.map((p) => ({
          name: p.name,
          price: formatGBP(p.annual_price_pence),
          contract: p.contract_terms ?? '',
          image: p.image_url ?? '/theclub-section.png',
          lede: p.lede ?? '',
          features: p.features ?? [],
          href: `/membership-application?tier=${p.slug}`,
        }))
      : FALLBACK_TIERS

  // Map DB → BenefitItem shape. If the table is empty (migration
  // hasn't been applied yet, RLS misconfigured, etc.) fall back to
  // the hardcoded BENEFITS so the page never renders blank.
  const benefits: readonly BenefitItem[] =
    benefitRows && benefitRows.length > 0
      ? benefitRows.map((b) => ({
          n: b.numeral,
          title: b.title,
          body: b.body,
          image: b.image_url ?? '/theclub-section.png',
        }))
      : BENEFITS

  return (
    <>
      {/* ── 01 · Hero ─────────────────────────────────────────────── */}
      <section className="relative h-[78vh] min-h-[520px] w-full always-night overflow-hidden bg-ink">
        <PageHeroMedia
          mediaType={hero.media_type}
          imageUrl={hero.image_url}
          alt={hero.alt_text}
          videoUrl={hero.video_url}
          videoPosterUrl={hero.video_poster_url}
          overlay={0.55}
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

      {/* ── 02 · Benefits — glowing-border bento ───────────────────
         9 benefits in an asymmetric 12-col bento. Each tile has a
         bronze conic-gradient border that spins on hover (see
         `.glow-border` in globals.css). Larger tiles get a faded
         image background. Reads as an editorial bento, not a
         catalogue grid. `density="tight"` here trims the otherwise
         excessive vertical gap between the hero and this section. */}
      <Chapter density="tight" bg="ink">
        <div className="max-w-3xl mx-auto text-center mb-12 lg:mb-14">
          <Reveal type="up" delay={0}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
              What you receive
            </p>
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h2 className="display-md">Membership benefits.</h2>
          </Reveal>
          <Reveal type="up" delay={350}>
            <p className="mt-8 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.75] text-ivory-soft">
              Discover exclusive membership options and benefits at The Club, tailored to suit your
              needs. Whether as an individual or business entity, our memberships offer excellent
              opportunities for connections, sponsored events, and luxury concierge services.
            </p>
          </Reveal>
        </div>

        <Reveal type="up" delay={0}>
          <BenefitsBento items={benefits} />
        </Reveal>
      </Chapter>

      {/* ── 03 · Tier expand row ─────────────────────────────────
         Three equal cards in a row. Hovering any one expands it to
         100% width and visually overlaps the other two; mouse-leave
         returns it to slot. Cursor-X tracking on the container makes
         the expansion follow whichever third the cursor is in, so
         switching between expanded tiers feels fluid instead of
         requiring the user to leave the row first. Mobile falls back
         to stacked full-content cards.
         `density="tight"` here (matching Benefits) trims the
         stacked padding that was leaving a big dead zone between
         the two sections. */}
      <Chapter density="tight" bg="ink">
        <div className="max-w-3xl mx-auto text-center mb-16 lg:mb-20">
          <Reveal type="up" delay={0}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
              Choose your tier
            </p>
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h2 className="display-md">Membership types.</h2>
          </Reveal>
          <Reveal type="up" delay={350}>
            <p className="mt-8 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.75] text-ivory-soft">
              Explore our Individual, Business, and Corporate memberships, each designed with
              unique benefits to enhance your networking journey. From single representatives to
              comprehensive corporate packages, The Club provides a platform for meaningful
              connections and exclusive experiences.
            </p>
          </Reveal>
        </div>

        <Reveal type="up" delay={0}>
          <TierExpandRow tiers={tiers} />
        </Reveal>
      </Chapter>

      {/* ── 04 · Comparison ───────────────────────────────────────
         Editorial spec sheet — generous row height, hairline rules,
         bronze ticks. Sits on graphite so it visually separates from
         the tier scenes above. */}
      <Chapter density="default" bg="graphite" className="relative">
        <Aurora variant="soft" />
        <div className="relative z-10">
          <div className="max-w-3xl mx-auto text-center mb-20">
            <Reveal type="up" delay={0}>
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
                At a glance
              </p>
            </Reveal>
            <Reveal type="clip" delay={150}>
              <h2 className="display-md">Membership comparison.</h2>
            </Reveal>
            <Reveal type="up" delay={350}>
              <p className="mt-8 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.75] text-ivory-soft">
                Explore our membership benefits at a glance with our comprehensive table. Easily
                compare the exclusive offerings of our Individual, Business, and Corporate
                memberships to find the perfect fit for your networking goals.
              </p>
            </Reveal>
          </div>

          <Reveal type="up" delay={0}>
            <ComparisonTable />
          </Reveal>
        </div>
      </Chapter>

    </>
  )
}

// ─── Comparison table — editorial spec sheet ───────────────────────

function ComparisonTable() {
  return (
    <div className="max-w-5xl mx-auto overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[720px]">
        <thead>
          <tr>
            <th className="w-1/2 pb-8 align-bottom" />
            {(['Individual', 'Business', 'Corporate'] as const).map((tier) => (
              <th key={tier} className="pb-8 text-center align-bottom">
                <p className="font-[family-name:var(--font-display)] text-[clamp(1rem,1.2vw,1.125rem)] text-ivory leading-tight">
                  {tier}
                </p>
                <span className="block h-px w-12 bg-bronze/65 mx-auto mt-5" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARISON.map((row, i) => (
            <tr
              key={row.label}
              className={cn(
                'border-t border-graphite-line/40 transition-colors duration-300 hover:bg-bronze/[0.04]',
                i === COMPARISON.length - 1 && 'border-b',
              )}
            >
              <td className="py-6 pr-8 font-[family-name:var(--font-editorial)] text-[16px] leading-[1.6] text-ivory">
                {row.label}
              </td>
              {row.cells.map((on, j) => (
                <td key={j} className="py-6 text-center">
                  {on ? (
                    <span
                      aria-label="Included"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-bronze/15 border border-bronze/55 text-bronze-light"
                    >
                      <Check size={14} strokeWidth={2} />
                    </span>
                  ) : (
                    <span
                      aria-label="Not included"
                      className="inline-flex items-center justify-center w-8 h-8 text-slate-dim"
                    >
                      <Minus size={14} strokeWidth={1.5} />
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
