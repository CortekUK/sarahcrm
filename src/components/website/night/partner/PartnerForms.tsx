'use client'

import { SiteForm, type FieldDef } from '@/components/website/forms/SiteForm'

// Partner With Us forms. All → events@ via /api/enquiries/intake.

const PROGRAMMES = [
  'Round Table',
  'Member Event',
  'Curated Experience',
  'PITCH',
  'London Series at Harrods',
  'Annual partnership',
  'Bespoke to our brief',
]

export function SponsorshipForm({ eventTitle, eventSlug }: { eventTitle?: string; eventSlug?: string }) {
  const options = eventTitle ? [eventTitle, ...PROGRAMMES] : PROGRAMMES
  const fields: FieldDef[] = [
    { type: 'text', name: 'company', label: 'Company', required: true, half: true },
    { type: 'text', name: 'position', label: 'Your role', half: true },
    { type: 'select', name: 'programme_or_event', label: 'Programme or event', required: true, options },
    {
      type: 'select',
      name: 'budget_band',
      label: 'Budget band',
      required: true,
      hint: 'All prices + VAT.',
      options: ['£5,000 to £10,000', '£10,000 to £25,000', '£25,000 to £50,000', '£50,000 to £100,000', '£100,000+'],
    },
    {
      type: 'textarea',
      name: 'objectives',
      label: 'Your objectives',
      required: true,
      rows: 4,
      placeholder: 'Who you want to reach, and what a great result looks like.',
    },
  ]
  return (
    <SiteForm
      source="Web – Sponsorship"
      fields={fields}
      context={eventSlug ? { event_slug: eventSlug } : undefined}
      initialValues={eventTitle ? { programme_or_event: eventTitle } : undefined}
      submitLabel="Send enquiry"
      thankYou={{
        title: 'Your enquiry has reached the events team.',
        nextStep: { text: 'See where your brand could be next.', label: 'The events calendar', href: '/events' },
      }}
    />
  )
}

export function VenuePartnershipForm() {
  const fields: FieldDef[] = [
    { type: 'text', name: 'company', label: 'Venue name', required: true, half: true },
    { type: 'text', name: 'location', label: 'Location', required: true, half: true },
    { type: 'text', name: 'capacity', label: 'Capacity', half: true, placeholder: 'Seated / standing' },
    { type: 'text', name: 'position', label: 'Your role', half: true },
    {
      type: 'choice',
      name: 'interest',
      label: 'Interested in',
      required: true,
      multiple: true,
      columns: 2,
      options: ['Tier One · Hosting', 'Tier Two · Retainer'],
    },
    { type: 'textarea', name: 'message', label: 'Message', rows: 3 },
  ]
  return (
    <SiteForm
      source="Web – Sponsorship"
      context={{ request: 'Hospitality partnership' }}
      fields={fields}
      submitLabel="Send enquiry"
      thankYou={{
        title: 'Your enquiry has reached us.',
        nextStep: { label: 'Our Portfolio', href: '/portfolio' },
      }}
    />
  )
}
