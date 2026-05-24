import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'
import { ArrowUpRight, Calendar, MapPin } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// Events index — editorial calendar.
//
// Structure:
//   00 Hero          — full-bleed photo + display title
//   01 Forthcoming   — magazine contents-page-style list of upcoming
//                      events, one row each (large image left, copy right)
//   02 Past nights   — quieter grid of past events with desaturated photos
//   03 Apply close
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1546484488-9c14e07f5e0d?auto=format&fit=crop&w=2400&q=85'

type EventRow = {
  id: string
  slug: string
  title: string
  start_date: string
  end_date: string | null
  event_type: string
  venue_name: string | null
  venue_city: string | null
  cover_image_url: string | null
  description: string | null
}

function formatEventType(t: string) {
  return t.replace(/_/g, ' ').toLowerCase()
}

export default async function EventsPage() {
  const supabase = await createClient()

  const { data: events } = await supabase
    .from('events')
    .select('id, slug, title, start_date, end_date, event_type, venue_name, venue_city, cover_image_url, description')
    .in('status', ['published', 'live'])
    .order('start_date', { ascending: true })

  const now = new Date()
  const upcoming = (events ?? []).filter((e) => new Date(e.start_date) >= now) as EventRow[]
  const past = (events ?? []).filter((e) => new Date(e.start_date) < now).reverse() as EventRow[]

  return (
    <>
      {/* ── 00 · Hero ───────────────────────────────────────────────── */}
      <section className="relative h-[75vh] min-h-[520px] w-full overflow-hidden bg-ink">
        <KenBurnsImage
          src={HERO_IMAGE}
          alt="A long candlelit dining room"
          motion="in"
          duration={32}
          overlay={0.6}
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-24">
          <EditorialMeta label="The Calendar" stamp={`${upcoming.length} forthcoming`} />
          <h1 className="display-xl mt-8 max-w-4xl">An invitation per season.</h1>
          <p className="lede mt-7 max-w-xl">
            We host twelve nights a year for members and their guests. Reservations open four weeks ahead, sometimes less. We don&apos;t overbook.
          </p>
        </div>
      </section>

      {/* ── 01 · Forthcoming ─────────────────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="max-w-2xl mb-16">
          <EditorialMeta number="01" label="Forthcoming" />
          <h2 className="display-lg mt-10">On the calendar.</h2>
        </div>

        {upcoming.length === 0 ? (
          <div className="border border-graphite-line/60 p-16 text-center">
            <p className="font-[family-name:var(--font-editorial)] italic text-xl text-ivory-soft/80">
              The next season&apos;s programme is in preparation.
            </p>
            <p className="text-[13px] text-slate-haze mt-3">
              Members are notified first.{' '}
              <Link href="/membership-application" className="text-bronze-light hover:text-ivory transition-colors">
                Apply for membership →
              </Link>
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-graphite-line/60">
            {upcoming.map((ev, i) => (
              <EventEntry key={ev.id} ev={ev} index={i + 1} />
            ))}
          </ul>
        )}
      </Chapter>

      {/* ── 02 · Past nights ─────────────────────────────────────────── */}
      {past.length > 0 && (
        <Chapter density="default" bg="graphite">
          <div className="max-w-2xl mb-16">
            <EditorialMeta number="02" label="Past Nights" />
            <h2 className="display-lg mt-10">An archive, with discretion.</h2>
            <p className="lede mt-6 max-w-xl">
              A short record of what&apos;s come before. Members can request the full recap of any past event.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {past.slice(0, 9).map((ev) => (
              <Link
                key={ev.id}
                href={`/events/${ev.slug}`}
                className="group block bg-ink border border-graphite-line/40 hover:border-bronze/40 transition-colors duration-500"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-graphite">
                  {ev.cover_image_url ? (
                    <Image
                      src={ev.cover_image_url}
                      alt={ev.title}
                      fill
                      className="object-cover grayscale-[40%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-[1.04]"
                      sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-[family-name:var(--font-display)] text-5xl text-slate-dim">
                        {ev.title.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/65 to-transparent" />
                  <div className="film-grain-night" />
                </div>
                <div className="p-5">
                  <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
                    {formatDate(ev.start_date)}
                  </p>
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.4vw,1.375rem)] text-ivory leading-tight">
                    {ev.title}
                  </h3>
                  {ev.venue_name && (
                    <p className="mt-2 text-[12px] text-slate-haze uppercase tracking-[0.18em]">
                      {ev.venue_name}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </Chapter>
      )}

      {/* ── 03 · Apply close ─────────────────────────────────────────── */}
      <ApplyClose />
    </>
  )
}

// Editorial "row" for a forthcoming event — magazine contents-page style.
function EventEntry({ ev, index }: { ev: EventRow; index: number }) {
  return (
    <li>
      <Link
        href={`/events/${ev.slug}`}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 py-12 group items-center"
      >
        {/* Index */}
        <div className="lg:col-span-1 flex items-center">
          <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light tabular-nums">
            {String(index).padStart(2, '0')}
          </span>
        </div>

        {/* Image */}
        <div className="lg:col-span-4 relative aspect-[4/3] overflow-hidden bg-graphite">
          {ev.cover_image_url ? (
            <Image
              src={ev.cover_image_url}
              alt={ev.title}
              fill
              className="object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-[1.04]"
              sizes="(min-width: 1024px) 33vw, 100vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-[family-name:var(--font-display)] text-6xl text-slate-dim">
                {ev.title.charAt(0)}
              </span>
            </div>
          )}
          <div className="film-grain-night" />
        </div>

        {/* Copy */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          <p className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light">
            {formatEventType(ev.event_type)}
          </p>
          <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2.4vw,2.25rem)] leading-tight text-ivory group-hover:text-bronze-light transition-colors duration-300">
            {ev.title}
          </h3>
          <div className="flex flex-wrap items-center gap-5 text-[12px] text-slate-haze">
            <span className="inline-flex items-center gap-2">
              <Calendar size={12} strokeWidth={1.5} className="text-bronze/70" />
              {formatDate(ev.start_date)}
            </span>
            {(ev.venue_name || ev.venue_city) && (
              <span className="inline-flex items-center gap-2">
                <MapPin size={12} strokeWidth={1.5} className="text-bronze/70" />
                {[ev.venue_name, ev.venue_city].filter(Boolean).join(', ')}
              </span>
            )}
          </div>
          {ev.description && (
            <p className="mt-2 body-prose max-w-prose line-clamp-2">{ev.description}</p>
          )}
        </div>

        {/* Arrow */}
        <div className="lg:col-span-1 flex justify-end items-center">
          <ArrowUpRight
            size={20}
            strokeWidth={1.2}
            className="text-bronze/60 group-hover:text-bronze-light transition-all duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
          />
        </div>
      </Link>
    </li>
  )
}
