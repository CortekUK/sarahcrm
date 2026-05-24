import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { PullQuote } from '@/components/website/night/primitives/PullQuote'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'
import { ArrowLeft, ArrowUpRight, Calendar, Clock, MapPin, Users } from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// Event detail — editorial spread for a single event.
//
// Structure:
//   00 Hero            — large cover image with eyebrow + display title
//   01 Lede + Details  — paragraph copy left, "particulars" sheet right
//                        (date / time / venue / capacity / price)
//   02 Agenda          — numbered itinerary if event.agenda exists
//   03 Voices          — speakers if event.speakers exists
//   04 Gallery         — gallery_urls for past events
//   05 Close           — Reserve CTA for upcoming, Apply close for past
// ─────────────────────────────────────────────────────────────────────

interface AgendaItem {
  time?: string
  title?: string
  description?: string
}

interface SpeakerItem {
  name?: string
  title?: string
  bio?: string
}

function parseJsonArray<T>(value: unknown): T[] {
  if (!value) return []
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  return []
}

function formatEventType(t: string) {
  return t.replace(/_/g, ' ').toLowerCase()
}

function formatGBP(pence: number) {
  if (pence === 0) return 'Complimentary'
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0,
    }).format(pence / 100)
  } catch {
    return `£${Math.round(pence / 100)}`
  }
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .in('status', ['published', 'live'])
    .single()

  if (!event) notFound()

  const isPast = new Date(event.start_date) < new Date()
  const agenda = parseJsonArray<AgendaItem>(event.agenda)
  const speakers = parseJsonArray<SpeakerItem>(event.speakers)

  return (
    <>
      {/* ── 00 · Hero ───────────────────────────────────────────────── */}
      <section className="relative h-[80vh] min-h-[560px] w-full overflow-hidden bg-ink">
        {event.cover_image_url ? (
          <KenBurnsImage
            src={event.cover_image_url}
            alt={event.title}
            motion="in"
            duration={32}
            overlay={0.55}
            priority
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-graphite to-plum/30" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />

        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-24">
          <Link
            href="/events"
            className="self-start inline-flex items-center gap-2 mb-8 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light transition-colors"
          >
            <ArrowLeft size={13} strokeWidth={1.5} />
            All Events
          </Link>
          <EditorialMeta
            label={formatEventType(event.event_type)}
            stamp={isPast ? 'Past Event' : 'Forthcoming'}
          />
          <h1 className="display-xl mt-8 max-w-4xl">{event.title}</h1>
          <div className="mt-9 flex flex-wrap items-center gap-7 text-ivory-soft">
            <span className="inline-flex items-center gap-2.5">
              <Calendar size={14} strokeWidth={1.5} className="text-bronze/80" />
              <span className="text-[14px]">{formatDateTime(event.start_date)}</span>
            </span>
            {(event.venue_name || event.venue_city) && (
              <span className="inline-flex items-center gap-2.5">
                <MapPin size={14} strokeWidth={1.5} className="text-bronze/80" />
                <span className="text-[14px]">
                  {[event.venue_name, event.venue_city].filter(Boolean).join(', ')}
                </span>
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── 01 · Lede + fixture sheet ──────────────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          {/* Body prose */}
          <div className="lg:col-span-7">
            <EditorialMeta number="01" label="The Evening" />
            <p className="lede mt-10 mb-10">
              {event.description?.split('\n')[0] ??
                'Details of this evening are shared with members closer to the date.'}
            </p>
            {event.description && (
              <div className="body-prose space-y-6 whitespace-pre-line max-w-prose">
                {event.description.split('\n').slice(1).join('\n')}
              </div>
            )}
          </div>

          {/* Particulars sheet */}
          <aside className="lg:col-span-5">
            <div className="border border-graphite-line/80 bg-graphite p-8 sticky top-32">
              <span className="eyebrow-quiet">Particulars</span>
              <dl className="mt-7 space-y-5">
                <DetailRow icon={Calendar} label="Date" value={formatDate(event.start_date)} />
                {event.doors_open && (
                  <DetailRow icon={Clock} label="Doors" value={formatDateTime(event.doors_open).split(', ')[1]} />
                )}
                {(event.venue_name || event.venue_city) && (
                  <DetailRow
                    icon={MapPin}
                    label="Venue"
                    value={[event.venue_name, event.venue_city, event.venue_address]
                      .filter(Boolean)
                      .join(', ')}
                  />
                )}
                {event.capacity && (
                  <DetailRow icon={Users} label="Capacity" value={`${event.capacity} guests`} />
                )}
              </dl>

              {!isPast && (
                <>
                  <div className="mt-8 pt-8 border-t border-graphite-line/60">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="eyebrow-quiet">Members</span>
                      <span className="font-[family-name:var(--font-display)] text-2xl text-bronze-light">
                        {formatGBP(event.member_price_pence)}
                      </span>
                    </div>
                    {event.guest_price_pence > 0 && (
                      <div className="flex items-baseline justify-between mt-2">
                        <span className="eyebrow-quiet">Guests</span>
                        <span className="font-[family-name:var(--font-display)] text-lg text-ivory-soft">
                          {formatGBP(event.guest_price_pence)}
                        </span>
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/portal/events/${event.id}`}
                    className="mt-7 group w-full inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-bronze hover:bg-bronze-light rounded-full font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.32em] text-ink transition-all duration-500"
                  >
                    Reserve a Place
                    <ArrowUpRight
                      size={13}
                      strokeWidth={1.8}
                      className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
                    />
                  </Link>
                  <p className="mt-3 text-[11px] text-slate-haze text-center italic">
                    Members only. Sign in to reserve.
                  </p>
                </>
              )}

              {isPast && (
                <div className="mt-7 p-5 border border-graphite-line/60 text-center">
                  <p className="font-[family-name:var(--font-editorial)] italic text-ivory-soft/80">
                    This event has passed.
                  </p>
                  <Link
                    href="/events"
                    className="mt-3 inline-block text-[12px] text-bronze-light hover:text-ivory transition-colors"
                  >
                    See forthcoming events →
                  </Link>
                </div>
              )}
            </div>
          </aside>
        </div>
      </Chapter>

      {/* ── 02 · Agenda ────────────────────────────────────────────── */}
      {agenda.length > 0 && (
        <Chapter density="default" bg="graphite">
          <div className="max-w-2xl mb-16">
            <EditorialMeta number="02" label="The Agenda" />
            <h2 className="display-md mt-10">The shape of the evening.</h2>
          </div>
          <ul className="divide-y divide-graphite-line/60 max-w-3xl">
            {agenda.map((item, i) => (
              <li key={i} className="grid grid-cols-12 gap-6 py-7">
                <div className="col-span-3">
                  <p className="font-[family-name:var(--font-meta)] text-[12px] uppercase tracking-[0.28em] text-bronze-light tabular-nums">
                    {item.time ?? '—'}
                  </p>
                </div>
                <div className="col-span-9">
                  {item.title && (
                    <h3 className="font-[family-name:var(--font-display)] text-xl text-ivory leading-tight">
                      {item.title}
                    </h3>
                  )}
                  {item.description && (
                    <p className="mt-2 text-[14px] text-ivory-soft/85 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Chapter>
      )}

      {/* ── 03 · Speakers ──────────────────────────────────────────── */}
      {speakers.length > 0 && (
        <Chapter density="default" bg="ink">
          <div className="max-w-2xl mb-16">
            <EditorialMeta number={agenda.length > 0 ? '03' : '02'} label="The Voices" />
            <h2 className="display-md mt-10">Who you&apos;ll hear from.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {speakers.map((sp, i) => (
              <div key={i} className="border-t border-bronze/30 pt-6">
                <p className="eyebrow-quiet">{`Voice ${String(i + 1).padStart(2, '0')}`}</p>
                {sp.name && (
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl text-ivory leading-tight">
                    {sp.name}
                  </h3>
                )}
                {sp.title && (
                  <p className="mt-1 text-[12.5px] text-bronze-light uppercase tracking-[0.22em]">
                    {sp.title}
                  </p>
                )}
                {sp.bio && (
                  <p className="mt-4 text-[14px] text-ivory-soft/85 leading-relaxed">{sp.bio}</p>
                )}
              </div>
            ))}
          </div>
        </Chapter>
      )}

      {/* ── 04 · Gallery (past events only) ────────────────────────── */}
      {isPast && event.gallery_urls && event.gallery_urls.length > 0 && (
        <Chapter density="default" bg="ink">
          <div className="max-w-2xl mb-12">
            <EditorialMeta label="From the Night" />
            <h2 className="display-md mt-10">A few frames.</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {event.gallery_urls.slice(0, 6).map((url, i) => (
              <div key={i} className="relative aspect-square overflow-hidden bg-graphite">
                <Image
                  src={url}
                  alt={`${event.title} — frame ${i + 1}`}
                  fill
                  className="object-cover transition-transform duration-700 hover:scale-[1.06]"
                  sizes="(min-width: 768px) 33vw, 50vw"
                />
                <div className="film-grain-night" />
              </div>
            ))}
          </div>
        </Chapter>
      )}

      {/* ── 05 · Close ─────────────────────────────────────────────── */}
      {isPast ? (
        <ApplyClose />
      ) : (
        <Chapter density="tight" bg="plum">
          <PullQuote attribution="The Club" align="center" size="lg">
            Reserve early. The room is small, and the night is finite.
          </PullQuote>
          <div className="flex justify-center mt-2">
            <Link
              href={`/portal/events/${event.id}`}
              className="group inline-flex items-center gap-3 px-9 py-4 border border-bronze hover:bg-bronze rounded-full font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ivory hover:text-ink transition-all duration-500"
            >
              Reserve a Place
              <ArrowUpRight
                size={15}
                strokeWidth={1.5}
                className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
              />
            </Link>
          </div>
        </Chapter>
      )}
    </>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-8 h-8 mt-0.5 rounded-full bg-bronze/10 border border-bronze/25 flex items-center justify-center flex-shrink-0">
        <Icon size={13} strokeWidth={1.5} className="text-bronze-light" />
      </div>
      <div>
        <dt className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze">
          {label}
        </dt>
        <dd className="mt-1 text-[14px] text-ivory leading-snug">{value}</dd>
      </div>
    </div>
  )
}
