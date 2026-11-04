import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { MetaLink, PillLink } from '@/components/website/forms/SiteButton'
import {
  FormPanel,
  NightHero,
  SectionHead,
  bodyClass,
  eyebrowClass,
} from '@/components/website/night/partner/blocks'
import { GuestMix } from '@/components/website/night/london/GuestMix'
import { LondonInvitationForm, LondonPartnerForm } from '@/components/website/night/london/LondonForms'
import {
  GUEST_MIX_NOTE,
  HARRODS_APPROVED,
  NEUTRAL_HERO,
  detailFor,
} from '@/components/website/night/london/content'
import { formatDate, formatTime, cn } from '@/lib/utils'

// /london-series/[slug] — one Helideck event: running order, who's in the
// room, target guest mix, sectors that fit. The event record (date, venue,
// running order if entered) comes from the shared events table
// (programme = 'london_series'); the deck's editorial detail fills in the
// rest, matched by title. noindex until HARRODS_APPROVED.

interface AgendaItem {
  time?: string
  title?: string
  description?: string
}

const getEvent = cache(async (slug: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('events')
    .select('id, slug, title, start_date, end_date, venue_name, venue_city, short_description, description, who_youll_meet, cover_image_url, agenda, booking_status')
    .eq('programme', 'london_series')
    .eq('slug', slug)
    .in('status', ['published', 'live', 'completed'])
    .maybeSingle()
  return data
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) return { title: 'London Series | The Club', robots: { index: false } }
  const title = `${event.title} | The Club | London at Harrods`
  const description = event.short_description ?? detailFor(event.title)?.intro ?? undefined
  return {
    title,
    description,
    openGraph: { title, description },
    ...(HARRODS_APPROVED ? {} : { robots: { index: false, follow: false } }),
  }
}

export const revalidate = 60

export default async function LondonSeriesEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) notFound()

  const detail = detailFor(event.title)
  const dbAgenda = Array.isArray(event.agenda) ? (event.agenda as unknown as AgendaItem[]) : []
  const runningOrder: [string, string][] = dbAgenda.length
    ? dbAgenda.map((a) => [a.time ?? '', [a.title, a.description].filter(Boolean).join(' — ')])
    : detail?.runningOrder ?? []
  // Until Harrods approves, no Helideck photography — even a cover image
  // entered on the event record — only neutral The Club photography.
  const hero = HARRODS_APPROVED ? event.cover_image_url || detail?.image || NEUTRAL_HERO : NEUTRAL_HERO

  const facts = [
    event.start_date && { label: 'Date', value: formatDate(event.start_date) },
    event.start_date && {
      label: 'Time',
      value: event.end_date ? `${formatTime(event.start_date)} – ${formatTime(event.end_date)}` : formatTime(event.start_date),
    },
    (event.venue_name || event.venue_city) && {
      label: 'Venue',
      value: [event.venue_name, event.venue_city].filter(Boolean).join(', '),
    },
    detail && { label: 'Format', value: detail.format },
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <>
      <NightHero
        image={hero}
        alt={event.title}
        eyebrow="The Helideck Series"
        title={event.title}
        lede={detail?.tagline ?? event.short_description ?? undefined}
      >
        <PillLink href="#partner-enquiry">Partner on this event</PillLink>
        <PillLink href="#invitation">Request an invitation</PillLink>
      </NightHero>

      <Chapter density="tight" bg="ink">
        {facts.length > 0 && (
          <Reveal type="up" delay={0}>
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-graphite-line/50 border border-graphite-line/50 mb-16">
              {facts.map((f) => (
                <div key={f.label} className="bg-ink p-5 lg:p-6">
                  <dt className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-slate-haze">
                    {f.label}
                  </dt>
                  <dd className="mt-2 text-[15px] leading-snug text-ivory">{f.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-7">
            {(detail?.intro || event.description) && (
              <Reveal type="up" delay={0}>
                <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.1rem,1.5vw,1.35rem)] leading-[1.7] text-ivory-soft">
                  {detail?.intro ?? event.description}
                </p>
              </Reveal>
            )}
            {runningOrder.length > 0 && (
              <Reveal type="up" delay={120}>
                <div className="mt-14">
                  <p className={cn(eyebrowClass, 'mb-7')}>{dbAgenda.length ? 'Running order' : 'Indicative running order'}</p>
                  <ol className="space-y-5 border-l border-bronze/25 pl-6">
                    {runningOrder.map(([t, item], i) => (
                      <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-4">
                        <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.2em] text-bronze-light tabular-nums pt-1">
                          {t}
                        </span>
                        <span className="text-[15px] leading-relaxed text-ivory">{item}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </Reveal>
            )}
          </div>

          <div className="lg:col-span-5 space-y-12">
            {detail && (
              <Reveal type="up" delay={160}>
                <div>
                  <p className={cn(eyebrowClass, 'mb-4')}>Who’s in the room</p>
                  <p className="font-[family-name:var(--font-display)] text-[1.35rem] leading-snug text-ivory mb-7">
                    {detail.roomHeadline}
                  </p>
                  <p className={cn(eyebrowClass, 'mb-4 !text-slate-haze')}>Target guest mix</p>
                  <GuestMix mix={detail.mix} note={GUEST_MIX_NOTE} />
                  <dl className="mt-8 space-y-4">
                    {detail.profile.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[4.5rem_1fr] gap-4">
                        <dt className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze pt-1">
                          {k}
                        </dt>
                        <dd className="text-[14px] leading-relaxed text-ivory-soft">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </Reveal>
            )}
            {!detail && event.who_youll_meet && (
              <Reveal type="up" delay={160}>
                <div>
                  <p className={cn(eyebrowClass, 'mb-4')}>Who’s in the room</p>
                  <p className={bodyClass}>{event.who_youll_meet}</p>
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </Chapter>

      {detail && (
        <Chapter density="tight" bg="graphite">
          <SectionHead eyebrow="Sectors that fit" title="Brands that belong in this room." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-graphite-line/50 border border-graphite-line/50">
            {detail.sectors.map(([s, line], i) => (
              <Reveal key={s} type="up" delay={(i % 3) * 80}>
                <div className="bg-graphite h-full p-6">
                  <p className="font-[family-name:var(--font-display)] text-[1.15rem] text-ivory">{s}</p>
                  <p className="mt-2 text-[14px] text-ivory-soft">{line}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Chapter>
      )}

      <Chapter density="default" bg="ink" id="enquire">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <FormPanel id="partner-enquiry" eyebrow="Partnership enquiries" title="Partner on this event.">
            <LondonPartnerForm events={[event.title]} initialEvent={event.title} />
          </FormPanel>
          <FormPanel
            id="invitation"
            eyebrow="Guests"
            title="Request an invitation."
            lede="Every Helideck event is by invitation. Requests are approved individually."
          >
            <LondonInvitationForm events={[event.title]} initialEvent={event.title} />
          </FormPanel>
        </div>
        <div className="mt-12">
          <MetaLink href="/london-series">The full Helideck Series</MetaLink>
        </div>
      </Chapter>
    </>
  )
}
