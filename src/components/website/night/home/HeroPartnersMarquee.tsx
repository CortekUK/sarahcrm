import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { Marquee } from '../effects/Marquee'

// Hero partner marquee — quiet logo strip directly under the video hero.
// No borders. Reads the real partners an admin manages in
// /dashboard/website/partners (public.partner_logos, is_visible = true,
// ordered by display_order — visible rows are publicly readable).
//
// No placeholder brands: if there are no visible partners (or the read
// fails) the whole strip is hidden rather than showing invented logos.

interface PartnerRow {
  id: string
  name: string
  image_url: string
  website_url: string | null
}

function safeHttpUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export async function HeroPartnersMarquee() {
  let rows: PartnerRow[] = []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('partner_logos')
      .select('id, name, image_url, website_url')
      .eq('is_visible', true)
      .order('display_order', { ascending: true })
    rows = (data ?? []).filter((r) => !!r.image_url || !!r.name)
  } catch {
    rows = []
  }

  if (rows.length === 0) return null

  return (
    // No always-night / bg-ink override — the marquee follows the page
    // theme (cream in day mode, ink in night mode).
    <section className="bg-ink pt-10 pb-3 lg:pt-12 lg:pb-4">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 mb-7 flex items-center justify-center gap-5">
        <span className="block h-px w-12 bg-bronze/50" />
        <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.25rem)] text-ivory-soft tracking-wide">
          Esteemed Brand Partners
        </p>
        <span className="block h-px w-12 bg-bronze/50" />
      </div>

      <Marquee variant="logos" duration={50}>
        {rows.map((p) => {
          const href = safeHttpUrl(p.website_url)
          const mark = p.image_url ? (
            <Image
              src={p.image_url}
              alt={p.name}
              width={180}
              height={48}
              className="max-h-10 lg:max-h-12 w-auto object-contain"
              unoptimized
            />
          ) : (
            <span className="font-[family-name:var(--font-display)] text-2xl italic tracking-wide">
              {p.name}
            </span>
          )
          return (
            <div
              key={p.id}
              className="flex items-center justify-center min-w-[180px] h-12 text-ivory-soft opacity-70 hover:opacity-100 hover:text-bronze transition-[opacity,color] duration-500"
            >
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" aria-label={p.name}>
                  {mark}
                </a>
              ) : (
                mark
              )}
            </div>
          )
        })}
      </Marquee>
    </section>
  )
}
