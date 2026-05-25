import { createClient } from '@/lib/supabase/server'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Reveal } from '@/components/website/night/effects/Reveal'
import {
  GalleriesBrowser,
  type GalleryItem,
} from '@/components/website/night/gallery/GalleriesBrowser'
import { FeaturedGalleryCarousel } from '@/components/website/night/gallery/FeaturedGalleryCarousel'

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// /gallery
//
//   01 Hero with verbatim client copy
//   02 Filter chips ("Event Style") + paginated bento grid of past
//      gatherings — initial 12 with "Reveal more" pagination so the
//      page doesn't dump 50+ cards on first paint
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/gallery/bigland.png' // PLACEHOLDER

export default async function GalleryPage() {
  const supabase = await createClient()
  const { data: galleries } = await supabase
    .from('galleries')
    .select('id, slug, title, category, event_date, venue_name, location, cover_image_url')
    .eq('is_published', true)
    .order('event_date', { ascending: false, nullsFirst: false })

  const items: GalleryItem[] = galleries ?? []

  return (
    <>
      {/* ── 01 · Hero ─────────────────────────────────────────── */}
      <section className="relative min-h-[78vh] w-full overflow-hidden bg-ink">
        <KenBurnsImage
          src={HERO_IMAGE}
          alt="A members' evening"
          motion="in"
          duration={32}
          overlay={0.6}
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 min-h-[78vh] max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pt-32 pb-24">
          <Reveal type="up" delay={0}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
              The Atlas
            </p>
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,4.4vw,4rem)] leading-[1.1] tracking-[-0.01em] text-ivory">
              Gallery.
            </h1>
          </Reveal>
          <Reveal type="up" delay={400}>
            <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.1875rem)] leading-[1.75] text-ivory-soft mt-7 max-w-3xl">
              Explore a captivating collection of images capturing the essence of our exclusive
              gatherings &mdash; from the stylish ambiance of high-profile events to the intimate
              moments shared among like-minded individuals. Join us in reliving the moments that
              make The Club an unrivalled platform for forging meaningful connections in a unique
              setting.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── 02 · Featured carousel — big + marquee right stack ──
         Adaptive: 1 item → full width, 2 items → 50/50, 3+ items →
         featured-with-stack carousel that auto-rotates and animates
         the right column tiles as they shift. */}
      {items.length > 0 && (
        // pb-12 lg:pb-16 — much tighter than the default tight
        // density (py-20 md:py-28) so the Atlas section below
        // doesn't have a big dead band between them.
        <Chapter density="tight" bg="ink" className="pb-12 lg:pb-16">
          <div className="mb-10 flex items-center gap-4">
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
              Featured
            </p>
            <span className="flex-1 h-px bg-bronze/40" />
          </div>
          <Reveal type="up" delay={0}>
            <FeaturedGalleryCarousel items={items.slice(0, 8)} />
          </Reveal>
        </Chapter>
      )}

      {/* ── 03 · Filters + uniform card grid (Atlas) ─────────── */}
      <Chapter density="tight" bg="ink" className="pt-12 lg:pt-16">
        <div className="mb-10 flex items-center gap-4">
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
            The Atlas
          </p>
          <span className="flex-1 h-px bg-bronze/40" />
        </div>
        <Reveal type="up" delay={0}>
          <GalleriesBrowser items={items} />
        </Reveal>
      </Chapter>
    </>
  )
}
