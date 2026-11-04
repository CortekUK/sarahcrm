import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { getPageHero } from '@/lib/cms/heroes'
import { ArrowUpRight, Award, CreditCard, Gift, Lock, Share2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Rewards & Benefits | The Club by Sarah Restrick',
  description:
    'Rewards & Benefits for The Club Members: The Club Members Card, partner benefits across hotels, dining, golf, travel and retail, with loyalty and referrals launching in 2027.',
  openGraph: {
    title: 'Rewards & Benefits | The Club by Sarah Restrick',
    description:
      'Rewards & Benefits for The Club Members: The Club Members Card, partner benefits across hotels, dining, golf, travel and retail, with loyalty and referrals launching in 2027.',
  },
}

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// /rewards — public TEASER for Rewards & Benefits. The named brands,
// rates and codes live behind the member login (/portal/rewards).
//
//   01 Hero (existing copy)
//   02 Intro — "Privileges, quietly arranged." (existing copy)
//   03 Four benefit tiles → members-only sections of /portal/rewards:
//      The Club Members Card (live) · Loyalty (Launching 2027) ·
//      Referrals (Launching 2027) · Partner benefits
//   04 Partner benefits — category tiles + a partner COUNT only
//   05 Members-only band (existing)
//
// ── DATA / PRIVACY ────────────────────────────────────────────────────
// Visitors can no longer read reward_partners (RLS). The category
// counts are computed here, server-side, with the service-role client,
// selecting ONLY the category column. No partner name, offer or code is
// ever read for this page, so none can reach the page source.
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/gallery/land1.png'

interface CategoryCount {
  category: string
  count: number
}

async function fetchCategoryCounts(): Promise<CategoryCount[]> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!url || !serviceKey) return []
  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // Live partners with at least one live offer — the same set the
    // members' directory shows. Category + id only.
    const { data: offers } = await admin
      .from('reward_offers')
      .select('partner_id')
      .eq('is_active', true)
    const withOffers = new Set(((offers ?? []) as { partner_id: string }[]).map((o) => o.partner_id))
    const { data: partners } = await admin
      .from('reward_partners')
      .select('id, category')
      .eq('is_active', true)
    const counts = new Map<string, number>()
    for (const p of (partners ?? []) as { id: string; category: string | null }[]) {
      if (!withOffers.has(p.id)) continue
      const key = p.category?.trim() || 'Lifestyle'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category))
  } catch (e) {
    console.error('[rewards] category counts failed:', e)
    return []
  }
}

const BENEFITS: {
  title: string
  body: string
  status: string
  live: boolean
  icon: typeof CreditCard
  anchor: string
}[] = [
  {
    title: 'The Club Members Card',
    body: 'Your digital card with your name, tier and membership number, and a QR code for verification at events and with partners.',
    status: 'Live',
    live: true,
    icon: CreditCard,
    anchor: 'card',
  },
  {
    title: 'Loyalty',
    body: 'Recognition for the members who make the most of The Club.',
    status: 'Launching 2027',
    live: false,
    icon: Award,
    anchor: 'loyalty',
  },
  {
    title: 'Referrals',
    body: 'A personal referral link for every member, with each introduction tracked to you.',
    status: 'Launching 2027',
    live: false,
    icon: Share2,
    anchor: 'referrals',
  },
  {
    title: 'Partner benefits',
    body: 'Rates and privileges from partner brands, for The Club Members.',
    status: 'Live',
    live: true,
    icon: Gift,
    anchor: 'directory',
  },
]

export default async function RewardsPage() {
  const [categories, hero] = await Promise.all([
    fetchCategoryCounts(),
    getPageHero('rewards', {
      page_slug: 'rewards',
      media_type: 'image',
      image_url: HERO_IMAGE,
      alt_text: 'The Club partner network',
      eyebrow: 'Member Benefits',
      headline: 'The partner network.',
      lede: 'A curated circle of hotels, restaurants, golf, travel, luxury retail, watches and cars, with benefits reserved for The Club Members.',
    }),
  ])

  const partnerTotal = categories.reduce((n, c) => n + c.count, 0)

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
              held exclusively for The Club Members. The member rates, codes and
              details live inside the member portal.
            </p>
          </Reveal>
        </div>
      </Chapter>

      {/* ── 03 · Four benefits ────────────────────────────────────── */}
      <Chapter density="tight" bg="graphite" className="relative">
        <Aurora variant="soft" />
        <div className="relative z-10 max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {BENEFITS.map((b, i) => {
              const Icon = b.icon
              return (
                <Reveal key={b.title} type="up" delay={i * 90} className="h-full">
                  <Link
                    href={`/portal/rewards#${b.anchor}`}
                    className="group flex h-full flex-col border border-graphite-line/60 bg-ink/40 p-7 transition-colors duration-500 hover:border-bronze/50 day:bg-white"
                  >
                    <div className="flex items-start justify-between gap-4 mb-8">
                      <div className="w-12 h-12 rounded-full border border-bronze/35 bg-bronze/10 flex items-center justify-center">
                        <Icon size={18} strokeWidth={1.5} className="text-bronze-light" />
                      </div>
                      <span
                        className={
                          b.live
                            ? 'rounded-full border border-bronze/60 bg-bronze/15 px-3 py-1 font-[family-name:var(--font-meta)] text-[9px] uppercase tracking-[0.24em] text-bronze-light'
                            : 'rounded-full border border-graphite-line px-3 py-1 font-[family-name:var(--font-meta)] text-[9px] uppercase tracking-[0.24em] text-slate-haze'
                        }
                      >
                        {b.status}
                      </span>
                    </div>
                    <h3 className="font-[family-name:var(--font-display)] text-[22px] leading-tight text-ivory">
                      {b.title}
                    </h3>
                    <p className="mt-3 flex-1 font-[family-name:var(--font-editorial)] text-[14.5px] leading-[1.7] text-ivory-soft">
                      {b.body}
                    </p>
                    <span className="mt-7 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-slate-haze group-hover:text-bronze-light transition-colors">
                      <Lock size={11} strokeWidth={1.75} />
                      Members only
                    </span>
                  </Link>
                </Reveal>
              )
            })}
          </div>
        </div>
      </Chapter>

      {/* ── 04 · Partner benefits — categories + count only ──────── */}
      {categories.length > 0 && (
        <Chapter density="tight" bg="ink">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10 lg:mb-12">
              <div>
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
                  Partner benefits
                </p>
                <h2 className="display-md">
                  For The Club <em className="text-bronze-light">Members.</em>
                </h2>
              </div>
              <p className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.3em] text-ivory-soft tabular-nums">
                {partnerTotal} {partnerTotal === 1 ? 'partner' : 'partners'} · {categories.length}{' '}
                {categories.length === 1 ? 'category' : 'categories'}
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-graphite-line/50 border border-graphite-line/50">
              {categories.map((c, i) => (
                <Reveal key={c.category} type="up" delay={Math.min(i, 7) * 60} className="bg-ink">
                  <div className="h-full p-6 lg:p-7">
                    <p className="font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.6vw,1.4rem)] leading-tight text-ivory">
                      {c.category}
                    </p>
                    <p className="mt-2 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.28em] text-slate-haze tabular-nums">
                      {c.count} {c.count === 1 ? 'partner' : 'partners'}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Chapter>
      )}

      {/* ── 05 · Members-only CTA ─────────────────────────────────── */}
      <MembersCta />
    </>
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
