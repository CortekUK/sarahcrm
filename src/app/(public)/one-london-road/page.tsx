import Link from 'next/link'
import Image from 'next/image'
import { KenBurnsImage, FullBleed } from '@/components/website/night/primitives/MediaBlocks'
import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { PullQuote } from '@/components/website/night/primitives/PullQuote'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'
import { getPageHero } from '@/lib/cms/heroes'
import { ArrowUpRight, MapPin, Train } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────
// One London Road — the venue page. Atmospheric portrait of a single
// building. Reads like a magazine travel feature: hero, lede, room-by-
// room walkthrough as full-bleed photographs, practical particulars at
// the foot.
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1551269901-5c5e14c25df7?auto=format&fit=crop&w=2400&q=85'

const ROOMS = [
  {
    src: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=2400&q=85',
    alt: 'A long dining room with a marble table and warm candlelight',
    name: 'The Long Room',
    capacity: 'Up to 32 for dining · 60 for standing receptions',
    detail: 'The room we open most often. A nine-metre marble table, an open kitchen at one end, a small bar at the other.',
  },
  {
    src: 'https://images.unsplash.com/photo-1582719188393-bb71ca45dbb9?auto=format&fit=crop&w=2400&q=85',
    alt: 'A small library with leather chairs and tall shelves',
    name: 'The Library',
    capacity: 'Up to 14 seated · 24 standing',
    detail: 'A quieter room behind the kitchen. Used for salons, smaller dinners, and the occasional book launch.',
  },
  {
    src: 'https://images.unsplash.com/photo-1525268323446-0505b6fe7778?auto=format&fit=crop&w=2400&q=85',
    alt: 'A vaulted basement bar with copper detailing',
    name: 'The Cellar',
    capacity: 'Up to 40 for drinks',
    detail: "A vaulted basement bar. Drops in temperature, drops in tempo. Where the evening usually ends.",
  },
]

