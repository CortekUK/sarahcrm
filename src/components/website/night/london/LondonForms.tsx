'use client'

import { SiteForm, type FieldDef } from '@/components/website/forms/SiteForm'

// London Series forms — partnership enquiry and request an invitation.
// Both file as 'Web – Harrods' → events@ (form_data.request tells them
// apart). `events` = the series event titles from the events table.

const NOT_SURE = 'Not sure yet'

export function LondonPartnerForm({ events, initialEvent }: { events: string[]; initialEvent?: string }) {
  const fields: FieldDef[] = [
    { type: 'text', name: 'company', label: 'Company', required: true, half: true },
    { type: 'text', name: 'position', label: 'Your role', half: true },
    {
      type: 'select',
      name: 'event',
      label: 'Event',
      options: [...events, 'The full series', NOT_SURE],
    },
    {
      type: 'choice',
      name: 'tier',
      label: 'Tier',
      required: true,
      columns: 2,
      options: ['Headline Partner', 'Co-Partner', 'Supporting Partner', 'Series Partnership', 'A curated Harrods campaign'],
    },
    {
      type: 'textarea',
      name: 'guest_profile',
      label: 'Who you’d like in the room',
      rows: 3,
      placeholder: 'Your ideal guest: sector, buying power, interests.',
    },
    { type: 'textarea', name: 'message', label: 'Message', rows: 3 },
  ]
  return (
    <SiteForm
      source="Web – Harrods"
      context={{ request: 'Partnership enquiry' }}
      fields={fields}
      initialValues={initialEvent ? { event: initialEvent } : undefined}
      submitLabel="Partner on an event"
      thankYou={{
        title: 'Your enquiry has reached us.',
        body: 'The team will be in touch personally with the full series deck and availability.',
        nextStep: { label: 'All sponsorship', href: '/partner/sponsorship' },
      }}
    />
  )
}

export function LondonInvitationForm({ events, initialEvent }: { events: string[]; initialEvent?: string }) {
  const fields: FieldDef[] = [
    { type: 'text', name: 'company', label: 'Company', half: true },
    { type: 'text', name: 'position', label: 'Your role', half: true },
    {
      type: 'select',
      name: 'event',
      label: 'Event',
      required: true,
      options: [...events, NOT_SURE],
    },
    {
      type: 'select',
      name: 'places',
      label: 'Places requested',
      half: true,
      options: ['1', '2'],
    },
    { type: 'text', name: 'referred_by', label: 'Referred by', half: true },
    {
      type: 'textarea',
      name: 'guest_profile',
      label: 'A little about you',
      required: true,
      rows: 3,
      placeholder: 'Your business, sector and what brings you to the Helideck.',
    },
  ]
  return (
    <SiteForm
      source="Web – Harrods"
      context={{ request: 'Invitation request' }}
      fields={fields}
      initialValues={initialEvent ? { event: initialEvent } : undefined}
      submitLabel="Request an invitation"
      thankYou={{
        title: 'Your request has reached us.',
        body: 'Invitations are by approval. The team will be in touch personally.',
        nextStep: { text: 'In the meantime, explore The Club Membership.', label: 'Memberships', href: '/memberships' },
      }}
    />
  )
}
