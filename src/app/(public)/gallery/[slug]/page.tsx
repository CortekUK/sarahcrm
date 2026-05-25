import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { PhotoBento, type BentoPhoto } from '@/components/website/night/gallery/PhotoBento'
import {
  VideoGallery,
  type VideoEntry,
} from '@/components/website/night/VideoGallery'
import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react'

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// /gallery/[slug]
//
//   01 Hero          — cover image + title, date, venue
//   02 Photo bento   — asymmetric grid of all photos with scroll
//                       reveal + lightbox modal
//   03 Films         — VideoGallery (if any rows in video_gallery
//                       with page_slug = `gallery-{slug}`)
//   04 Adjacent      — prev / next gallery navigation
// ─────────────────────────────────────────────────────────────────────

function formatCategory(c: string | null) {
  if (!c) return 'Gathering'
  return c
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function GalleryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: gallery } = await supabase
    .from('galleries')
    .select(
      'id, slug, title, category, event_date, venue_name, location, cover_image_url',
    )
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (!gallery) notFound()

  const [{ data: photoRows }, { data: videoRows }, { data: neighbours }] =
    await Promise.all([
      supabase
        .from('gallery_photos')
        .select('id, image_url, caption')
        .eq('gallery_id', gallery.id)
        .order('display_order', { ascending: true }),
      supabase
        .from('video_gallery')
        .select('id, youtube_url, title')
        .eq('page_slug', `gallery-${gallery.slug}`)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      supabase
        .from('galleries')
        .select('slug, title, cover_image_url, event_date')
        .eq('is_published', true)
        .order('event_date', { ascending: false, nullsFirst: false }),
    ])

  const photos: BentoPhoto[] = (photoRows ?? []).map((p) => ({
    id: p.id,
    url: p.image_url,
    caption: p.caption,
  }))
  const videos: VideoEntry[] = (videoRows as VideoEntry[]) ?? []

  // "More from the Atlas" — 3 most recent OTHER galleries (excluding
  // this one). Replaces the old prev/next 2-card pattern with a
  // proper 3-up "view more" strip.
  const list = neighbours ?? []
  const others = list.filter((g) => g.slug !== slug).slice(0, 3)

  const date = formatDate(gallery.event_date)

  return (
    <>
      {/* ── 01 · Hero ─────────────────────────────────────────── */}
      <section className="relative min-h-[78vh] w-full overflow-hidden bg-ink">
        {gallery.cover_image_url ? (
          <KenBurnsImage
            src={gallery.cover_image_url}
            alt={gallery.title}
            motion="in"
            duration={32}
            overlay={0.55}
            priority
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-graphite to-plum/30" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />

        <div className="relative z-10 min-h-[78vh] max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pt-32 pb-24">
          <Reveal type="up" delay={0}>
            <Link
              href="/gallery"
              className="self-start inline-flex items-center gap-2 mb-9 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light transition-colors duration-300"
            >
              <ArrowLeft size={13} strokeWidth={1.5} />
              All gatherings
            </Link>
          </Reveal>

          <Reveal type="up" delay={150}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
              {formatCategory(gallery.category)}
              {date && <span className="text-slate-haze ml-3">· {date}</span>}
            </p>
          </Reveal>

          <Reveal type="clip" delay={300}>
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,4.4vw,4rem)] leading-[1.1] tracking-[-0.01em] text-ivory max-w-4xl">
              {gallery.title}
            </h1>
          </Reveal>

          {(gallery.venue_name || gallery.location) && (
            <Reveal type="up" delay={500}>
              <p className="inline-flex items-center gap-3 mt-6 font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.25rem)] text-ivory-soft">
                <MapPin size={15} strokeWidth={1.5} className="text-bronze-light" />
                {[gallery.venue_name, gallery.location].filter(Boolean).join(', ')}
              </p>
            </Reveal>
          )}

          {photos.length > 0 && (
            <Reveal type="up" delay={650}>
              <p className="mt-7 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] tabular-nums text-slate-haze">
                {String(photos.length).padStart(2, '0')}{' '}
                {photos.length === 1 ? 'frame' : 'frames'}
                {videos.length > 0 && (
                  <span className="ml-3 text-bronze-light/85">
                    · {videos.length} {videos.length === 1 ? 'film' : 'films'}
                  </span>
                )}
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── Sub-nav ──────────────────────────────────────────
         Quick jump between Photos and Films. Only renders if
         there are films — otherwise it'd be a single tab pointing
         to itself. scroll-mt-24 on the target sections handles
         the fixed header offset so the section header sits below
         the NightHeader instead of behind it. */}
      {videos.length > 0 && photos.length > 0 && (
        <nav className="border-y border-graphite-line/40 bg-graphite/30 backdrop-blur-sm scroll-smooth">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-10 flex items-center justify-center gap-10 lg:gap-14 py-5">
            <a
              href="#photos"
              className="group inline-flex items-center gap-3 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-bronze" />
              {photos.length} Photos
            </a>
            <span aria-hidden className="h-3 w-px bg-graphite-line/70" />
            <a
              href="#films"
              className="group inline-flex items-center gap-3 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-bronze" />
              {videos.length} {videos.length === 1 ? 'Film' : 'Films'}
            </a>
          </div>
        </nav>
      )}

      {/* ── 02 · Photo bento ─────────────────────────────────── */}
      <Chapter density="tight" bg="ink" id="photos" className="scroll-mt-24">
        {photos.length === 0 ? (
          <div className="border border-graphite-line/40 rounded-2xl p-16 text-center max-w-3xl mx-auto">
            <p className="font-[family-name:var(--font-editorial)] italic text-[17px] text-ivory-soft">
              Photographs from the evening will be added here soon.
            </p>
          </div>
        ) : (
          <PhotoBento photos={photos} />
        )}
      </Chapter>

      {/* ── 03 · Films ───────────────────────────────────────── */}
      {videos.length > 0 && (
        <Chapter density="tight" bg="graphite" id="films" className="relative scroll-mt-24">
          <Aurora variant="soft" />
          <div className="relative z-10 max-w-[1400px] mx-auto">
            <Reveal type="up" delay={0}>
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light text-center mb-6">
                Films
              </p>
            </Reveal>
            <Reveal type="clip" delay={150}>
              <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.75rem,2.8vw,2.5rem)] leading-tight text-ivory text-center mb-14">
                The evening, on camera.
              </h2>
            </Reveal>
            <VideoGallery videos={videos} />
          </div>
        </Chapter>
      )}

      {/* ── 04 · More from the Atlas — 3-up uniform cards ───── */}
      {others.length > 0 && (
        <section className="bg-ink border-t border-graphite-line/40 py-16 lg:py-24">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
            <div className="flex items-center gap-4 mb-10">
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
                More from the Atlas
              </p>
              <span className="flex-1 h-px bg-bronze/40" />
              <Link
                href="/gallery"
                className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
              >
                View all
                <ArrowRight size={12} strokeWidth={1.5} />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
              {others.map((g) => (
                <MoreCard key={g.slug} g={g} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}

function MoreCard({
  g,
}: {
  g: { slug: string; title: string; cover_image_url: string | null; event_date: string | null }
}) {
  const date = formatDate(g.event_date)
  return (
    <Link
      href={`/gallery/${g.slug}`}
      className="group block border border-graphite-line/40 hover:border-bronze/55 transition-colors duration-500 bg-graphite/25 overflow-hidden"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-graphite">
        {g.cover_image_url && (
          <KenBurnsImage
            src={g.cover_image_url}
            alt={g.title}
            motion="in"
            duration={40}
            overlay={0.3}
            className="absolute inset-0"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/15 to-transparent" />
      </div>
      <div className="p-6">
        {date && (
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
            {date}
          </p>
        )}
        <h3 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.4vw,1.375rem)] leading-tight text-ivory group-hover:text-bronze-light transition-colors duration-500">
          {g.title}
        </h3>
      </div>
    </Link>
  )
}
