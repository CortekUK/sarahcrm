import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import {
  EventsBrowser,
  type EventListItem,
} from '@/components/website/night/events/EventsBrowser'
import { ArrowUpRight } from 'lucide-react'

export const revalidate = 60

// ─────────────────────────────────────────────────────────────────────
// /events — editorial calendar.
//
//   01 Hero with verbatim intro line
//   02 Filter chips + forthcoming events + past archive (client browser)
//   03 Private Events CTA — for one-off / corporate bookings, links to
//      /private-event-services
//
// Booking is open to anyone — guests can book without joining
// (BookingWidget on the event detail page handles the guest form +
// Stripe checkout); members can sign in to book through the portal at
// the member rate.
// ─────────────────────────────────────────────────────────────────────

const HERO_IMAGE = '/gallery/bigland.png' // PLACEHOLDER
const PRIVATE_EVENTS_IMAGE = '/theclub-section.png' // PLACEHOLDER

export default async function EventsPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('events')
    .select(
      'id, slug, title, start_date, end_date, doors_open, event_type, venue_name, venue_city, cover_image_url, description, guest_price_pence, member_price_pence',
    )
    .in('status', ['published', 'live', 'completed'])
    .order('start_date', { ascending: true })

  const now = new Date()
  const all = (data ?? []) as EventListItem[]
  const upcoming = all.filter((e) => new Date(e.start_date) >= now)
  const past = all.filter((e) => new Date(e.start_date) < now).reverse()

  return (
    <>
      {/* ── 01 · Hero ─────────────────────────────────────────── */}
      <section className="relative h-[78vh] min-h-[540px] w-full overflow-hidden bg-ink">
        <KenBurnsImage
          src={HERO_IMAGE}
          alt="A members' evening"
          motion="in"
          duration={32}
          overlay={0.55}
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-24">
          <Reveal type="up" delay={0}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
              The Calendar
            </p>
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h1 className="display-xl max-w-4xl">Events.</h1>
          </Reveal>
          <Reveal type="up" delay={400}>
            <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.25vw,1.25rem)] leading-[1.7] text-ivory-soft mt-6 max-w-2xl">
              Explore a curated collection of upcoming and past events, each designed to offer a
              unique blend of luxury and networking. From the glamour of high-profile gatherings to
              the intimate settings of exclusive venues, our events page is your portal to the
              extraordinary.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── 02 · Browser (filters + lists) ────────────────────── */}
      <Chapter density="tight" bg="ink">
        <Reveal type="up" delay={0}>
          <EventsBrowser upcoming={upcoming} past={past} />
        </Reveal>
      </Chapter>

      {/* ── 03 · Private Events CTA ───────────────────────────── */}
      <section className="relative overflow-hidden bg-graphite border-t border-graphite-line/40">
        <Aurora variant="dusk" />
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 max-w-[1400px] mx-auto">
          <div className="lg:col-span-6 relative aspect-[4/3] lg:aspect-auto lg:min-h-[520px] overflow-hidden">
            <KenBurnsImage
              src={PRIVATE_EVENTS_IMAGE}
              alt="A private evening"
              motion="out"
              duration={36}
              overlay={0.3}
              className="absolute inset-0"
            />
          </div>

          <div className="lg:col-span-6 flex items-center px-6 py-20 lg:px-16 lg:py-28">
            <div className="max-w-md">
              <Reveal type="up" delay={0}>
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
                  Private Events
                </p>
              </Reveal>
              <Reveal type="clip" delay={150}>
                <h2 className="display-md leading-[1.1]">
                  Host your own <em className="italic text-bronze-light">evening</em>.
                </h2>
              </Reveal>
              <Reveal type="up" delay={350}>
                <p className="mt-8 font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.1875rem)] leading-[1.7] text-ivory-soft">
                  Private dinners, brand showcases, intimate panels — let the team curate an
                  evening to your brief. Our private events service handles venue, guests,
                  catering and choreography end to end.
                </p>
              </Reveal>
              <Reveal type="up" delay={500}>
                <Link
                  href="/private-event-services"
                  className="group relative inline-block mt-10"
                >
                  <span className="block relative px-8 py-3.5 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
                    <span
                      aria-hidden
                      className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover:border-ink/20"
                    />
                    <span
                      aria-hidden
                      className="absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out"
                    />
                    <span className="relative z-10 flex items-center gap-3 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-ivory group-hover:text-ink transition-colors duration-700">
                      Private Event Services
                      <ArrowUpRight
                        size={14}
                        strokeWidth={1.5}
                        className="transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
                      />
                    </span>
                  </span>
                </Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
