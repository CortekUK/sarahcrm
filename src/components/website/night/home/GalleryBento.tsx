import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { GalleryBentoGrid, type BentoPhoto } from './GalleryBentoGrid'
import { ArrowUpRight } from 'lucide-react'

// "Recent Nights" — gallery teaser bento. Pulls 5 photos from
// gallery_photos; falls back to a curated stock set when the DB has
// fewer than 5 published rows.

// Real client images from public/gallery/.
// Tile order maps to the asymmetric bento layout in GalleryBentoGrid:
//   0  large left   (col-span-8 row-span-2)  — bigland landscape
//   1  tall right   (col-span-4 row-span-2)  — portrait, fits this slot
//   2  small bottom (col-span-4 row-span-1)  — land1
//   3  small bottom (col-span-4 row-span-1)  — land2
//   4  small bottom (col-span-4 row-span-1)  — land3
const FALLBACK: BentoPhoto[] = [
  { id: 'fb-1', src: '/gallery/bigland.png', caption: 'A recent evening' },
  { id: 'fb-2', src: '/gallery/potrait.png', caption: 'In the room' },
  { id: 'fb-3', src: '/gallery/land1.png', caption: 'Members table' },
  { id: 'fb-4', src: '/gallery/land2.png', caption: 'Reception' },
  { id: 'fb-5', src: '/gallery/land3.png', caption: 'Past gathering' },
]

export async function GalleryBento() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('gallery_photos')
    .select('id, image_url, caption')
    .order('display_order', { ascending: true })
    .limit(5)

  const photos: BentoPhoto[] =
    data && data.length >= 5
      ? data.map((p) => ({
          id: p.id,
          src: p.image_url,
          caption: p.caption ?? 'A moment from a recent night',
        }))
      : FALLBACK

  return (
    <Chapter density="tight" bg="ink">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-10">
        <div>
          <EditorialMeta number="04" label="Recent Nights" />
          <h2 className="display-lg mt-10 text-ivory whitespace-nowrap">
            From recent evenings.
          </h2>
        </div>
        <Link
          href="/gallery"
          className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300 group"
        >
          The full gallery
          <ArrowUpRight
            size={14}
            strokeWidth={1.5}
            className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
          />
        </Link>
      </div>

      <GalleryBentoGrid photos={photos} />
    </Chapter>
  )
}
