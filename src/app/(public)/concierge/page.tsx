import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { MetaLink, PillLink } from '@/components/website/forms/SiteButton'
import {
  CardGrid,
  FormPanel,
  NightHero,
  bodyClass,
  eyebrowClass,
} from '@/components/website/night/partner/blocks'
import { EventServicesForm, MemberRequestForm } from '@/components/website/night/concierge/ConciergeForms'
import type { MemberRequestType } from '@/components/website/night/concierge/requestTypes'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// /concierge — Private Concierge (brief: "Concierge"). Four areas, each
// with its own section + request form:
//   #event-services  public  → /api/enquiries/intake ('Web – Event Request (Private|Corporate)')
//   #access          The Club Members → concierge_requests 'Access Request'
//   #travel          The Club Members → concierge_requests 'Travel Services'
//   #bookings        The Club Members → concierge_requests 'Retail & Hospitality Bookings'
// Signed-out visitors (or non-active members) see "Sign in or apply"
// instead of the three member forms. Replaces /private-event-services.
// ─────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

/** "Recent requests we've delivered" — Sarah to supply three anonymised examples. Empty → hidden. */
const RECENT_REQUESTS: { title: string; body: string }[] = []

interface Area {
  id: string
  label: string
  title: string
  covers: string
  who: string
  image: string
  imageAlt: string
  memberType?: MemberRequestType
}

const AREAS: Area[] = [
  {
    id: 'event-services',
    label: '01 · Event Services',
    title: 'Private and corporate events.',
    covers:
      'Private: celebrations, birthdays, anniversaries, private dinners, retreats. Corporate: corporate parties, client hospitality, product and venue launches, awards and galas, away days, overseas and sporting events. Venue, guest list from our database if required, production, hospitality, content and follow-up.',
    who: 'Anyone · priced per brief',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/concierge/event-services-dinner.jpg',
    imageAlt: 'A long dinner table under a chandelier, set by The Club',
  },
  {
    id: 'access',
    label: '02 · Access Requests',
    title: 'The hard-to-get, arranged.',
    covers: 'Hard-to-get tables, sporting and cultural events, private viewings, members’ clubs, introductions.',
    who: 'The Club Members',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/concierge/access-evening.jpg',
    imageAlt: 'An evening event hosted by The Club',
    memberType: 'Access Request',
  },
  {
    id: 'travel',
    label: '03 · Travel Services',
    title: 'Private aviation and travel.',
    covers:
      'Private aviation (JET365) and travel with Rhythm & Routes, The Club’s travel partner: villas, yachts, hotels, chauffeur and bespoke itineraries.',
    who: 'The Club Members; UHNW guests by referral',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/concierge/travel-chauffeur.jpg',
    imageAlt: 'A chauffeured car waiting outside a country house hotel',
    memberType: 'Travel Services',
  },
  {
    id: 'bookings',
    label: '04 · Retail & Hospitality Bookings',
    title: 'Shopping, sourcing and the best tables.',
    covers:
      'Personal shopping and private appointments, sourced goods (watches, jewellery, art, cars), restaurant and hotel bookings at member rates.',
    who: 'The Club Members',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/concierge/bookings-retail.jpg',
    imageAlt: 'A supercar outside a festive luxury store front',
    memberType: 'Retail & Hospitality Bookings',
  },
]

async function activeMemberId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('members')
      .select('id, membership_status')
      .eq('profile_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    return data && data.membership_status === 'active' ? data.id : null
  } catch {
    return null
  }
}

