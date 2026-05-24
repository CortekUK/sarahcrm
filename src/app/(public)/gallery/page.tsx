import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'
import { ArrowUpRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// Gallery index — editorial atlas of past nights.
//
// Structure:
//   00 Hero      — cinematic photograph + display title
//   01 Galleries — staggered grid (large/small alternating), filter
//                  chips for category. Each tile opens /gallery/[slug]
//   02 Apply close
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1530603907829-659ab6f1cd09?auto=format&fit=crop&w=2400&q=85'

interface GalleryRow {
  id: string
  slug: string
  title: string
  category: string | null
  event_date: string | null
  venue_name: string | null
  location: string | null
  cover_image_url: string | null
}

function formatCategory(c: string | null) {
  if (!c) return 'Gathering'
  return c
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

export default async function GalleryPage() {
  const supabase = await createClient()
  const { data: galleries } = await supabase
    .from('galleries')
    .select('id, slug, title, category, event_date, venue_name, location, cover_image_url')
    .eq('is_published', true)
    .order('event_date', { ascending: false, nullsFirst: false })

  const rows: GalleryRow[] = galleries ?? []

  return (
    <>
      {/* ── 00 · Hero ───────────────────────────────────────────────── */}
      <section className="relative h-[75vh] min-h-[520px] w-full overflow-hidden bg-ink">
        <KenBurnsImage
          src={HERO_IMAGE}
          alt="A candlelit room"
          motion="in"
          duration={32}
          overlay={0.6}
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-24">
          <EditorialMeta label="Atlas" stamp={`${rows.length} gatherings`} />
          <h1 className="display-xl mt-8 max-w-4xl">A record of recent nights.</h1>
          <p className="lede mt-7 max-w-xl">
            We don&apos;t publish guest lists. We publish a few frames — enough to give you a feeling for the rooms, not enough to break the room itself.
          </p>
        </div>
      </section>

      {/* ── 01 · Galleries grid ─────────────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="max-w-2xl mb-16">
          <EditorialMeta number="01" label="The Atlas" />
          <h2 className="display-lg mt-10">Browse, gently.</h2>
        </div>

        {rows.length === 0 ? (
          <div className="border border-graphite-line/60 p-16 text-center">
            <p className="font-[family-name:var(--font-editorial)] italic text-xl text-ivory-soft/80">
              The gallery is being curated.
            </p>
            <p className="text-[13px] text-slate-haze mt-3">
              Members are the first to see new collections.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-12 auto-rows-[clamp(220px,26vw,360px)] gap-4 lg:gap-6">
            {rows.map((g, i) => {
              // Staggered editorial layout — 1st large, 2nd & 3rd small,
              // 4th large again, etc.
              const pattern = i % 5
              const span =
                pattern === 0
                  ? 'col-span-12 lg:col-span-8 row-span-2'
                  : pattern === 1
                  ? 'col-span-12 sm:col-span-6 lg:col-span-4'
                  : pattern === 2
                  ? 'col-span-12 sm:col-span-6 lg:col-span-4'
                  : pattern === 3
                  ? 'col-span-12 sm:col-span-6 lg:col-span-5 row-span-2'
                  : 'col-span-12 sm:col-span-6 lg:col-span-7'
              return (
                <Link
                  key={g.id}
                  href={`/gallery/${g.slug}`}
                  className={`group relative overflow-hidden bg-graphite-2 border border-graphite-line/50 hover:border-bronze/40 transition-colors duration-500 ${span}`}
                >
                  {g.cover_image_url ? (
                    <Image
                      src={g.cover_image_url}
                      alt={g.title}
                      fill
                      className="object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-[1.05]"
                      sizes="(min-width: 1024px) 50vw, 100vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-[family-name:var(--font-display)] text-7xl text-slate-dim">
                        {g.title.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
                  <div className="film-grain-night" />

                  {/* Caption */}
                  <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
                    <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light mb-3">
                      {formatCategory(g.category)}
                      {g.event_date && (
                        <span className="text-slate-haze">
                          {' · '}
                          {formatDate(g.event_date)}
                        </span>
                      )}
                    </p>
                    <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.25rem,1.8vw,1.875rem)] leading-tight text-ivory group-hover:text-bronze-light transition-colors duration-300">
                      {g.title}
                    </h3>
                    {(g.venue_name || g.location) && (
                      <p className="mt-2 text-[12.5px] text-ivory-soft/70 uppercase tracking-[0.18em]">
                        {[g.venue_name, g.location].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Hover arrow */}
                  <ArrowUpRight
                    size={18}
                    strokeWidth={1.2}
                    className="absolute top-5 right-5 text-bronze opacity-0 group-hover:opacity-100 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-500"
                  />
                </Link>
              )
            })}
          </div>
        )}
      </Chapter>

      {/* ── 02 · Apply close ─────────────────────────────────────────── */}
      <ApplyClose />
    </>
  )
}
