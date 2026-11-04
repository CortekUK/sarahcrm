import Link from 'next/link'
import Image from 'next/image'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Chapter, EditorialMeta } from '../primitives/Chapter'

// "04 Recent Nights" — the top four featured Portfolio case studies
// (portfolio_case_studies: is_published + is_featured, by display_order).
// Links through to each case study and to /portfolio. Real-data-only: the
// whole section is hidden when nothing is featured.
//
// portfolio_case_studies isn't in the generated Database types yet, so the
// read goes through an untyped view of the (RLS-respecting) server client.

interface CaseStudyCard {
  id: string
  slug: string
  title: string
  headline_result: string | null
  hero_image_url: string | null
  date_label: string | null
  location: string | null
}

async function getFeaturedCaseStudies(): Promise<CaseStudyCard[]> {
  try {
    const supabase = (await createClient()) as unknown as SupabaseClient
    const { data, error } = await supabase
      .from('portfolio_case_studies')
      .select('id, slug, title, headline_result, hero_image_url, date_label, location')
      .eq('is_published', true)
      .eq('is_featured', true)
      .order('display_order', { ascending: true })
      .order('event_date', { ascending: false, nullsFirst: false })
      .limit(4)
    if (error) return []
    return (data ?? []) as CaseStudyCard[]
  } catch {
    return []
  }
}

// 12-col editorial layout: wide + narrow, then narrow + wide.
const SPANS = ['lg:col-span-7', 'lg:col-span-5', 'lg:col-span-5', 'lg:col-span-7']

export async function RecentNights() {
  const items = await getFeaturedCaseStudies()
  if (items.length === 0) return null

  return (
    <Chapter density="tight" bg="ink">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-10">
        <div>
          <EditorialMeta number="04" label="Recent Nights" />
          <h2 className="display-lg mt-10 text-ivory">From recent evenings.</h2>
        </div>
        <Link
          href="/portfolio"
          className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300 group"
        >
          The full portfolio
          <ArrowUpRight
            size={14}
            strokeWidth={1.5}
            className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
          />
        </Link>
      </div>

      <div className="always-night grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4">
        {items.map((c, i) => (
          <Link
            key={c.id}
            href={`/portfolio/${c.slug}`}
            className={`group relative block overflow-hidden bg-graphite-2 border border-graphite-line/40 hover:border-bronze/60 transition-colors duration-500 aspect-[4/3] lg:aspect-auto lg:h-[clamp(280px,28vw,420px)] ${SPANS[i] ?? 'lg:col-span-6'}`}
          >
            {c.hero_image_url && (
              <Image
                src={c.hero_image_url}
                alt={c.title}
                fill
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.05]"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
            <div className="film-grain-night" />
            <div className="absolute inset-x-0 bottom-0 p-6 lg:p-8">
              {(c.date_label || c.location) && (
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
                  {[c.location, c.date_label].filter(Boolean).join(' · ')}
                </p>
              )}
              <p className="mt-3 flex items-end justify-between gap-4 font-[family-name:var(--font-display)] text-[clamp(1.35rem,2.2vw,2rem)] leading-tight text-ivory">
                {c.title}
                <ArrowUpRight
                  size={18}
                  strokeWidth={1.5}
                  className="shrink-0 text-bronze-light transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
                />
              </p>
              {c.headline_result && (
                <p className="mt-2 font-[family-name:var(--font-editorial)] italic text-[15px] text-ivory-soft line-clamp-2">
                  {c.headline_result}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </Chapter>
  )
}
