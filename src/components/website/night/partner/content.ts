// Partner With Us — copy from the brochure (Services, Working With Us).

/**
 * Sarah hasn't decided whether the Hospitality partnership (venue Tier One /
 * Tier Two) stays on the public site. true → /partner/venues is live and
 * linked from the hub; false → the route 404s and the hub link disappears.
 */
export const HOSPITALITY_PUBLIC = true

/** Hub intro copy — to be supplied by Sarah. Empty → hidden. */
export const PARTNER_INTRO = ''

export const SPONSOR_OPTIONS = [
  { n: '01', title: 'Member Series' },
  { n: '02', title: 'Round Table Lunches & Dinners' },
  { n: '03', title: 'London × Harrods Series' },
  { n: '04', title: 'Curated Experiences' },
  { n: '05', title: 'Overseas Events' },
  { n: '06', title: 'Bespoke to your brief' },
]

export const PACKAGE_INCLUDES = [
  'Introductions on the night',
  'Profiled follow-up with relevant guests',
  'Event content for your own channels',
]

export const SPONSOR_TABLE = {
  head: ['Opportunity', 'Guests', 'Investment', 'Detail'],
  rows: [
    ['Round Table', '15–20', '£5,000', 'Your own table and guest list'],
    ['Member Event', '40–100', '£9,000', 'CEO Burnout, Founder’s Focus, Brand & Influence, The Deal Table'],
    ['Curated Experience', '70–100', '£9k–£50k', 'For example, the Swinton Estate shoot'],
    ['PITCH headline', '40–60', '£25,000', 'Founders, VCs and angels, plus the PITCH podcast'],
    ['Inspire at Harrods', '70–100', '£25k–£100k', 'The year-end rooftop lunch'],
    ['London Series activation', '60–100', '£25k–£100k', 'Harrods Helideck, by invitation only'],
    ['Annual partnership', 'All events', 'From £50,000', 'Bespoke to your brand: activation, marketing and PR across the year'],
  ],
  note: 'All prices + VAT. Sponsorship is agreed separately from membership. Harrods activations are subject to Harrods approval.',
}

export const ANNUAL_PILLARS = [
  { title: 'Marketing', body: 'CRM, social, web app and the PITCH podcast' },
  { title: 'Events', body: 'Headline status and bespoke activations' },
  { title: 'PR & content', body: 'Press, photography and film from every activation' },
  // Brochure: "…plus UHNW and family office referrals" — family offices are
  // never singled out on the site (copy rules).
  { title: 'Introductions', body: 'Up to ten a month, plus UHNW referrals' },
]

export const ANNUAL_CASES = [
  ['Global retail brand', '£50k', '30 UHNW clients, c.£80k spend to date'],
  ['Payroll brokerage', '£70k', '£500k in new business'],
  ['Construction company', '£70k', '£500k investment raised'],
  ['Property developer', '£50k', '£3m in business'],
  ['Property sourcing', '£100k', '£1.5m in business'],
  ['Five-star Scottish resort', 'c.£120k by The Club', '130 guests, c.£1.5m spent in three days'],
]

export const SEEN_BY = [
  {
    title: 'Marketing',
    body: 'Founder’s letters, dedicated email campaigns, the Members’ Forum and web app. Contact data is never handed over.',
  },
  { title: 'PR', body: 'Coverage in Manchester Evening News, Cheshire Life and The Cheshire Magazine.' },
  { title: 'Content', body: 'Photography and film from every event, the PITCH podcast and social amplification.' },
  { title: 'Partnerships', body: 'Pairing with complementary brands to co-host and share audiences.' },
]

// ── Hospitality partnership (/partner/venues) ────────────────────────
export const VENUE_RESULTS = [
  {
    figure: '£20–40k',
    label:
      'Grantley Hall · revenue per event across 10+ events in four years, with 20–100 clients introduced at each alongside partners such as Louis Vuitton and Lamborghini.',
  },
  {
    figure: '£1.5m+',
    label: 'Gleneagles · guest spend in three days, from a £120k investment by The Club in golf, tennis and dining for 130 guests.',
  },
  {
    figure: '200 events',
    label:
      '10 to 300 guests each, from private dining and brand showcases to overseas experiences and exclusive venue hire, delivering new customers, exposure and new event concepts.',
  },
]

export const VENUE_TIERS = [
  {
    name: 'Tier One · Hosting',
    price: '10% commission',
    note: 'You host The Club',
    featured: true,
    items: [
      '12 months’ advertising rights, event included',
      'Invitations across our events calendar',
      'Your venue showcased to our network',
      'Direct access to guests and event data',
      'Promotion through venue-finding services',
    ],
  },
  {
    name: 'Tier Two · Retainer',
    price: 'Per brief',
    note: 'We shape your events programme',
    items: [
      'Guest management and business development',
      'Event curation, sponsors and brand partners',
      'Brand activations, PR and press',
      'People of influence',
      'Consultancy on attracting local customers',
    ],
  },
]
export const VENUE_TIERS_NOTE =
  '10% commission on all referred bookings (Tier One). Tier Two is priced by scope of work, taken alone or alongside Tier One. All prices + VAT.'

// ── Curated Corporate Events (/partner/corporate-events) ─────────────
export const CORPORATE_TYPES = [
  'Corporate parties',
  'Client hospitality',
  'Product & venue launches',
  'Retreats & away days',
  'Awards & galas',
  'Overseas events',
  'Sporting events',
  'Brand activations (showcases, test drives, private shopping)',
]

export const WE_HANDLE = [
  'Venue',
  'Guest list from our database if required',
  'Production',
  'Hospitality',
  'Content',
  'Follow-up',
]
