import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { EventsCarousel, type CarouselEvent } from './EventsCarousel'
import { ArrowUpRight } from 'lucide-react'

// "05 On the calendar" — the next three PUBLIC upcoming events from
// public.events, rotated by <EventsCarousel /> (client). Visibility is
// filtered explicitly as well as by RLS, so a signed-in member's session
// never surfaces a members-only event here. No placeholders: the section is
// hidden when nothing public is coming up.

const PROGRAMME_LABELS: Record<string, string> = {
  member_event: 'Member Event',
  round_table: 'Round Table',
  pitch: 'PITCH',
  curated_experience: 'Curated Experience',
  london_series: 'London Series',
  partner_event: 'Partner Event',
}

export async function EventsTeaser() {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: events } = await supabase
    .from('events')
    .select('id, slug, title, start_date, venue_name, venue_city, event_type, programme, cover_image_url, short_description, description')
    .in('status', ['published', 'live'])
    .eq('visibility', 'public')
    .gte('start_date', now)
    .order('start_date', { ascending: true })
    .limit(3)

  // .gte('start_date', now) already drops rows with no date; the filter just
  // tells TypeScript that.
  const dated = (events ?? []).filter(
    (e): e is typeof e & { start_date: string } => e.start_date != null,
  )
  const list: CarouselEvent[] = dated.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    start_date: e.start_date,
    venue_name: e.venue_name,
    venue_city: e.venue_city,
    event_type: PROGRAMME_LABELS[e.programme ?? ''] ?? e.event_type,
    cover_image_url: e.cover_image_url,
    description: e.short_description || e.description,
  }))
  if (list.length === 0) return null

  return (
    <Chapter density="tight" bg="ink">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-10">
        <div className="max-w-2xl">
          <EditorialMeta number="05" label="Forthcoming" />
          <h2 className="display-md mt-8 mb-4 text-ivory whitespace-nowrap">
            On the calendar.
          </h2>
          <p className="lede max-w-xl">
            A small handful of evenings, considered carefully.
          </p>
        </div>
        <Link
          href="/events"
          className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300 group"
        >
          Every event
          <ArrowUpRight
            size={14}
            strokeWidth={1.5}
            className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
          />
        </Link>
      </div>

      <EventsCarousel events={list} />
    </Chapter>
  )
}
