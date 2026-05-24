import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import { Marquee } from '../effects/Marquee'

// "As featured in" / partner logos strip. Pulls from public.partner_logos
// where is_visible = true. Section stays visible even when empty so the
// homepage rhythm is preserved, but no fabricated publication names
// (Tatler / Vogue / FT — those were placeholder lies). When the DB is
// empty, a quiet hairline rule sits where the marquee would.
//
// Add real partner logos via /dashboard/website/partners and the
// marquee comes alive automatically.

interface PartnerRow {
  id: string
  name: string
  image_url: string
  website_url: string | null
}

export async function PressMarquee() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('partner_logos')
    .select('id, name, image_url, website_url')
    .eq('is_visible', true)
    .order('display_order', { ascending: true })

  const rows: PartnerRow[] = data ?? []

  return (
    <section className="bg-ink py-20 lg:py-28 border-y border-graphite-line/40">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 mb-10 flex items-center gap-5">
        <span className="h-px flex-1 bg-graphite-line/80" />
        <p className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.42em] text-slate-haze">
          Esteemed Brand Partners
        </p>
        <span className="h-px flex-1 bg-graphite-line/80" />
      </div>

      {rows.length === 0 ? (
        // Empty state — no fake publication names. Just a quiet hairline
        // band that holds the section's place until real logos arrive.
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
          <div className="border-y border-graphite-line/40 py-12 text-center">
            <p className="font-[family-name:var(--font-editorial)] italic text-[15px] text-slate-haze">
              Partner logos appear here once added.
            </p>
          </div>
        </div>
      ) : (
        <Marquee variant="logos" duration={50}>
          {rows.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-center min-w-[160px] h-12 grayscale opacity-50 hover:opacity-90 transition-opacity duration-500"
            >
              {p.image_url ? (
                <Image
                  src={p.image_url}
                  alt={p.name}
                  width={140}
                  height={40}
                  className="max-h-10 w-auto object-contain"
                  unoptimized
                />
              ) : (
                <span className="font-[family-name:var(--font-display)] text-2xl italic text-ivory-soft tracking-wide">
                  {p.name}
                </span>
              )}
            </div>
          ))}
        </Marquee>
      )}
    </section>
  )
}