export default async function OneLondonRoadPage() {
  const hero = await getPageHero('one-london-road', {
    page_slug: 'one-london-road',
    media_type: 'image',
    image_url: HERO_IMAGE,
    alt_text: 'One London Road by night',
    eyebrow: 'The Address · London · Marylebone',
    headline: 'One London Road.',
    lede:
      'A four-storey townhouse off Marylebone Lane. The home of The Club, and most of the rooms we host in.',
  })

  // The EditorialMeta stamp is split out of the eyebrow string —
  // anything after the bullet becomes the stamp, the rest becomes
  // the label. Falls back to gracefully if the admin removes the bullet.
  const eyebrowParts = (hero.eyebrow ?? '').split('·').map((s) => s.trim())
  const editorialLabel = eyebrowParts[0] ?? 'The Address'
  const editorialStamp = eyebrowParts.slice(1).join(' · ') || undefined

  return (
    <>
      {/* ── 00 · Hero ───────────────────────────────────────────────── */}
      <section className="relative h-[85vh] min-h-[640px] w-full always-night overflow-hidden bg-ink">
        <PageHeroMedia
          mediaType={hero.media_type}
          imageUrl={hero.image_url}
          alt={hero.alt_text}
          videoUrl={hero.video_url}
          videoPosterUrl={hero.video_poster_url}
          overlay={0.5}
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-[50%] hero-fade-bottom pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-24">
          <EditorialMeta label={editorialLabel} stamp={editorialStamp} />
          {hero.headline && (
            <h1 className="display-xl mt-8 max-w-4xl">{hero.headline}</h1>
          )}
          {hero.lede && <p className="lede mt-7 max-w-xl">{hero.lede}</p>}
        </div>
      </section>

      {/* ── 01 · Lede ────────────────────────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="max-w-3xl">
          <EditorialMeta number="01" label="A Townhouse" />
          <h2 className="display-lg mt-10 mb-10">A building that doesn&apos;t advertise itself.</h2>
          <div className="body-prose space-y-6">
            <p>
              From the street, there&apos;s a black door and an unmarked brass plate. No signage, no menu in the window. Members walk in; everyone else walks past.
            </p>
            <p>
              Inside, three reception rooms over two floors, a basement cellar, and a small private courtyard at the back. The building was renovated in 2024 to the brief of a single sentence: <em>this should feel like the home of someone who&apos;s been collecting for forty years.</em>
            </p>
          </div>
        </div>
      </Chapter>

      {/* ── 02 · The Rooms ───────────────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <div className="max-w-2xl mb-12">
          <EditorialMeta number="02" label="The Rooms" />
          <h2 className="display-lg mt-10">Three spaces, one address.</h2>
        </div>
      </Chapter>

      <div className="space-y-32">
        {ROOMS.map((r, i) => (
          <div key={r.name} className="relative">
            <FullBleed height="tall">
              <KenBurnsImage
                src={r.src}
                alt={r.alt}
                motion={i % 2 === 0 ? 'in' : 'left'}
                duration={36}
                overlay={0.4}
              />
              <div className="absolute top-8 left-8 lg:top-12 lg:left-12 flex items-center gap-3 z-10">
                <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-ivory/80 tabular-nums">
                  {String(i + 1).padStart(2, '0')} · The {r.name.split(' ').slice(1).join(' ')}
                </span>
                <span className="h-px w-10 bg-bronze/60" />
              </div>
            </FullBleed>
            <div className="max-w-[1600px] mx-auto px-6 lg:px-10 mt-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-1">
                  <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="lg:col-span-6">
                  <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.875rem,2.8vw,2.75rem)] text-ivory leading-tight">
                    {r.name}
                  </h3>
                  <p className="mt-3 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.28em] text-bronze-light">
                    {r.capacity}
                  </p>
                </div>
                <div className="lg:col-span-5">
                  <p className="body-prose">{r.detail}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 03 · Pull quote ─────────────────────────────────────────── */}
      <Chapter density="default" bg="graphite">
        <PullQuote align="center" size="xl">
          A building that doesn&apos;t announce itself is doing most of the work already.
        </PullQuote>
      </Chapter>

      {/* ── 04 · Particulars ────────────────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <EditorialMeta number="03" label="Particulars" />
            <h2 className="display-md mt-10">How to find us.</h2>
            <p className="body-prose mt-6 max-w-md">
              Members are sent the entrance details when an invitation is confirmed. For private event enquiries, we&apos;ll share the same alongside a proposal.
            </p>
          </div>
          <div className="lg:col-span-7 space-y-6">
            <Particular
              icon={MapPin}
              label="Address"
              value="One London Road, Marylebone, London W1U"
              detail="Behind a black door with a brass plate. We hold the bell on event evenings."
            />
            <Particular
              icon={Train}
              label="Nearest"
              value="Bond Street · 3 min walk · Marylebone · 6 min walk"
              detail="Black cabs and pickups are best stopped at the Marylebone Lane corner."
            />
          </div>
        </div>

        <div className="mt-16 flex items-center gap-5">
          <Link
            href="/private-event-services"
            className="group inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
          >
            Host an event here
            <ArrowUpRight
              size={14}
              strokeWidth={1.5}
              className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
            />
          </Link>
          <span className="h-px w-12 bg-bronze/40" />
          <Link
            href="/contact-us"
            className="group inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
          >
            Send a message
            <ArrowUpRight
              size={14}
              strokeWidth={1.5}
              className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
            />
          </Link>
        </div>
      </Chapter>

      {/* ── 05 · Apply close ────────────────────────────────────────── */}
      <ApplyClose />
    </>
  )
}

function Particular({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof MapPin
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="flex items-start gap-5 border-t border-graphite-line/60 pt-6">
      <div className="w-10 h-10 rounded-full bg-bronze/10 border border-bronze/25 flex items-center justify-center flex-shrink-0">
        <Icon size={14} strokeWidth={1.5} className="text-bronze-light" />
      </div>
      <div>
        <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze">
          {label}
        </span>
        <p className="mt-1 text-[15px] text-ivory leading-snug">{value}</p>
        <p className="mt-2 text-[13.5px] text-ivory-soft/80 leading-relaxed">{detail}</p>
      </div>
    </div>
  )
}
