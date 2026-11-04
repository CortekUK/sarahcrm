import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { BookingWidget } from '@/components/website/night/events/BookingWidget'
import { RequestInvitationForm } from '@/components/website/night/events/RequestInvitationForm'
import { BookingStatusBadge } from '@/components/website/night/events/EventsBrowser'
import { eventPriceLine, formatDateRange, ukDay } from '@/components/website/events/format'
import { PROGRAMME_TAG, isProgramme } from '@/components/website/events/programmes'
import { ArrowLeft, ArrowUpRight, Calendar, Clock, MapPin, Plane, Tag, Users } from 'lucide-react'
import { UK_TIME_ZONE } from '@/lib/utils'

export const revalidate = 60

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://theclubgroup.co').replace(/\/+$/, '')

// ─────────────────────────────────────────────────────────────────────
// /events/[slug] — editorial spread for a single event + booking.
//
//   01 Hero          — cover image, programme tag, title, date/venue
//   02 Key facts     — venue · date · UK time · price (+ VAT)
//   03 Detail spread — description, who you'll meet, running order,
//                      speakers; sticky action card right:
//                        open            → BookingWidget (guests) +
//                                          member sign-in to reserve
//                        invitation_only → Request an invitation form
//                        waitlist / sold_out → waitlist form
//                      plus "Sponsor this event" when sponsorship_available
//   04 Past          — archive note + gallery
//
// PUBLIC events only. A members-only event (visibility 'members') is
// never rendered here: signed-out visitors can't read it (RLS) → 404;
// signed-in users are sent to the portal page for it.
// ─────────────────────────────────────────────────────────────────────

interface AgendaItem {
  time?: string
  title?: string
  description?: string
}

