'use client'

import { supabase } from '@/lib/supabase/client'
import { SiteForm, type FieldDef, type FormValues } from '@/components/website/forms/SiteForm'
import { buildConciergeRow, REQUEST_FIELDS, type MemberRequestType } from './requestTypes'

// ── Event Services (public) — Concierge → Event Services and
//    /partner/corporate-events (corporate pre-selected). Files as
//    'Web – Event Request (Private|Corporate)' → events@.

const PRIVATE_TYPES = ['Celebration', 'Birthday', 'Anniversary', 'Private dinner', 'Retreat', 'Other'] as const
const CORPORATE_TYPES = [
  'Corporate party',
  'Client hospitality',
  'Product or venue launch',
  'Awards or gala',
  'Retreat or away day',
  'Overseas event',
  'Sporting event',
  'Brand activation',
  'Other',
] as const

const isCorporate = (v: FormValues) => v.kind === 'Corporate'

const EVENT_FIELDS: FieldDef[] = [
  { type: 'toggle', name: 'kind', label: 'Private or corporate', required: true, options: ['Private', 'Corporate'] },
  { type: 'text', name: 'company', label: 'Company name', required: true, showIf: isCorporate },
  {
    type: 'select',
    name: 'event_type_private',
    label: 'Event type',
    required: true,
    options: PRIVATE_TYPES,
    showIf: (v) => !isCorporate(v),
  },
  {
    type: 'select',
    name: 'event_type_corporate',
    label: 'Event type',
    required: true,
    options: CORPORATE_TYPES,
    showIf: isCorporate,
  },
  { type: 'text', name: 'preferred_date', label: 'Preferred date or window', required: true, half: true, placeholder: 'e.g. Late June 2027' },
  { type: 'text', name: 'location', label: 'Location', half: true, placeholder: 'City, venue or “open”' },
  { type: 'number', name: 'guest_numbers', label: 'Guest numbers', required: true, half: true },
  {
    type: 'select',
    name: 'budget_range',
    label: 'Budget range',
    half: true,
    options: ['Under £10,000', '£10,000 to £25,000', '£25,000 to £50,000', '£50,000 to £100,000', '£100,000+'],
  },
  {
    type: 'toggle',
    name: 'guest_list_needed',
    label: 'Guest list from The Club needed?',
    options: ['Yes', 'No'],
  },
  { type: 'textarea', name: 'brief', label: 'Your brief', required: true, rows: 5, placeholder: 'The occasion, the feeling you want, anything we should know.' },
  { type: 'text', name: 'membership_number', label: 'The Club membership number (if a member)', half: true },
  { type: 'text', name: 'heard_about', label: 'How did you hear about us?', half: true },
]

export function EventServicesForm({ corporate = false }: { corporate?: boolean }) {
  return (
    <SiteForm
      resolveSource={(v) => (isCorporate(v) ? 'Web – Event Request (Corporate)' : 'Web – Event Request (Private)')}
      fields={EVENT_FIELDS}
      initialValues={{ kind: corporate ? 'Corporate' : 'Private', guest_list_needed: 'No' }}
      phoneRequired
      submitLabel="Send the brief"
      thankYou={{
        title: 'Your brief has reached the events team.',
        nextStep: { text: 'See the kind of events we deliver.', label: 'Portfolio', href: '/portfolio' },
      }}
    />
  )
}

// ── Members-only requests (Access / Travel / Bookings) ───────────────
// Signed-in members only — inserts straight into concierge_requests with
// the browser client (RLS + the insert guard check the member is active).

export async function insertConciergeRequest(
  memberId: string,
  type: MemberRequestType,
  values: FormValues,
): Promise<{ ok: boolean; error?: string }> {
  const row = buildConciergeRow(type, values)
  let { error } = await supabase.from('concierge_requests').insert({ member_id: memberId, ...row })
  // Deploy-order safety net: form_data column not migrated yet.
  if (error && (error.code === 'PGRST204' || error.code === '42703')) {
    const { form_data: _omit, ...rest } = row
    void _omit
    ;({ error } = await supabase.from('concierge_requests').insert({ member_id: memberId, ...rest }))
  }
  if (error) {
    const msg = error.message ?? ''
    const m = msg.match(/REQUEST_[A-Z_]+:\s*(.*)$/)
    return { ok: false, error: m ? m[1] : 'We could not send your request. Please try again.' }
  }
  return { ok: true }
}

export function MemberRequestForm({ type, memberId }: { type: MemberRequestType; memberId: string }) {
  return (
    <SiteForm
      key={type}
      hideContact
      fields={REQUEST_FIELDS[type]}
      submitLabel="Send request"
      submit={async (p) => insertConciergeRequest(memberId, type, p.form_data as FormValues)}
      thankYou={{
        title: 'Your request has reached the concierge team.',
        body: 'You’ll receive a quote or confirmation personally. Follow its status under My requests.',
        nextStep: { label: 'My requests', href: '/portal/concierge' },
      }}
    />
  )
}
