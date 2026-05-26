import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { BookingWidget } from '@/components/website/night/events/BookingWidget'
import { ArrowLeft, Calendar, Clock, MapPin, Tag, Users } from 'lucide-react'

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// /events/[slug] — editorial spread for a single event + guest booking.
//
//   01 Hero          — cover image, type tag, title, italic date/venue
//   02 Detail spread — description left, sticky booking widget right
//   03 Agenda        — itinerary block if event.agenda exists
//   04 Past message  — for past events, skip booking and show archive
//                       note instead
// ─────────────────────────────────────────────────────────────────────

interface AgendaItem {
  time?: string
  title?: string
  description?: string
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

function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatGBP(pence: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(pence / 100)
}

function formatPriceWithVAT(pence: number | null | undefined) {
  if (pence == null) return null
  if (pence === 0) return 'Complimentary'
  return `${formatGBP(pence)} + VAT`
}

// "Complimentary Members · £500 + VAT Guests" — same helper as on the
// events listing card, kept duplicated here so the detail page stays
// self-contained.
function formatPriceLine(
  member: number | null | undefined,
  guest: number | null | undefined,
) {
  const m = formatPriceWithVAT(member)
  const g = formatPriceWithVAT(guest)
  if (m && g) {
    if (member === guest) return g
    return `${m} Members · ${g} Guests`
  }
  return m || g || null
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
    .in('status', ['published', 'live', 'completed'])
    .single()

  if (!event) notFound()

  const isPast = new Date(event.start_date) < new Date()
  const agenda = parseJsonArray<AgendaItem>(event.agenda)

  return (
    <>
      {/* ── 01 · Hero ───────────────────────────────────────────
         min-h instead of h so the hero grows to fit long event
         titles that wrap onto two lines. With the fixed h-[78vh]
         the top of the headline was getting clipped on shorter
         viewports because the flex container was anchoring content
         to the bottom and the overflow-hidden cut the top off. */}
      <section className="relative min-h-[78vh] w-full always-night overflow-hidden bg-ink">
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
        <div className="absolute inset-x-0 bottom-0 h-[55%] hero-fade-bottom pointer-events-none" />

        <div className="relative z-10 min-h-[78vh] max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pt-32 pb-24">
          <Reveal type="up" delay={0}>
            <Link
              href="/events"
              className="self-start inline-flex items-center gap-2 mb-9 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light transition-colors duration-300"
            >
              <ArrowLeft size={13} strokeWidth={1.5} />
              All events
            </Link>
          </Reveal>
          <Reveal type="up" delay={150}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
              {formatEventType(event.event_type)}
              {isPast && <span className="text-slate-haze ml-3">· Archive</span>}
            </p>
          </Reveal>
          {/* Hero title sized smaller than display-xl — long event
             titles ("Members Dining · Leeds", "A Curated Evening at
             City Tower") wrap to two lines and need room to breathe
             without the descenders getting clipped at the top. */}
          <Reveal type="clip" delay={250}>
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,4.4vw,4rem)] leading-[1.1] tracking-[-0.01em] text-ivory max-w-4xl">
              {event.title}
            </h1>
          </Reveal>
          <Reveal type="up" delay={500}>
            <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.25vw,1.25rem)] text-ivory-soft mt-6 max-w-xl">
              {formatDateLong(event.start_date)}
              {(event.venue_name || event.venue_city) && (
                <>
                  {' · '}
                  <em className="not-italic text-bronze-light">
                    {[event.venue_name, event.venue_city].filter(Boolean).join(', ')}
                  </em>
                </>
              )}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── 02 · Detail + Booking widget ──────────────────────── */}
      <Chapter density="default" bg="ink">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 max-w-[1400px] mx-auto">
          {/* ── Editorial copy ────────────────────────────────── */}
          <div className="lg:col-span-7 space-y-12">
            {event.description && (
              <Reveal type="up" delay={0}>
                <div>
                  <p className="font-[family-name:var(--font-meta)] text-[11.5px] uppercase tracking-[0.42em] text-bronze-light mb-7">
                    The Evening
                  </p>
                  {/* Body text was 17/19px ivory-soft — bumped to 18/22
                     and full ivory so it reads at a comfortable
                     editorial register, not as fine print. */}
                  <div className="font-[family-name:var(--font-editorial)] text-[clamp(1.125rem,1.4vw,1.375rem)] leading-[1.8] text-ivory space-y-6 max-w-prose">
                    {event.description
                      .split(/\n{2,}/)
                      .map((para: string, i: number) => (
                        <p key={i}>{para}</p>
                      ))}
                  </div>
                </div>
              </Reveal>
            )}

            {/* Particulars sheet */}
            <Reveal type="up" delay={200}>
              <div>
                <p className="font-[family-name:var(--font-meta)] text-[11.5px] uppercase tracking-[0.42em] text-bronze-light mb-7">
                  Particulars
                </p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-7 gap-x-10 border-t border-graphite-line/50 pt-8">
                  <Detail
                    icon={Calendar}
                    label="Date"
                    value={formatDateLong(event.start_date)}
                  />
                  <Detail
                    icon={Clock}
                    label="Time"
                    value={
                      event.doors_open
                        ? `Doors ${formatTime(event.doors_open)}${
                            event.start_date ? ` · From ${formatTime(event.start_date)}` : ''
                          }`
                        : formatTime(event.start_date)
                    }
                  />
                  {(event.venue_name || event.venue_address) && (
                    <Detail
                      icon={MapPin}
                      label="Venue"
                      value={
                        [
                          event.venue_name,
                          event.venue_address,
                          event.venue_city,
                          event.venue_postcode,
                        ]
                          .filter(Boolean)
                          .join(', ') || '—'
                      }
                    />
                  )}
                  {event.capacity != null && (
                    <Detail
                      icon={Users}
                      label="Capacity"
                      value={`${event.capacity} seats`}
                    />
                  )}
                  {/* Price spans both columns at the bottom — the
                     "Complimentary Members · £X + VAT Guests" line is
                     too long for a single column. */}
                  {formatPriceLine(
                    event.member_price_pence,
                    event.guest_price_pence,
                  ) && (
                    <div className="sm:col-span-2">
                      <Detail
                        icon={Tag}
                        label="Price"
                        value={
                          formatPriceLine(
                            event.member_price_pence,
                            event.guest_price_pence,
                          ) ?? ''
                        }
                      />
                    </div>
                  )}
                </dl>
              </div>
            </Reveal>

            {/* Agenda */}
            {agenda.length > 0 && (
              <Reveal type="up" delay={300}>
                <div>
                  <p className="font-[family-name:var(--font-meta)] text-[11.5px] uppercase tracking-[0.42em] text-bronze-light mb-7">
                    Agenda
                  </p>
                  <ol className="space-y-7 border-l border-bronze/25 pl-7">
                    {agenda.map((item, i) => (
                      <li key={i}>
                        {item.time && (
                          <p className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light tabular-nums">
                            {item.time}
                          </p>
                        )}
                        {item.title && (
                          <p className="font-[family-name:var(--font-display)] text-[clamp(1.25rem,1.6vw,1.625rem)] text-ivory mt-2">
                            {item.title}
                          </p>
                        )}
                        {item.description && (
                          <p className="mt-3 font-[family-name:var(--font-editorial)] italic text-[16px] leading-[1.7] text-ivory-soft">
                            {item.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </Reveal>
            )}
          </div>

          {/* ── Booking widget (sticky on desktop) ────────────── */}
          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-32">
              {isPast ? (
                <PastNotice slug={event.slug} />
              ) : (
                <Reveal type="up" delay={0}>
                  <BookingWidget
                    event={{
                      id: event.id,
                      slug: event.slug,
                      title: event.title,
                      start_date: event.start_date,
                      venue_name: event.venue_name,
                      venue_city: event.venue_city,
                      guest_price_pence: event.guest_price_pence,
                      member_price_pence: event.member_price_pence,
                    }}
                  />
                </Reveal>
              )}
            </div>
          </aside>
        </div>
      </Chapter>

      {/* ── 03 · Gallery for past events ───────────────────── */}
      {isPast &&
        Array.isArray(event.gallery_urls) &&
        event.gallery_urls.length > 0 && (
          <Chapter density="tight" bg="graphite" className="relative">
            <Aurora variant="soft" />
            <div className="relative z-10">
              <div className="max-w-3xl mx-auto text-center mb-14">
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
                  Captured
                </p>
                <h2 className="display-md">From the evening.</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {(event.gallery_urls as string[]).map((url, i) => (
                  <div
                    key={i}
                    className="relative aspect-square overflow-hidden border border-graphite-line/40"
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          </Chapter>
        )}
    </>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-5">
      <div className="w-11 h-11 rounded-full bg-bronze/10 border border-bronze/35 flex items-center justify-center flex-shrink-0">
        <Icon size={16} strokeWidth={1.5} className="text-bronze-light" />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-slate-haze">
          {label}
        </p>
        <p className="mt-2 font-[family-name:var(--font-editorial)] text-[17px] leading-[1.5] text-ivory break-words">
          {value}
        </p>
      </div>
    </div>
  )
}

function PastNotice({ slug }: { slug: string }) {
  return (
    <div className="border border-graphite-line/50 bg-graphite/40 backdrop-blur-sm rounded-2xl p-7 lg:p-8">
      <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
        Archive
      </p>
      <p className="font-[family-name:var(--font-editorial)] italic text-[15.5px] leading-[1.7] text-ivory-soft">
        This evening has already taken place. Members can request a recap through the portal — and
        the team keeps a quiet record for those who were there.
      </p>
      <Link
        href="/events"
        className="mt-6 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
        // slug kept in scope so future "next event" link is one swap away
        aria-label={`Browse other evenings — currently viewing ${slug}`}
      >
        See upcoming evenings
        <ArrowLeft size={13} strokeWidth={1.5} className="rotate-180" />
      </Link>
    </div>
  )
}
