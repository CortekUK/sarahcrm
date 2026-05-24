import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { PullQuote } from '@/components/website/night/primitives/PullQuote'
import { BentoGrid, BentoTile } from '@/components/website/night/effects/BentoGrid'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'
import { StickyScrollReveal, type RevealScene } from '@/components/website/night/effects/StickyScrollReveal'
import {
  Calendar,
  Handshake,
  KeyRound,
  MessageCircleHeart,
  Sparkles,
  Wine,
  ArrowUpRight,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────
// Memberships — application page restyled for the night palette.
// Editorial-magazine structure:
//   00 Hero       — full-bleed photo + display headline
//   01 Tiers      — StickyScrollReveal cycling through tier_1/2/3
//   02 Included   — bento grid of what membership covers
//   03 Process    — three numbered steps (Apply / Conversation / Decision)
//   04 Pull quote — Sarah on who it's for
//   05 Apply close
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=2400&q=85'

// Editorial framing — what each tier means — is brand voice, not data.
// Pricing comes from the DB.
const TIER_COPY: Record<
  string,
  { image: string; tagline: string; description: string; quota: string }
> = {
  tier_1: {
    image: 'https://images.unsplash.com/photo-1519214605650-76a613ee3245?auto=format&fit=crop&w=1800&q=85',
    tagline: 'For the curious arrival.',
    description:
      'A measured introduction. Three curated members a year, four events a season, and a standing invitation to discover the rooms that suit you. The right way in.',
    quota: 'Three introductions a year',
  },
  tier_2: {
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1800&q=85',
    tagline: 'For the settled member.',
    description:
      "The middle voice — five introductions a year, the full event calendar, and access to the smaller, quieter gatherings we don't advertise. Most members find their pace here.",
    quota: 'Five introductions a year',
  },
  tier_3: {
    image: 'https://images.unsplash.com/photo-1559329007-40df8a9345d8?auto=format&fit=crop&w=1800&q=85',
    tagline: 'For the architects.',
    description:
      "Unlimited introductions, dedicated concierge, and a seat at the table when we shape the next season. The Club's most engaged voices live here, often as hosts.",
    quota: 'Unlimited introductions, concierge',
  },
}

const INCLUDED = [
  {
    icon: Calendar,
    eyebrow: 'Calendar',
    title: 'A season of invitations',
    detail: "Twelve curated nights a year, plus the smaller gatherings we don't list publicly.",
  },
  {
    icon: Handshake,
    eyebrow: 'Introductions',
    title: 'A real address book',
    detail: "Hand-made introductions, with Sarah's personal note. Never algorithmic, never bulk.",
  },
  {
    icon: Wine,
    eyebrow: 'Hospitality',
    title: 'Off-menu access',
    detail: 'Standing tables at the restaurants, hotels and clubs we partner with — by name.',
  },
  {
    icon: MessageCircleHeart,
    eyebrow: 'Concierge',
    title: 'A person, not a portal',
    detail: 'When you need a reservation, a recommendation, or someone to talk to — a real one.',
  },
  {
    icon: KeyRound,
    eyebrow: 'Private events',
    title: 'Spaces for hire',
    detail: 'Members host with us at preferred terms. We close rooms, set tables, leave the rest to you.',
  },
  {
    icon: Sparkles,
    eyebrow: 'The room',
    title: 'A standard, not a guest list',
    detail: 'Every member is here because the rest of the room wants them to be. That changes the evening.',
  },
]

const PROCESS = [
  {
    step: '01',
    title: 'Apply',
    body: 'A short form. Tell us who you are, what you do, and who introduced you. We read each one personally.',
  },
  {
    step: '02',
    title: 'A Conversation',
    body: 'If your application reads, we invite you to coffee or a phone call. Twenty minutes, no script, no charge.',
  },
  {
    step: '03',
    title: 'A Decision',
    body: "Within seven days of our conversation, we'll either welcome you in or — with respect — say not just yet.",
  },
]

function formatGBP(pence: number): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0,
    }).format(pence / 100)
  } catch {
    return `£${Math.round(pence / 100)}`
  }
}

