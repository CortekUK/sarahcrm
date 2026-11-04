import type { Metadata } from 'next'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { BenefitsBento, type BenefitItem } from '@/components/website/night/memberships/BenefitsBento'
import {
  CategoryExclusivity,
  ComparisonSpec,
  HowMatchmakingWorks,
  MatchmakingIntro,
  NextSteps,
  SectionHead,
  TierCards,
  type CategoryChip,
  type ComparisonRowData,
  type TierCardData,
} from '@/components/website/night/memberships/MembershipSections'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/marketing/admin'
import { getPageHero } from '@/lib/cms/heroes'

const DESCRIPTION =
  'Access, The Club Membership and The Club Business Membership: introductions, events and the platform, from £2,500 a year + VAT. How Professional Matchmaking works and how to apply.'

export const metadata: Metadata = {
  title: 'Memberships | The Club by Sarah Restrick',
  description: DESCRIPTION,
  openGraph: {
    title: 'Memberships | The Club by Sarah Restrick',
    description: DESCRIPTION,
  },
}

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// /memberships — rebuilt to Sarah's brief (Nov 2026).
//
//   01 Hero                         — kept verbatim
//   02 Membership & Professional Matchmaking intro (brochure)
//   03 Three tiers                  — membership_plans (+ "Every tier:" line)
//   04 Comparison + footnote        — membership_comparison + app_settings
//   05 Six benefit cards            — membership_benefits
//   06 Business Membership — one business per category
//                                   — business_categories (Taken from the CRM)
//   07 How Professional Matchmaking works (brochure)
//   08 Next steps → Apply (brochure)
//
// Every DB block falls back to the brief's copy if its table is empty or
// unreachable, so the page never renders blank.
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/gallery/land2.png'

// Verbatim (brief).
const EVERY_TIER =
  'Member discounts across retail, hospitality, travel and more, with access to our concierge service.'

const FALLBACK_FOOTNOTE =
  'All fees + VAT, paid annually. Introductions are made through the platform. Commission applies to converted business in every tier, except private banking and wealth management on The Club Membership. Bespoke event costs are additional, negotiated through our preferred suppliers.'

// Fallbacks — used ONLY if the DB is empty/unreachable. Edit live copy
// in /dashboard/website/memberships (plans), /membership-comparison,
// /membership-benefits and /business-categories.
const FALLBACK_TIERS: TierCardData[] = [
  {
    slug: 'access',
    name: 'Access',
    headline: 'Introductions, on demand',
    audience: 'Decision makers · £500k+ turnover',
    price: '£2,500',
    contract: 'a year + VAT',
    body: 'For time-poor clients who want the introductions. Advertise on our platform and reach the full database; The Club makes the introductions and helps convert them. One event included.',
    image: '/theclub-section.png',
    features: [],
  },
  {
    slug: 'the-club-membership',
    name: 'The Club Membership',
    headline: 'The room, all year',
    audience: 'Owners and decision makers · £1m+ turnover',
    price: '£6,000',
    contract: 'a year + VAT',
    body: 'Two places at every Round Table, Member Event, Harrods Series and PITCH event, for your team or a guest. Full platform and CRM access.',
    image: '/gallery/land2.png',
    features: [],
  },
  {
    slug: 'business',
    name: 'The Club Business Membership',
    headline: 'Your category, exclusively',
    audience: 'Owners and decision makers · £10m+ turnover',
    price: '£15,000',
    contract: 'a year + VAT',
    body: 'Four places at every event, no other business member in your category, priority introductions and a bespoke event we fill with your prospects.',
    image: '/gallery/land3.png',
    features: [],
  },
]

const FALLBACK_COMPARISON: ComparisonRowData[] = [
  { label: 'Annual fee', cells: ['£2,500', '£6,000', '£15,000'] },
  {
    label: 'Events',
    cells: [
      'One event included; others at additional cost',
      'Two places at Round Tables, Member Events, Harrods Series and PITCH',
      'Four places at every event, plus a bespoke event we fill',
    ],
  },
  {
    label: 'Platform',
    cells: [
      'Advertise on the platform, full database access',
      'Full platform and CRM access',
      'Preferred status, priority introductions and CRM marketing campaigns',
    ],
  },
  { label: 'Exclusivity', cells: ['—', '—', 'No other business member in your category'] },
  {
    label: 'Benefits',
    cells: ['Discounts and concierge', 'Discounts and concierge', 'Discounts and concierge'],
  },
  { label: 'For', cells: ['£500k+ turnover', '£1m+ turnover', '£10m+ turnover'] },
]

