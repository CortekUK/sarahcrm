import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { ArrowUpRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

// Upcoming events teaser. Pulls the next 2-3 published events.
//
// Editorial event cards — no chunky "BOOK NOW" buttons, no badges.
// Just: cover image, eyebrow with date + type, headline, one-line
// detail, and a quiet "Reserve" link.

export async function EventsTeaser() {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: events } = await supabase
    .from('events')
    .select('id, slug, title, start_date, venue_name, venue_city, event_type, cover_image_url, description')
    .in('status', ['published', 'live'])
    .gte('start_date', now)
    .order('start_date', { ascending: true })
    .limit(3)

  if (!events || events.length === 0) {
    return null
  }

  return (
    <Chapter density="default" bg="ink">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-14">
        <div className="max-w-2xl">
          <EditorialMeta number="05" label="Forthcoming" />
          <h2 className="display-lg mt-10 mb-5 text-ivory">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
        {events.map((ev) => {
          const eventTypeLabel = (ev.event_type ?? 'gathering').replace(/_/g, ' ')
          return (
            <Link
              key={ev.id}
              href={`/events/${ev.slug}`}
              className="group block bg-graphite border border-graphite-line/60 hover:border-bronze/50 transition-colors duration-500"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-ink">
                {ev.cover_image_url ? (
                  <Image
                    src={ev.cover_image_url}
                    alt={ev.title}
                    fill
                    className="object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-[1.04]"
                    sizes="(min-width: 768px) 33vw, 100vw"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-[family-name:var(--font-display)] text-5xl text-slate-dim">
                      {ev.title.charAt(0)}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
                <div className="film-grain-night" />
                {/* Date pip */}
                <div className="absolute top-4 left-4 flex items-center gap-2.5">
                  <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-ivory/85">
                    {formatDate(ev.start_date)}
                  </span>
                  <span className="h-px w-6 bg-bronze/55" />
                </div>
              </div>
              <div className="p-6 md:p-7">
                <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
                  {eventTypeLabel}
                </span>
                <h3 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.25rem,1.7vw,1.625rem)] text-ivory leading-tight group-hover:text-bronze-light transition-colors duration-300">
                  {ev.title}
                </h3>
                {(ev.venue_name || ev.venue_city) && (
                  <p className="mt-2 text-[12.5px] text-slate-haze uppercase tracking-[0.18em]">
                    {[ev.venue_name, ev.venue_city].filter(Boolean).join(' · ')}
                  </p>
                )}
                {ev.description && (
                  <p className="mt-4 text-[13.5px] text-ivory-soft/85 leading-relaxed line-clamp-3">
                    {ev.description}
                  </p>
                )}
                <div className="mt-6 flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-bronze-light">
                  Reserve
                  <ArrowUpRight
                    size={13}
                    strokeWidth={1.5}
                    className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
                  />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </Chapter>
  )
}