export default async function MembershipsPage() {
  const supabase = await createClient()
  const { data: tiers } = await supabase
    .from('membership_tiers')
    .select('id, tier, membership_type, name, price_pence, billing_interval, intro_quota')
    .eq('is_active', true)
    .eq('membership_type', 'individual')
    .eq('billing_interval', 'month')
    .order('price_pence', { ascending: true })

  const scenes: RevealScene[] = (tiers ?? []).map((t) => {
    const copy = TIER_COPY[t.tier] ?? {
      image: HERO_IMAGE,
      tagline: '',
      description: '',
      quota: '',
    }
    return {
      key: t.id,
      visual: (
        <KenBurnsImage src={copy.image} alt={t.name} motion="in" duration={28} className="w-full h-full" />
      ),
      eyebrow: `${t.tier.replace('_', ' ').toUpperCase()} · ${formatGBP(t.price_pence)} / month`,
      title: copy.tagline || t.name,
      body: (
        <>
          <p>{copy.description}</p>
          <div className="mt-8 flex items-center gap-3 text-bronze-light">
            <span className="h-px w-10 bg-bronze/50" />
            <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.28em]">
              {copy.quota}
            </span>
          </div>
        </>
      ),
    }
  })

  return (
    <>
      {/* ── 00 · Hero ───────────────────────────────────────────────── */}
      <section className="relative h-[80vh] min-h-[560px] w-full overflow-hidden bg-ink">
        <KenBurnsImage src={HERO_IMAGE} alt="A members' room" motion="in" duration={32} overlay={0.6} priority className="absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-24">
          <EditorialMeta label="Membership" stamp="Application Only" />
          <h1 className="display-xl mt-8 max-w-4xl">Membership is by invitation.</h1>
          <p className="lede mt-7 max-w-xl">
            We don&apos;t publish a price list to lead with. We publish one because, eventually, you&apos;ll ask.
          </p>
        </div>
      </section>

      {/* ── 01 · Tiers (sticky scroll reveal) ───────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="max-w-2xl mb-16">
          <EditorialMeta number="01" label="Three Tiers" />
          <h2 className="display-lg mt-10">A pace for every member.</h2>
          <p className="lede mt-7 max-w-xl">
            Each tier is a different relationship with The Club. Most members settle into the middle voice; a few belong at either end.
          </p>
        </div>

        {scenes.length > 0 ? (
          <StickyScrollReveal scenes={scenes} visualBg="graphite" />
        ) : (
          <div className="text-slate-haze italic text-center py-20">
            Tier information is being updated. Please check back shortly.
          </div>
        )}
      </Chapter>

      {/* ── 02 · What's included ─────────────────────────────────────── */}
      <Chapter density="default" bg="graphite">
        <div className="max-w-2xl mb-16">
          <EditorialMeta number="02" label="Included" />
          <h2 className="display-lg mt-10">What membership covers.</h2>
        </div>

        <BentoGrid>
          {INCLUDED.map((item) => (
            <BentoTile
              key={item.eyebrow}
              span="col-span-12 md:col-span-6 lg:col-span-4 row-span-1"
              hover="none"
            >
              <div className="absolute inset-0 p-7 md:p-9 flex flex-col">
                <div className="w-10 h-10 rounded-full bg-bronze/10 border border-bronze/30 flex items-center justify-center mb-7">
                  <item.icon size={16} strokeWidth={1.4} className="text-bronze-light" />
                </div>
                <span className="eyebrow-quiet">{item.eyebrow}</span>
                <h3 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.25rem,1.5vw,1.5rem)] leading-tight text-ivory">
                  {item.title}
                </h3>
                <p className="mt-4 text-[13.5px] text-ivory-soft/80 leading-relaxed">
                  {item.detail}
                </p>
              </div>
            </BentoTile>
          ))}
        </BentoGrid>
      </Chapter>

      {/* ── 03 · The Process ─────────────────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-4">
            <EditorialMeta number="03" label="The Process" />
            <h2 className="display-md mt-10">Three quiet steps.</h2>
            <p className="body-prose mt-6 max-w-md">
              From application to welcome takes between five and ten days. We don&apos;t batch decisions.
            </p>
            <Link
              href="/membership-application"
              className="mt-10 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300 group"
            >
              Begin an application
              <ArrowUpRight
                size={14}
                strokeWidth={1.5}
                className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
              />
            </Link>
          </div>
          <div className="lg:col-span-8 space-y-12">
            {PROCESS.map((p) => (
              <div key={p.step} className="grid grid-cols-12 gap-6 border-t border-graphite-line pt-10">
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

      {/* ── 04 · Sarah's line ────────────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <PullQuote attribution="Sarah Restrick" attributionDetail="Founder" align="center" size="xl">
          The Club isn&apos;t for everyone, and that&apos;s why everyone in it wants to be here.
        </PullQuote>
      </Chapter>

      {/* ── 05 · Apply close ─────────────────────────────────────────── */}
      <ApplyClose />
    </>
  )
}
