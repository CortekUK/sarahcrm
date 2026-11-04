import type { FieldDef, FormValues } from '@/components/website/forms/SiteForm'

// The three members-only concierge request types (brief Concierge table),
// shared by the public /concierge page (signed-in members) and the portal
// concierge page. Each submits a concierge_requests row: request_type,
// a readable `description`, the core columns we can map, and every answer
// in form_data.

export const MEMBER_REQUEST_TYPES = ['Access Request', 'Travel Services', 'Retail & Hospitality Bookings'] as const
export type MemberRequestType = (typeof MEMBER_REQUEST_TYPES)[number]

const BUDGETS = ['Under £5,000', '£5,000 to £15,000', '£15,000 to £50,000', '£50,000 to £100,000', '£100,000+', 'Open'] as const

export const REQUEST_FIELDS: Record<MemberRequestType, FieldDef[]> = {
  'Access Request': [
    { type: 'text', name: 'what', label: 'What would you like access to?', required: true, placeholder: 'A table, tickets, a private viewing, an introduction…' },
    { type: 'text', name: 'where', label: 'Where', half: true },
    { type: 'text', name: 'date', label: 'Date', half: true, placeholder: 'e.g. Sat 14 June' },
    { type: 'number', name: 'guests', label: 'Number of guests', half: true },
    {
      type: 'select',
      name: 'flexibility',
      label: 'Flexibility',
      half: true,
      options: ['Fixed date', 'Flexible by a few days', 'Fully flexible'],
    },
    { type: 'textarea', name: 'notes', label: 'Notes', rows: 3 },
  ],
  'Travel Services': [
    {
      type: 'select',
      name: 'trip_type',
      label: 'Trip type',
      required: true,
      options: ['Private aviation (JET365)', 'Villa', 'Yacht', 'Hotel', 'Chauffeur', 'Bespoke itinerary'],
    },
    { type: 'text', name: 'from', label: 'From', half: true },
    { type: 'text', name: 'to', label: 'To', half: true, required: true },
    { type: 'text', name: 'dates', label: 'Dates', half: true, required: true },
    { type: 'number', name: 'passengers', label: 'Passengers', half: true },
    { type: 'text', name: 'preference', label: 'Aircraft or accommodation preference' },
    { type: 'select', name: 'budget_range', label: 'Budget range', options: BUDGETS },
    { type: 'textarea', name: 'notes', label: 'Notes', rows: 3 },
  ],
  'Retail & Hospitality Bookings': [
    {
      type: 'select',
      name: 'category',
      label: 'Category',
      required: true,
      options: [
        'Personal shopping or private appointment',
        'Watches',
        'Jewellery',
        'Art',
        'Cars',
        'Restaurant booking',
        'Hotel booking',
        'Other',
      ],
    },
    { type: 'text', name: 'brand_or_venue', label: 'Brand or venue', half: true },
    { type: 'text', name: 'date', label: 'Date', half: true },
    { type: 'textarea', name: 'detail', label: 'Item or booking detail', required: true, rows: 3 },
    { type: 'select', name: 'budget_range', label: 'Budget range', half: true, options: BUDGETS },
    {
      type: 'select',
      name: 'delivery',
      label: 'Delivery or collection',
      half: true,
      options: ['Delivery', 'Collection', 'Not applicable'],
    },
    { type: 'textarea', name: 'notes', label: 'Notes', rows: 3 },
  ],
}

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function int(v: unknown): number | null {
  const n = parseInt(s(v), 10)
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : null
}

/** Build the concierge_requests insert (minus member_id) from answers. */
export function buildConciergeRow(type: MemberRequestType, values: FormValues) {
  const fields = REQUEST_FIELDS[type]
  const formData: Record<string, string> = {}
  const lines: string[] = []
  for (const f of fields) {
    if (f.type === 'heading' || f.type === 'note') continue
    const v = s(values[f.name])
    if (!v) continue
    formData[f.name] = v.slice(0, 2000)
    lines.push(`${f.label.replace(/\?$/, '')}: ${v}`)
  }
  const description = lines.join('\n').slice(0, 5000)
  const location =
    type === 'Access Request'
      ? s(values.where)
      : type === 'Travel Services'
        ? [s(values.from), s(values.to)].filter(Boolean).join(' → ')
        : s(values.brand_or_venue)
  const dates = type === 'Travel Services' ? s(values.dates) : s(values.date)
  const guests = type === 'Access Request' ? int(values.guests) : type === 'Travel Services' ? int(values.passengers) : null
  return {
    request_type: type,
    description,
    event_name: type === 'Access Request' ? s(values.what).slice(0, 300) || null : null,
    location: location.slice(0, 300) || null,
    dates: dates.slice(0, 300) || null,
    guests,
    form_data: formData,
    status: 'pending' as const,
  }
}

/** Member-facing status labels (brief: New / In progress / Quoted / Confirmed / Completed). */
export const MEMBER_STATUS: Record<string, string> = {
  pending: 'New',
  assigned: 'In progress',
  sourcing: 'In progress',
  quoted: 'Quoted',
  accepted: 'Confirmed',
  booked: 'Confirmed',
  delivered: 'Completed',
  feedback: 'Completed',
  declined: 'Closed',
  cancelled: 'Closed',
}

export function memberStatusLabel(status: string): string {
  return Object.prototype.hasOwnProperty.call(MEMBER_STATUS, status) ? MEMBER_STATUS[status] : 'In progress'
}