const FALLBACK_BENEFITS: BenefitItem[] = [
  {
    n: 'I',
    title: 'Access to The Club network',
    body: "A private members' club for founders, owners, senior executives and high-net-worth individuals. Membership is capped and by referral, and every applicant is vetted to protect the quality of the room.",
    image: '/gallery/bigland.png',
  },
  {
    n: 'II',
    title: 'Professional Matchmaking',
    body: 'Qualified one-to-one introductions built around your goals and clients, up to ten a month depending on tier, then tracked through to revenue.',
    image: '/gallery/land1.png',
  },
  {
    n: 'III',
    title: 'The events calendar',
    body: 'Five programmes, one calendar: Member Events, Round Tables, PITCH, Curated Experiences and the London Series, at five-star venues across the UK and beyond.',
    image: '/gallery/land3.png',
  },
  {
    n: 'IV',
    title: 'Advertise on the platform',
    body: 'Advertise on our platform and reach our full profiled database of 7,000+, beyond the members in the room.',
    image: '/gallery/land2.png',
  },
  {
    n: 'V',
    title: 'Member Rewards & Members Card',
    body: 'Member discounts across retail, hospitality, travel and more, with your Members Card, partner rates and event access in one app.',
    image: '/theclub-section.png',
  },
  {
    n: 'VI',
    title: 'Private Concierge',
    body: 'Collection, private travel, transfers and access for The Club Members and their guests. Ask for anything; we deliver it.',
    image: '/gallery/bigland.png',
  },
]

const FALLBACK_CATEGORIES: CategoryChip[] = [
  'Private aviation',
  'Private banking',
  'Wealth & finance',
  'Insurance',
  'Legal',
  'Property & development',
  'Construction',
  'Prestige automotive',
  'Jewellery & watches',
  'Interiors & design',
  'Travel & hotels',
  'Events & hospitality',
  'Concierge & lifestyle',
  'Health & longevity',
  'Security',
  'Yachting',
].map((name) => ({ name, is_taken: false }))

function formatGBP(pence: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100)
}

interface PlanRow {
  slug: string
  name: string
  headline: string | null
  audience: string | null
  lede: string | null
  contract_terms: string | null
  annual_price_pence: number
  features: string[] | null
  image_url: string | null
  tier_classification: string | null
}

interface ComparisonDbRow {
  label: string
  individual: boolean
  business: boolean
  corporate: boolean
  tier_1_text?: string | null
  tier_2_text?: string | null
  tier_3_text?: string | null
}

// The comparison footnote lives in app_settings, which only admins can
// read through RLS — read it server-side with the service role. It's
// public copy, never anything sensitive.
async function getFootnote(): Promise<string | null> {
  try {
    const { data } = await getAdmin()
      .from('app_settings')
      .select('value')
      .eq('key', 'membership_comparison_footnote')
      .maybeSingle()
    const v = (data as { value?: unknown } | null)?.value
    if (typeof v === 'string') return v.trim() || null
    return FALLBACK_FOOTNOTE
  } catch {
    return FALLBACK_FOOTNOTE
  }
}