interface Speaker {
  name?: string
  title?: string
  company?: string
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

function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: UK_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: UK_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Per-event title / description / Open Graph image so each event page can
// rank and share under its own name.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: event } = await supabase
    .from('events')
    .select('title, description, short_description, cover_image_url, start_date, venue_name, venue_city')
    .eq('slug', slug)
    .in('status', ['published', 'live', 'completed'])
    .eq('visibility', 'public')
    .maybeSingle()
  if (!event) return { title: 'Event not found | The Club by Sarah Restrick' }
  const when = event.start_date ? formatDateLong(event.start_date) : null
  const where = [event.venue_name, event.venue_city].filter(Boolean).join(', ')
  const fallback = [when, where].filter(Boolean).join(' · ')
  const raw = (event.short_description || event.description || '').replace(/\s+/g, ' ').trim()
  const description =
    (raw.length > 160 ? `${raw.slice(0, 157).trimEnd()}…` : raw) ||
    (fallback ? `${event.title} — ${fallback}.` : `${event.title} at The Club.`)
  const images = event.cover_image_url ? [{ url: event.cover_image_url, alt: event.title }] : undefined
  return {
    title: `${event.title} | The Club by Sarah Restrick`,
    description,
    alternates: { canonical: `${SITE_URL}/events/${slug}` },
    openGraph: {
      type: 'website',
      title: event.title,
      description,
      images,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: event.title,
      description,
      images: event.cover_image_url ? [event.cover_image_url] : undefined,
    },
  }
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ s?: string; cancelled?: string }>
}) {
  const { slug } = await params
  const { s: sponsorToken, cancelled } = await searchParams
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .in('status', ['published', 'live', 'completed'])
    .maybeSingle()

  if (!event) notFound()
  // Members-only rows only come back for signed-in users (RLS). Never render
  // them on the public site — the portal has the full detail + booking.
  if (event.visibility !== 'public') redirect(`/portal/events/${event.id}`)

  // A published event always has a date (planning rows never get here), but
  // the column is nullable for planning, so narrow once and reuse.
  const startDate = event.start_date
  const finishAt = event.end_date ?? startDate
  const isPast = finishAt != null && new Date(finishAt) < new Date()
  const multiDay = !!(startDate && event.end_date && ukDay(startDate) !== ukDay(event.end_date))
  const dateLabel = startDate ? formatDateRange(startDate, event.end_date) : 'Date to be confirmed'
  const timeLabel = !startDate
    ? 'To be confirmed'
    : multiDay
      ? `From ${formatTime(startDate)} UK time`
      : `${event.doors_open ? `Doors ${formatTime(event.doors_open)} · ` : ''}${formatTime(startDate)}${
          event.end_date ? ` – ${formatTime(event.end_date)}` : ''
        } UK time`
  const priceLine = eventPriceLine(event)
  const programmeTag = isProgramme(event.programme)
    ? PROGRAMME_TAG[event.programme]
    : formatEventType(event.event_type)
  const venueLine = [event.venue_name, event.venue_city].filter(Boolean).join(', ')

  // ── Sponsor invite link (optional) ──────────────────────────────
  // When the URL carries ?s=<token>, resolve it to the sponsorship so the
  // booking widget can show that sponsor's negotiated price and pre-fill
  // their details. Looked up with the service role (server-only) so we don't
  // need a public RLS policy on `sponsorships`.
  let sponsor: {
    token: string
    price_pence: number
    package_name: string
    name: string
    email: string
    company: string
  } | null = null
  if (sponsorToken && !isPast) {
    const adminDb = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data: sp } = await adminDb
      .from('sponsorships')
      .select(
        'id, event_id, event_price_pence, package_name, status, sponsor_name, sponsor_email, sponsor_company',
      )
      .eq('booking_token', sponsorToken)
      .maybeSingle()
    if (sp && sp.event_id === event.id && sp.status !== 'declined') {
      const price = sp.event_price_pence ?? event.sponsor_price_pence ?? 0
      if (price > 0) {
        sponsor = {
          token: sponsorToken,
          price_pence: price,
          package_name: sp.package_name,
          name: sp.sponsor_name ?? '',
          email: sp.sponsor_email ?? '',
          company: sp.sponsor_company ?? '',
        }
      }
    }
  }
  const agenda = parseJsonArray<AgendaItem>(event.agenda)
  const speakers = parseJsonArray<Speaker>(event.speakers).filter((s) => s.name)

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
              {programmeTag}
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
              {dateLabel}
              {venueLine && (
                <>
                  {' · '}
                  <em className="not-italic text-bronze-light">{venueLine}</em>
                </>
              )}
            </p>
          </Reveal>
          {!isPast && (
            <Reveal type="up" delay={600}>
              <BookingStatusBadge status={event.booking_status} className="mt-6 self-start" />
            </Reveal>
          )}
        </div>
      </section>

      {/* ── 02 · Key facts ─────────────────────────────────────── */}
      <section className="bg-graphite-2 border-y border-graphite-line/40">
        <dl className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8 lg:py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-10">
          <Detail icon={MapPin} label="Venue" value={venueLine || 'To be confirmed'} />
          <Detail icon={Calendar} label="Date" value={dateLabel} />
          <Detail icon={Clock} label="Time" value={timeLabel} />
          <Detail icon={Tag} label="Price" value={priceLine} />
        </dl>
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

            {/* Who you'll meet */}
            {event.who_youll_meet && (
              <Reveal type="up" delay={150}>
                <div>
                  <p className="font-[family-name:var(--font-meta)] text-[11.5px] uppercase tracking-[0.42em] text-bronze-light mb-7">
                    Who you&apos;ll meet
                  </p>
                  <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.0625rem,1.3vw,1.25rem)] leading-[1.8] text-ivory max-w-prose whitespace-pre-line">
                    {event.who_youll_meet}
                  </p>
                </div>
              </Reveal>
            )}

            {/* Particulars — full address, capacity, travel */}
            {(event.venue_address || event.capacity != null || event.travel_included) && (
              <Reveal type="up" delay={200}>
                <div>
                  <p className="font-[family-name:var(--font-meta)] text-[11.5px] uppercase tracking-[0.42em] text-bronze-light mb-7">
                    Particulars
                  </p>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-7 gap-x-10 border-t border-graphite-line/50 pt-8">
                    {event.venue_address && (
                      <Detail
                        icon={MapPin}
                        label="Address"
                        value={[event.venue_name, event.venue_address, event.venue_city, event.venue_postcode]
                          .filter(Boolean)
                          .join(', ')}
                      />
                    )}
                    {event.capacity != null && (
                      <Detail icon={Users} label="Capacity" value={`${event.capacity} guests`} />
                    )}
                    {event.travel_included && <Detail icon={Plane} label="Travel" value="Included" />}
                  </dl>
                </div>
              </Reveal>
            )}

            {/* Agenda */}
            {agenda.length > 0 && (
              <Reveal type="up" delay={300}>
                <div>
                  <p className="font-[family-name:var(--font-meta)] text-[11.5px] uppercase tracking-[0.42em] text-bronze-light mb-7">
                    Running order
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

            {/* Speakers — also shown to members in the portal */}
            {speakers.length > 0 && (
              <Reveal type="up" delay={350}>
                <div>
                  <p className="font-[family-name:var(--font-meta)] text-[11.5px] uppercase tracking-[0.42em] text-bronze-light mb-7">
                    In the Room
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-9 border-t border-graphite-line/50 pt-8">
                    {speakers.map((speaker, i) => (
                      <div key={i}>
                        <p className="font-[family-name:var(--font-display)] text-[clamp(1.25rem,1.6vw,1.5rem)] text-ivory leading-tight">
                          {speaker.name}
                        </p>
                        {(speaker.title || speaker.company) && (
                          <p className="mt-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light">
                            {[speaker.title, speaker.company].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {speaker.bio && (
                          <p className="mt-4 font-[family-name:var(--font-editorial)] italic text-[15px] leading-[1.7] text-ivory-soft">
                            {speaker.bio}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            )}
          </div>

          {/* ── Booking widget (sticky on desktop) ────────────── */}
          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-32">
              {isPast ? (
                <PastNotice slug={event.slug} />
              ) : event.booking_status === 'invitation_only' && !sponsor ? (
                <RequestInvitationForm
                  event={{ id: event.id, slug: event.slug, title: event.title, dateLabel }}
                  mode="invitation"
                />
              ) : (event.booking_status === 'waitlist' || event.booking_status === 'sold_out') && !sponsor ? (
                <RequestInvitationForm
                  event={{ id: event.id, slug: event.slug, title: event.title, dateLabel }}
                  mode="waitlist"
                  heading={event.booking_status === 'sold_out' ? 'Sold out' : 'Waitlist'}
                />
              ) : (
                <Reveal type="up" delay={0}>
                  <BookingWidget
                    event={{
                      id: event.id,
                      slug: event.slug,
                      title: event.title,
                      start_date: startDate ?? '',
                      venue_name: event.venue_name,
                      venue_city: event.venue_city,
                      guest_price_pence: event.guest_price_pence,
                      member_price_pence: event.member_price_pence,
                      accommodation_available: event.accommodation_available,
                      accommodation_price_pence: event.accommodation_price_pence,
                      auto_confirm: event.auto_confirm,
                      vat_mode: event.vat_mode,
                      vat_rate: event.vat_rate,
                    }}
                    sponsor={sponsor}
                    paymentCancelled={cancelled === '1'}
                  />
                </Reveal>
              )}
              {!isPast && event.sponsorship_available && (
                <Link
                  href={`/partner/sponsorship?event=${encodeURIComponent(event.slug)}`}
                  className="mt-5 flex items-center justify-between gap-4 border border-graphite-line/50 rounded-2xl px-7 py-5 hover:border-bronze/55 transition-colors duration-500 group"
                >
                  <span>
                    <span className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.36em] text-bronze-light">
                      Partner With Us
                    </span>
                    <span className="mt-1.5 block font-[family-name:var(--font-display)] text-[1.25rem] text-ivory group-hover:text-bronze-light transition-colors">
                      Sponsor this event
                    </span>
                  </span>
                  <ArrowUpRight size={16} strokeWidth={1.5} className="text-bronze-light shrink-0" />
                </Link>
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
