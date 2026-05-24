import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { EventsCarousel, type CarouselEvent } from './EventsCarousel'
import { ArrowUpRight } from 'lucide-react'

// Upcoming events teaser. Server component — fetches from
// public.events, falls back to placeholders so the layout is visible
// before real events are entered. The actual rotating display is
// handled by <EventsCarousel /> (client).

// PLACEHOLDER events for layout preview. Replace by publishing real
// events via /dashboard/events.
const PLACEHOLDER_EVENTS: CarouselEvent[] = [
  {
    id: 'placeholder-1',
    slug: '#',
    title: 'A Spring Members Supper',
    start_date: '2026-04-12T19:00:00Z',
    venue_name: 'The Club Manchester',
    venue_city: 'Manchester',
    event_type: 'members_dinner',
    cover_image_url: '/gallery/bigland.png',
    description:
      'A placeholder for an upcoming members evening. Add real events via the dashboard and these auto-replace.',
  },
  {
    id: 'placeholder-2',
    slug: '#',
    title: 'Summer Garden Reception',
    start_date: '2026-06-21T18:30:00Z',
    venue_name: 'The Club London',
    venue_city: 'London',
    event_type: 'reception',
    cover_image_url: '/gallery/land1.png',
    description:
      'Another placeholder event so the carousel has more than one entry to rotate through.',
  },
  {
    id: 'placeholder-3',
    slug: '#',
    title: 'An Autumn Long Lunch',
    start_date: '2026-09-14T13:00:00Z',
    venue_name: 'The Club Leeds',
    venue_city: 'Leeds',
    event_type: 'lunch',
    cover_image_url: '/gallery/land2.png',
    description:
      'Final placeholder. The carousel will show real upcoming events once published from the dashboard.',
  },
]

export async function EventsTeaser() {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: events } = await supabase
    .from('events')
    .select('id, slug, title, start_date, venue_name, venue_city, event_type, cover_image_url, description')
    .in('status', ['published', 'live'])
    .gte('start_date', now)
    .order('start_date', { ascending: true })

  const list: CarouselEvent[] = events && events.length > 0 ? events : PLACEHOLDER_EVENTS

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
