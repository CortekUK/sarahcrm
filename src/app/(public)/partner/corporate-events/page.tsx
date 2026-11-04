import type { Metadata } from 'next'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { MetaLink, PillLink } from '@/components/website/forms/SiteButton'
import {
  CardGrid,
  FormPanel,
  NightHero,
  RuleList,
  SectionHead,
} from '@/components/website/night/partner/blocks'
import { caseStudyCards, portfolioSlugs } from '@/components/website/night/partner/caseStudies'
import { CORPORATE_TYPES, WE_HANDLE } from '@/components/website/night/partner/content'
import { EventServicesForm } from '@/components/website/night/concierge/ConciergeForms'

// /partner/corporate-events — Curated Corporate Events. The request form
// is the Concierge → Event Services form with "Corporate" pre-selected.

const DESCRIPTION =
  'For businesses that want The Club to design and run an event for their own clients or team, with or without guests from our network.'

export const metadata: Metadata = {
  title: 'Curated Corporate Events | Partner With Us | The Club',
  description: DESCRIPTION,
  alternates: { canonical: '/partner/corporate-events' },
  openGraph: { title: 'Curated Corporate Events | The Club by Sarah Restrick', description: DESCRIPTION },
}

export const revalidate = 300

export default async function CorporateEventsPage() {
  const supabase = await createClient()
  const slugs = await portfolioSlugs(supabase as unknown as SupabaseClient)

  return (
    <>
      <NightHero
        image="https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/partner/corporate-hero-florals.jpg"
        alt="A candlelit table dressed with florals for a corporate dinner"
        eyebrow="Curated Corporate Events"
        title="Your event, our room."
        lede={DESCRIPTION}
      >
        <PillLink href="#request">Request a corporate event</PillLink>
      </NightHero>

      <Chapter density="tight" bg="ink">
        <SectionHead eyebrow="Event types" title="What we design and run." />
        <CardGrid items={CORPORATE_TYPES.map((t) => ({ title: t }))} cols={4} />
      </Chapter>

      <Chapter density="tight" bg="graphite" className="relative">
        <Aurora variant="soft" />
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5">
            <SectionHead
              eyebrow="What we handle"
              title="End to end."
              lede="Every brief draws on 200 events of experience."
            />
          </div>
          <div className="lg:col-span-7">
            <Reveal type="up" delay={100}>
              <RuleList items={WE_HANDLE} className="sm:columns-2 sm:gap-10 [&>li]:break-inside-avoid [&>li]:mb-3.5" />
            </Reveal>
          </div>
        </div>
      </Chapter>

      <Chapter density="default" bg="ink">
        <SectionHead eyebrow="Proof" title="From our Portfolio." />
        <CardGrid items={caseStudyCards(['hr-owen', 'brand-and-influence', 'gleneagles'], slugs)} cols={3} />
      </Chapter>

      <Chapter density="default" bg="graphite" id="request" className="scroll-mt-20">
        <div className="max-w-4xl">
          <FormPanel id="corporate-request" eyebrow="Corporate event request" title="Tell us about your event.">
            <EventServicesForm corporate />
          </FormPanel>
          <div className="mt-8">
            <MetaLink href="/concierge#event-services">Planning a private celebration? Concierge → Event Services</MetaLink>
          </div>
        </div>
      </Chapter>
    </>
  )
}
