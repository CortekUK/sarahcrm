import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { getPageHero } from '@/lib/cms/heroes'
import { ArrowUpRight, Gift } from 'lucide-react'

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// /rewards — public partner directory for the Rewards & Benefits
// programme. Its job (per the client) is to show off the strength of
// The Club's partner network to prospective members.
//
// ── DATA / PRIVACY ────────────────────────────────────────────────────
// This is a SERVER component. It fetches with the service-role client
// (created inline) so the page can read the reward_partners /
// reward_offers rows regardless of the anonymous RLS policies — but it
// deliberately selects ONLY public-safe columns:
//
//   partners → where is_active AND is_public, ordered by display_order.
//   offers   → where is_active, selecting ONLY
//              id, partner_id, title, summary, member_benefit, valid_until.
//
// It NEVER selects discount_code, details, or redemption_process — those
// are member-only and must never reach the public page. The offer's
// member_benefit line is shown as a teaser only ("member benefit
// available"), with the actual codes/redemption reserved for the portal.
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/gallery/land1.png'

// Canonical category order for the directory. Any partner category not
// in this list is appended afterwards (alphabetically) so the page never
// silently drops a partner whose category label doesn't match.
const CATEGORY_ORDER = [
  'Hotels',
  'Restaurants',
  'Golf',
  'Travel',
  'Luxury Retail',
  'Property',
  'Health & Wellness',
  'Business Services',
  'Automotive',
  'Watches & Jewellery',
]

interface PublicOffer {
  id: string
  partner_id: string
  title: string
  summary: string | null
  member_benefit: string | null
  valid_until: string | null
}

interface PublicPartner {
  id: string
  name: string
  category: string
  description: string | null
  logo_url: string | null
  website_url: string | null
  offers: PublicOffer[]
}

async function fetchDirectory(): Promise<PublicPartner[]> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!url || !serviceKey) return []

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Partners — public-safe columns only.
  const { data: partnerRows } = await admin
    .from('reward_partners')
    .select('id, name, category, description, logo_url, website_url')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('display_order', { ascending: true })

  const partners = (partnerRows ?? []) as Omit<PublicPartner, 'offers'>[]
  if (partners.length === 0) return []

  // Offers — public-safe columns ONLY. Never discount_code / details /
  // redemption_process (member-only). Restrict to this page's partners.
  const { data: offerRows } = await admin
    .from('reward_offers')
    .select('id, partner_id, title, summary, member_benefit, valid_until')
    .eq('is_active', true)
    .in(
      'partner_id',
      partners.map((p) => p.id),
    )
    .order('display_order', { ascending: true })

  const offers = (offerRows ?? []) as PublicOffer[]

  // Group offers under their partner.
  return partners.map((p) => ({
    ...p,
    offers: offers.filter((o) => o.partner_id === p.id),
  }))
}

