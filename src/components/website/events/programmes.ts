import { HARRODS_APPROVED } from '@/components/website/night/london/content'
// The five programmes (+ partner events) the events calendar is organised
// around — Sarah's brief, "Events". Shared by the public /events pages, the
// member portal and the admin event form so labels never drift.
//
// Programme summary copy is VERBATIM from the brief; the table rows are the
// brochure's "Five programmes, one calendar" table.

export const PROGRAMMES = [
  'member_event',
  'round_table',
  'pitch',
  'curated_experience',
  'london_series',
  'partner_event',
] as const

export type Programme = (typeof PROGRAMMES)[number]

export const PROGRAMME_LABELS: Record<Programme, string> = {
  member_event: 'Member Events',
  round_table: 'Round Tables',
  pitch: 'PITCH',
  curated_experience: 'Curated Experiences',
  london_series: 'London Series at Harrods',
  partner_event: 'Partner Events',
}

/** Singular label for a card tag / badge. */
export const PROGRAMME_TAG: Record<Programme, string> = {
  member_event: 'Member Event',
  round_table: 'Round Table',
  pitch: 'PITCH',
  curated_experience: 'Curated Experience',
  london_series: 'London Series',
  partner_event: 'Partner Event',
}

export function isProgramme(v: unknown): v is Programme {
  return typeof v === 'string' && (PROGRAMMES as readonly string[]).includes(v)
}

/** Public filter chips, in the brief's order. Partner events show under All. */
export const PROGRAMME_FILTERS: { value: 'all' | Programme; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'member_event', label: 'Member Events' },
  { value: 'round_table', label: 'Round Tables' },
  { value: 'pitch', label: 'PITCH' },
  { value: 'curated_experience', label: 'Curated Experiences' },
  { value: 'london_series', label: 'London Series at Harrods' },
]

/** Brochure table — programme, frequency, where, who. */
export const PROGRAMME_TABLE: {
  programme: Programme
  label: string
  frequency: string
  where: string
  who: string
}[] = [
  {
    programme: 'member_event',
    label: 'Member Events',
    frequency: '6 a year',
    where: 'Manchester, London, Yorkshire, Lake District',
    who: '40–100 founders, investors and advisors',
  },
  {
    programme: 'round_table',
    label: 'Round Tables',
    frequency: '12 a year',
    where: 'Leeds, Cheshire & Manchester, London',
    who: '15–20 guests per table',
  },
  {
    programme: 'pitch',
    label: 'PITCH',
    frequency: 'Up to 6 a year',
    where: 'Manchester and London, including Co-op Live',
    who: '40–60 founders, VCs and angel investors',
  },
  {
    programme: 'curated_experience',
    label: 'Curated Experiences',
    frequency: '8 a year',
    where: 'St Moritz, Monaco, Miami, Dubai, Austria, Scotland, Isle of Man, Yorkshire',
    who: 'UHNW guests and luxury brands',
  },
  {
    programme: 'london_series',
    label: 'London Series at Harrods',
    frequency: '6 a year',
    where: 'Harrods rooftop, Knightsbridge',
    who: 'UHNW clients, luxury brands, sponsors and Harrods VIPs',
  },
]

/** Programme summary band shown above the cards when a filter is active. */
export interface ProgrammeSummary {
  headline: string
  lines: string[]
  /** Price / access line, e.g. "Members included · Guests £500 + VAT". */
  terms?: string
  link?: { href: string; label: string }
}

export const PROGRAMME_SUMMARIES: Partial<Record<Programme, ProgrammeSummary>> = {
  member_event: {
    headline: 'Member Events',
    lines: ['6 a year, 40–100 guests.'],
    terms: 'Members included · Guests £500 + VAT · Sponsorship from £9,000 + VAT.',
  },
  round_table: {
    headline: 'Round Tables',
    lines: [
      '12 a year, 15–20 guests, one theme each.',
      'Themes: AI and the future of business · Serving the UHNW market through relationships · Building valuable, scalable businesses.',
    ],
    terms: 'Members included · Guests £500 + VAT · Hosted table £5,000 + VAT.',
  },
  pitch: {
    headline: 'PITCH',
    lines: ['Up to 6 a year.'],
    terms: 'Members included · Guests £500 + VAT.',
    link: { href: '/pitch', label: 'Discover PITCH' },
  },
  curated_experience: {
    headline: 'Curated Experiences',
    lines: ['Ski, Tennis, Golf, Grand Prix, Polo, Shooting, Retreats.'],
  },
  london_series: {
    headline: 'London Series at Harrods',
    lines: ['On the Harrods Helideck.'],
    terms: 'Members · Guests by invitation.',
    ...(HARRODS_APPROVED ? { link: { href: '/london-series', label: 'Discover the London Series' } } : {}),
  },
}

/** Brochure copy for the Curated Experiences programme (public view). */
export const CURATED_INTRO = {
  title: 'Eight sporting and cultural moments a year',
  body: 'From the Monaco Grand Prix and golf at Gleneagles to driving retreats and charity galas. Collection, private travel, transfers and concierge are handled end to end, so the experience begins at the guest’s front door.',
  disciplines: ['Ski', 'Tennis', 'Golf', 'Retreat', 'Grand Prix', 'Padel', 'Shooting', 'Polo'],
  // Past highlights named in the brochure / brief (no dates — Portfolio
  // carries the case studies).
  highlights: ['The Monaco Grand Prix', 'Golf at Gleneagles', 'The Swinton Estate shoot'],
}

export const LOCKED_LINE = 'Members see the full programme — sign in or apply'

export const BOOKING_STATUS_LABELS: Record<string, string | null> = {
  open: null,
  waitlist: 'Waitlist',
  invitation_only: 'Invitation only',
  sold_out: 'Sold out',
}

// Member place allowance by tier (brief, "Members-only areas" → Event
// booking). tier_1/2/3 are the DB tiers; names follow the brief's tiers.
export const TIER_ALLOWANCE: Record<string, { tier: string; allowance: string }> = {
  tier_1: { tier: 'Access', allowance: '1 event included on Access' },
  tier_2: { tier: 'The Club Membership', allowance: '2 places per event on The Club Membership' },
  tier_3: { tier: 'Business', allowance: '4 places per event on Business' },
}
