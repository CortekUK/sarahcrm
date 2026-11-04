import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { PillLink } from '@/components/website/forms/SiteButton'
import {
  FormPanel,
  NightHero,
  SectionHead,
  StatGrid,
  TierCards,
  ledeClass,
} from '@/components/website/night/partner/blocks'
import { VenuePartnershipForm } from '@/components/website/night/partner/PartnerForms'
import {
  HOSPITALITY_PUBLIC,
  VENUE_RESULTS,
  VENUE_TIERS,
  VENUE_TIERS_NOTE,
} from '@/components/website/night/partner/content'
import { cn } from '@/lib/utils'

// /partner/venues — Hospitality partnership (brochure "Working With Us").
// Behind HOSPITALITY_PUBLIC while Sarah decides whether it stays public.

const DESCRIPTION =
  'The right guests, not more footfall. A hospitality partnership with The Club for hotels, restaurants and venues.'

export const metadata: Metadata = {
  title: 'Hospitality partnership | Partner With Us | The Club',
  description: DESCRIPTION,
  alternates: { canonical: '/partner/venues' },
  openGraph: { title: 'Hospitality partnership | The Club by Sarah Restrick', description: DESCRIPTION },
  ...(HOSPITALITY_PUBLIC ? {} : { robots: { index: false, follow: false } }),
}

export default function VenuesPage() {
  if (!HOSPITALITY_PUBLIC) notFound()
  return (
    <>
      <NightHero
        image="https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/partner/venues-hero-dining-room.jpg"
        alt="A private dining room laid for a dinner by The Club"
        eyebrow="Hospitality partnership · for hotels, restaurants and venues"
        title="The right guests, not more footfall."
        lede="Venues need guests who book private dining, host corporate events and return with their own clients. The Club brings those guests to you, with a strategy to keep them."
      >
        <PillLink href="#enquire">Enquire</PillLink>
      </NightHero>

      <Chapter density="tight" bg="ink">
        <SectionHead eyebrow="Hospitality results" title="Proven in the room." />
        <StatGrid items={VENUE_RESULTS} />
        <Reveal type="up" delay={150}>
          <figure className="mt-14 max-w-3xl">
            <blockquote className={cn(ledeClass)}>
              “Britain now has 14.2% fewer licensed venues than in March 2020.”
            </blockquote>
            <figcaption className="mt-3 text-[12.5px] text-slate-haze">
              CGA by NIQ Hospitality Market Monitor, September 2025
            </figcaption>
          </figure>
        </Reveal>
      </Chapter>

      <Chapter density="default" bg="graphite">
        <SectionHead
          eyebrow="Packages"
          title="Your venue. Our people."
          lede="Venues that prospect through events need the right people in the room. The Club has them, with a proven record of events that deliver commercial results."
        />
        <TierCards tiers={VENUE_TIERS} footnote={VENUE_TIERS_NOTE} />
      </Chapter>

      <Chapter density="default" bg="ink" id="enquire" className="scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <FormPanel id="venue-enquiry" eyebrow="Hospitality partnership" title="Tell us about your venue.">
            <VenuePartnershipForm />
          </FormPanel>
        </div>
      </Chapter>
    </>
  )
}
