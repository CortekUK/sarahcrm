import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { formatDate, formatTime, cn } from '@/lib/utils'

// Event cards fed from the shared events table (PITCH + London Series).
// Each opens `hrefBase/<slug>`.

export interface ProgrammeEvent {
  id: string
  slug: string
  title: string
  start_date: string | null
  end_date: string | null
  venue_name: string | null
  venue_city: string | null
  short_description: string | null
  cover_image_url: string | null
  booking_status: string
}

export const PROGRAMME_EVENT_COLUMNS =
  'id, slug, title, start_date, end_date, venue_name, venue_city, short_description, cover_image_url, booking_status'

const STATUS_LABEL: Record<string, string> = {
  waitlist: 'Waitlist',
  invitation_only: 'By invitation',
  sold_out: 'Sold out',
}

export function EventCards({
  events,
  hrefBase = '/events',
  imageFor,
  useCover = true,
}: {
  events: ProgrammeEvent[]
  hrefBase?: string
  /** Fallback image when the event has no cover. */
  imageFor?: (e: ProgrammeEvent) => string | null
  /** false → ignore cover_image_url (e.g. unapproved Harrods photography). */
  useCover?: boolean
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
      {events.map((e, i) => {
        const img = (useCover ? e.cover_image_url : null) || imageFor?.(e) || null
        const status = Object.prototype.hasOwnProperty.call(STATUS_LABEL, e.booking_status)
          ? STATUS_LABEL[e.booking_status]
          : null
        return (
          <Reveal key={e.id} type="up" delay={(i % 3) * 90}>
            <Link
              href={`${hrefBase}/${e.slug}`}
              className="group block h-full border border-graphite-line/60 bg-graphite/40 day:bg-white day:shadow-sm hover:border-bronze/60 transition-colors duration-500"
            >
              {img && (
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={img}
                    alt={e.title}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-[1.6s] group-hover:scale-[1.04]"
                  />
                </div>
              )}
              <div className="p-6 lg:p-7">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {e.start_date && (
                    <p className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.3em] text-bronze-light">
                      {formatDate(e.start_date)}
                      {' · '}
                      {formatTime(e.start_date)}
                    </p>
                  )}
                  {status && (
                    <span className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.26em] text-slate-haze border border-graphite-line/70 rounded-full px-2.5 py-1">
                      {status}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(1.35rem,1.8vw,1.65rem)] leading-tight text-ivory">
                  {e.title}
                </h3>
                {(e.venue_name || e.venue_city) && (
                  <p className="mt-2 text-[13.5px] text-slate-haze">
                    {[e.venue_name, e.venue_city].filter(Boolean).join(', ')}
                  </p>
                )}
                {e.short_description && (
                  <p className="mt-4 text-[14px] leading-[1.7] text-ivory-soft line-clamp-3">{e.short_description}</p>
                )}
                <span
                  className={cn(
                    'mt-6 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-bronze-light',
                  )}
                >
                  View event <ArrowUpRight size={12} strokeWidth={1.5} />
                </span>
              </div>
            </Link>
          </Reveal>
        )
      })}
    </div>
  )
}