function SignInPrompt({ area }: { area: Area }) {
  return (
    <div className="border border-graphite-line/60 bg-graphite/30 day:bg-white day:shadow-sm p-8 sm:p-10">
      <p className={cn(eyebrowClass, 'mb-4')}>For The Club Members</p>
      <p className="font-[family-name:var(--font-display)] text-[1.5rem] leading-snug text-ivory">
        {area.label.replace(/^\d+ · /, '')} are part of The Club Membership.
      </p>
      <p className={cn(bodyClass, 'mt-4')}>
        Sign in to send a request, or apply to join. Concierge access is included in every membership tier.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <PillLink href={`/login?redirect=${encodeURIComponent(`/concierge#${area.id}`)}`} small>
          Sign in
        </PillLink>
        <PillLink href="/membership-application" small>
          Apply
        </PillLink>
      </div>
    </div>
  )
}

export default async function ConciergePage() {
  const memberId = await activeMemberId()

  return (
    <>
      <NightHero
        image="https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/concierge/concierge-hero-st-moritz.jpg"
        alt="Supercars lined up in the snow at St Moritz on a curated experience"
        eyebrow="Private Concierge"
        title="Private Concierge. Ask for anything; we deliver it."
        lede="Collection, private travel, transfers and access for The Club Members and UHNW guests, handled end to end, so the experience begins at the front door."
      >
        <PillLink href="#event-services">Plan an event</PillLink>
        <PillLink href={memberId ? '#access' : '/login?redirect=%2Fconcierge'}>
          {memberId ? 'Make a request' : 'Member sign in'}
        </PillLink>
      </NightHero>

      {/* ── Four areas ───────────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <CardGrid
          cols={4}
          items={AREAS.map((a) => ({
            n: a.label.split(' · ')[0],
            title: a.label.split(' · ')[1],
            body: a.who,
            href: `#${a.id}`,
          }))}
        />
      </Chapter>

      {AREAS.map((area, i) => (
        <Chapter
          key={area.id}
          id={area.id}
          density="default"
          bg={i % 2 === 0 ? 'graphite' : 'ink'}
          className="relative scroll-mt-20"
        >
          {i === 0 && <Aurora variant="soft" />}
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
            <div className="lg:col-span-5">
              <Reveal type="up" delay={0}>
                <p className={cn(eyebrowClass, 'mb-5')}>{area.label}</p>
              </Reveal>
              <Reveal type="clip" delay={120}>
                <h2 className="display-md">{area.title}</h2>
              </Reveal>
              <Reveal type="up" delay={240}>
                <p className={cn(bodyClass, 'mt-6')}>{area.covers}</p>
                <p className="mt-6 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-slate-haze">
                  Who can request · <span className="text-ivory-soft">{area.who}</span>
                </p>
              </Reveal>
              <Reveal type="scale" delay={300}>
                <div className="relative mt-10 aspect-[4/3] overflow-hidden border border-graphite-line/60">
                  <Image src={area.image} alt={area.imageAlt} fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
                </div>
              </Reveal>
            </div>
            <div className="lg:col-span-7">
              {area.memberType ? (
                memberId ? (
                  <FormPanel id={`${area.id}-form`} eyebrow="Your request" title={`${area.label.replace(/^\d+ · /, '')}.`}>
                    <MemberRequestForm type={area.memberType} memberId={memberId} />
                  </FormPanel>
                ) : (
                  <SignInPrompt area={area} />
                )
              ) : (
                <FormPanel
                  id="event-services-form"
                  eyebrow="Event Services"
                  title="Tell us about your event."
                  lede="Private or corporate — the events team will call to talk through your brief."
                >
                  <EventServicesForm />
                </FormPanel>
              )}
            </div>
          </div>
        </Chapter>
      ))}

      {/* ── Recent requests (Sarah to supply) ───────────────── */}
      {RECENT_REQUESTS.length > 0 && (
        <Chapter density="tight" bg="ink">
          <p className={cn(eyebrowClass, 'mb-8')}>Recent requests we’ve delivered</p>
          <CardGrid items={RECENT_REQUESTS} cols={3} />
        </Chapter>
      )}

      <section className="bg-graphite border-t border-graphite-line/40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-14 flex flex-col md:flex-row md:items-center gap-6 md:justify-between">
          <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.05rem,1.4vw,1.3rem)] text-ivory-soft">
            Concierge access is included in every membership tier.
          </p>
          <div className="flex flex-wrap gap-6">
            {memberId && <MetaLink href="/portal/concierge">My requests</MetaLink>}
            <MetaLink href="/memberships">Memberships</MetaLink>
          </div>
        </div>
      </section>
    </>
  )
}