export default async function MembershipsPage() {
  const supabase = await createClient()
  // New tables / columns aren't in the generated types yet.
  const db = supabase as unknown as SupabaseClient

  const [
    { data: planRows },
    { data: benefitRows },
    { data: comparisonRows },
    { data: categoryRows },
    footnote,
    hero,
  ] = await Promise.all([
    db
      .from('membership_plans')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    // RLS restricts the public read to is_visible = true.
    supabase
      .from('membership_benefits')
      .select('position, numeral, title, body, image_url')
      .eq('is_visible', true)
      .order('position', { ascending: true }),
    db
      .from('membership_comparison')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    db
      .from('business_categories')
      .select('name, is_taken')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true }),
    getFootnote(),
    getPageHero('memberships', {
      page_slug: 'memberships',
      media_type: 'image',
      image_url: HERO_IMAGE,
      alt_text: 'An evening with The Club',
      eyebrow: 'At The Club',
      headline: 'Memberships.',
      lede: 'Three ways to belong. Each is a 12 month decision.',
    }),
  ])

  const plans = (planRows ?? []) as PlanRow[]

  const tiers: TierCardData[] =
    plans.length > 0
      ? plans.map((p) => ({
          slug: p.slug,
          name: p.name,
          headline: p.headline ?? '',
          audience: p.audience ?? '',
          price: formatGBP(p.annual_price_pence),
          contract: p.contract_terms || 'a year + VAT',
          body: p.lede ?? '',
          image: p.image_url ?? '/theclub-section.png',
          features: p.features ?? [],
        }))
      : FALLBACK_TIERS

  // Comparison columns follow the tier order (tier_1 → tier_3); names
  // come from the plan rows so a rename in the CMS flows through.
  const TIER_KEYS = ['tier_1', 'tier_2', 'tier_3'] as const
  const fallbackNames = FALLBACK_TIERS.map((t) => t.name)
  const tierNames = TIER_KEYS.map(
    (k, i) => plans.find((p) => p.tier_classification === k)?.name ?? fallbackNames[i],
  )

  const comparison: ComparisonRowData[] =
    comparisonRows && comparisonRows.length > 0
      ? (comparisonRows as ComparisonDbRow[]).map((r) => ({
          label: r.label,
          cells: [
            r.tier_1_text?.trim() || r.individual,
            r.tier_2_text?.trim() || r.business,
            r.tier_3_text?.trim() || r.corporate,
          ],
        }))
      : FALLBACK_COMPARISON

  const benefits: readonly BenefitItem[] =
    benefitRows && benefitRows.length > 0
      ? benefitRows.map((b) => ({
          n: b.numeral,
          title: b.title,
          body: b.body,
          image: b.image_url ?? '/theclub-section.png',
        }))
      : FALLBACK_BENEFITS

  const categories: CategoryChip[] =
    categoryRows && categoryRows.length > 0 ? (categoryRows as CategoryChip[]) : FALLBACK_CATEGORIES

  const businessPlan = plans.find((p) => p.tier_classification === 'tier_3')
  const businessSlug = businessPlan?.slug ?? 'business'
  const businessPrice = businessPlan ? formatGBP(businessPlan.annual_price_pence) : '£15,000'

  return (
    <>
      {/* ── 01 · Hero (kept verbatim) ─────────────────────────────── */}
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

      {/* ── 02 · Membership & Professional Matchmaking ─────────────── */}
      <Chapter density="tight" bg="ink">
        <MatchmakingIntro />
      </Chapter>

      {/* ── 03 · Three tiers ─────────────────────────────────────── */}
      <Chapter density="tight" bg="ink" id="tiers">
        <SectionHead eyebrow="Membership · All prices + VAT" title="Three ways to belong." />
        <TierCards tiers={tiers} />
        <Reveal type="up" delay={0}>
          <p className="max-w-4xl mx-auto mt-12 text-center font-[family-name:var(--font-editorial)] text-[clamp(1rem,1.2vw,1.1875rem)] leading-[1.7] text-ivory-soft">
            <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.36em] text-bronze-light mr-3">
              Every tier:
            </span>
            {EVERY_TIER}
          </p>
        </Reveal>
      </Chapter>

      {/* ── 04 · Comparison ───────────────────────────────────────── */}
      <Chapter density="default" bg="graphite" className="relative">
        <Aurora variant="soft" />
        <div className="relative z-10">
          <SectionHead eyebrow="At a glance" title="What each tier includes." />
          <Reveal type="up" delay={0}>
            <ComparisonSpec tierNames={tierNames} rows={comparison} footnote={footnote} />
          </Reveal>
        </div>
      </Chapter>

      {/* ── 05 · Six benefits ─────────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <SectionHead eyebrow="What you receive" title="Membership benefits." />
        <Reveal type="up" delay={0}>
          <BenefitsBento items={benefits} />
        </Reveal>
      </Chapter>

      {/* ── 06 · Business Membership — one business per category ──── */}
      <Chapter density="default" bg="graphite" className="relative">
        <div className="relative z-10">
          <CategoryExclusivity
            categories={categories}
            applyHref={`/membership-application?tier=${encodeURIComponent(businessSlug)}`}
            price={businessPrice}
          />
        </div>
      </Chapter>

      {/* ── 07 · How Professional Matchmaking works ───────────────── */}
      <Chapter density="default" bg="ink">
        <HowMatchmakingWorks />
      </Chapter>

      {/* ── 08 · Next steps → Apply ───────────────────────────────── */}
      <Chapter density="default" bg="graphite" className="relative">
        <Aurora variant="soft" />
        <div className="relative z-10">
          <NextSteps />
        </div>
      </Chapter>
    </>
  )
}