// Group partners by category, ordered by CATEGORY_ORDER first then any
// remaining categories alphabetically.
function groupByCategory(partners: PublicPartner[]): [string, PublicPartner[]][] {
  const groups = new Map<string, PublicPartner[]>()
  for (const p of partners) {
    const key = p.category?.trim() || 'Partners'
    const bucket = groups.get(key)
    if (bucket) bucket.push(p)
    else groups.set(key, [p])
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}

export default async function RewardsPage() {
  const [partners, hero] = await Promise.all([
    fetchDirectory(),
    getPageHero('rewards', {
      page_slug: 'rewards',
      media_type: 'image',
      image_url: HERO_IMAGE,
      alt_text: 'The Club partner network',
      eyebrow: 'Member Benefits',
      headline: 'The partner network.',
      lede: 'A curated circle of hotels, restaurants, golf, travel, luxury retail, watches and cars — with benefits reserved for members of The Club.',
    }),
  ])

  const grouped = groupByCategory(partners)

  return (
    <>
      {/* ── 01 · Hero ─────────────────────────────────────────────── */}
      <section className="relative h-[72vh] min-h-[500px] w-full always-night overflow-hidden bg-ink">
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
              <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.125rem,1.4vw,1.5rem)] text-ivory-soft mt-6 max-w-2xl">
                {hero.lede}
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── 02 · Intro ────────────────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal type="up" delay={0}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
              Rewards &amp; Benefits
            </p>
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h2 className="display-md">Privileges, quietly arranged.</h2>
          </Reveal>
          <Reveal type="up" delay={350}>
            <p className="mt-8 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.75] text-ivory-soft">
              Membership of The Club opens the door to a considered network of
              partners — luxury hotels and restaurants, golf and travel, retail,
              watches, jewellery and motoring. Each partnership carries a benefit
              held exclusively for our members. Below is a look at who sits within
              the network; the member rates, codes and details live inside the
              member portal.
            </p>
          </Reveal>
        </div>
      </Chapter>

      {/* ── 03 · Directory ────────────────────────────────────────── */}
      <Chapter density="tight" bg="graphite" className="relative">
        <Aurora variant="soft" />
        <div className="relative z-10">
          {grouped.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-24">
              {grouped.map(([category, list]) => (
                <div key={category}>
                  <Reveal type="up" delay={0}>
                    <div className="flex items-center gap-5 mb-10">
                      <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2.4vw,2.1rem)] leading-tight text-ivory whitespace-nowrap">
                        {category}
                      </h3>
                      <span className="h-px flex-1 bg-bronze/25" />
                      <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-slate-haze tabular-nums">
                        {list.length} {list.length === 1 ? 'partner' : 'partners'}
                      </span>
                    </div>
                  </Reveal>

                  {/* Centered flex-wrap: cards keep a comfortable fixed width
                      so a single partner reads as intentional (not stranded
                      top-left in an empty grid), and multiple cards fill and
                      centre the row. items stretch to equal height per row. */}
                  <div className="flex flex-wrap justify-center gap-6">
                    {list.map((partner) => (
                      <Reveal
                        key={partner.id}
                        type="up"
                        delay={0}
                        className="w-full sm:w-[360px] lg:w-[380px]"
                      >
                        <PartnerCard partner={partner} />
                      </Reveal>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Chapter>

      {/* ── 04 · Members-only CTA ─────────────────────────────────── */}
      <MembersCta />
    </>
  )
}

// ─── Partner card ────────────────────────────────────────────────────

function PartnerCard({ partner }: { partner: PublicPartner }) {
  return (
    <div className="group h-full flex flex-col border border-graphite-line/60 bg-ink/40 backdrop-blur-sm p-7 transition-colors duration-500 hover:border-bronze/50 day:bg-white day:shadow-sm">
      {/* Logo / name row */}
      <div className="flex items-center gap-4 mb-5">
        <div className="shrink-0 w-14 h-14 rounded-full border border-bronze/30 bg-graphite/60 flex items-center justify-center overflow-hidden day:bg-cream-soft">
          {partner.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- partner
            // logos come from arbitrary external hosts; a plain <img> avoids
            // per-domain next/image remotePattern config.
            <img
              src={partner.logo_url}
              alt={`${partner.name} logo`}
              className="w-full h-full object-contain p-2"
              loading="lazy"
            />
          ) : (
            <span className="font-[family-name:var(--font-display)] text-[18px] text-bronze-light">
              {partner.name.charAt(0)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-display)] text-[18px] leading-tight text-ivory truncate">
            {partner.name}
          </p>
          <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.28em] text-bronze-light mt-1">
            {partner.category}
          </p>
        </div>
      </div>

      {partner.description && (
        <p className="font-[family-name:var(--font-editorial)] text-[14.5px] leading-[1.7] text-ivory-soft">
          {partner.description}
        </p>
      )}

      {/* Offers — public summary + a member-benefit teaser line only. */}
      {partner.offers.length > 0 && (
        <div className="mt-6 pt-6 border-t border-graphite-line/50 space-y-5">
          {partner.offers.map((offer) => (
            <div key={offer.id}>
              <p className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.16em] text-ivory">
                {offer.title}
              </p>
              {offer.summary && (
                <p className="mt-2 font-[family-name:var(--font-editorial)] text-[13.5px] leading-[1.65] text-ivory-soft">
                  {offer.summary}
                </p>
              )}
              {offer.member_benefit && (
                <p className="mt-3 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.24em] text-bronze-light">
                  <Gift size={12} strokeWidth={1.5} />
                  Member benefit available
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {partner.website_url && (
        <a
          href={partner.website_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto pt-6 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-slate-haze hover:text-bronze-light transition-colors duration-300"
        >
          Visit partner
          <ArrowUpRight size={13} strokeWidth={1.5} />
        </a>
      )}
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="max-w-xl mx-auto text-center py-16">
      <div className="w-14 h-14 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-7">
        <Gift size={22} strokeWidth={1.5} className="text-bronze-light" />
      </div>
      <h3 className="display-md mb-5">The network is being curated.</h3>
      <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-relaxed">
        Our partner benefits are being assembled and will appear here shortly.
        Members are notified inside the portal as each partnership goes live.
      </p>
    </div>
  )
}

// ─── Members-only CTA ────────────────────────────────────────────────

function MembersCta() {
  return (
    <section className="always-night relative overflow-hidden bg-plum py-24 md:py-32">
      <Aurora variant="dusk" z={0} />
      <div className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 text-center">
        <Reveal type="up" delay={0}>
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
            Exclusive to members
          </p>
        </Reveal>
        <Reveal type="clip" delay={150}>
          <h2 className="display-md text-ivory">These benefits are for members.</h2>
        </Reveal>
        <Reveal type="up" delay={350}>
          <p className="mt-8 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.75] text-ivory-soft">
            Member rates, discount codes and redemption details are held inside
            the member portal. Apply to join The Club, or sign in if you&apos;re
            already a member.
          </p>
        </Reveal>
        <Reveal type="up" delay={550}>
          <div className="mt-11 flex flex-col sm:flex-row items-center justify-center gap-5">
            <CtaPill href="/membership-application" variant="solid">
              Apply for Membership
            </CtaPill>
            <CtaPill href="/login" variant="quiet">
              Member Login
            </CtaPill>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// Server-rendered pill link — pure-CSS hover, no client JS. Mirrors the
// double-stroke bronze pill used across the public site.
function CtaPill({
  href,
  children,
  variant,
}: {
  href: string
  children: React.ReactNode
  variant: 'solid' | 'quiet'
}) {
  return (
    <Link href={href} className="group relative inline-block">
      <span className="block relative px-9 py-4 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
        <span
          aria-hidden
          className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover:border-ink/20"
        />
        <span
          aria-hidden
          className={
            variant === 'solid'
              ? 'absolute inset-[5px] bg-bronze rounded-full scale-x-100 origin-center transition-transform duration-700'
              : 'absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out'
          }
        />
        <span
          className={
            variant === 'solid'
              ? 'relative z-10 flex items-center gap-3 font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ink transition-colors duration-700'
              : 'relative z-10 flex items-center gap-3 font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ivory group-hover:text-ink transition-colors duration-700'
          }
        >
          {children}
          <ArrowUpRight
            size={14}
            strokeWidth={1.5}
            className="transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
          />
        </span>
      </span>
    </Link>
  )
}
