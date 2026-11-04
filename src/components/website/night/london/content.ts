// London Series at Harrods — The Helideck Series. Copy from The Harrods
// London Series deck (verbatim where the brief quotes it).

/**
 * Harrods approval (brief: "Every use of the Harrods name, logo,
 * photography and data needs Harrods' approval before launch").
 *
 * false (now):
 *   • /london-series and /london-series/[slug] render with robots noindex
 *     and are left out of nav / footer / sitemap (site-wide agent).
 *   • No Harrods photography (neutral The Club photography instead), and
 *     the Harrods client data, campaign channel price ranges and
 *     third-party brand results sections are not rendered at all.
 * true: indexable, Helideck photography on, data sections on.
 */
export const HARRODS_APPROVED = false

export const LONDON_TITLE = 'The Club | London at Harrods — The Helideck Series'
export const LONDON_HERO =
  'Six private events on the Harrods Helideck, and a curated route into Harrods’ own channels, for brands that serve the UHNW world.'

export const NEUTRAL_HERO = 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/london-series/london-series-neutral-hero.jpg'
export const HELIDECK_HERO = 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/london-series/harrods/helideck-hero.jpg'

export const WAYS_IN = [
  {
    n: '01',
    title: 'Sponsor a Helideck event',
    body: 'Put your brand at the centre of one of six private rooftop events, in front of The Club’s network and Harrods VIPs, with your message carried directly to Harrods clients by email and SMS.',
  },
  {
    n: '02',
    title: 'A curated Harrods campaign',
    body: 'We design and manage a campaign across Harrods’ own channels: windows, screens, magazines, social, CRM and taxis. One relationship, handled end to end by The Club.',
  },
]

export const BUILT_FOR =
  'Built for brands servicing HNW and UHNW clients: luxury goods, services and experiences, private travel, concierge, automotive, property, investment, wealth management and private banking, law, insurance and other professional services.'

export const VENUE_COPY =
  'A private, fully licensed rooftop above Knightsbridge, between the Harrods dome and chimney, delivered alongside the Harrods London team.'

export const VENUE_FACTS = [
  { figure: '80', label: 'seated' },
  { figure: '120', label: 'up to 120 roaming' },
  { figure: '180', label: 'sqm, open-air deck and enclosed pavilion' },
  { figure: '360°', label: 'views, from the Shard and London Eye to Battersea' },
  { figure: 'Invitation', label: 'only — food, drink and live music permitted' },
]

export const WHO_IN_ROOM = [
  {
    title: 'Harrods VIPs',
    body: 'Private clients invited by Harrods for each event’s theme, among the highest-spending customers of the world’s most famous department store.',
  },
  {
    title: 'The Club network',
    body: 'Founders, business owners, HNW and UHNW individuals, luxury brands, professional services and C-suite decision makers across the North West and London.',
  },
  {
    title: 'Your guests',
    body: 'Your own clients and prospects, hosted by you in a setting that does the persuading for you.',
  },
]
export const WHO_IN_ROOM_LINE =
  'Every guest list is built by role and buying power, and every introduction is made in person, then followed up by The Club.'

export const BLUEPRINT = [
  {
    n: '01',
    title: 'Venue & Production',
    body: 'End-to-end event services for design, negotiation, implementation, delivery and results. Every detail curated and serviced by The Club.',
  },
  {
    n: '02',
    title: 'Curated Audience',
    body: 'Guest lists built directly with the Harrods Private Shopping and Partnerships teams, and chosen from The Club’s network and press and media contacts: the best possible room of direct prospects, and an experience for your existing clients.',
  },
  {
    n: '03',
    title: 'Every detail delivered',
    body: 'Hosting, guest management, introductions, follow-up, customer service and content capture, all handled by The Club.',
  },
  {
    n: '04',
    title: 'ROI converted',
    body: 'A proven track record, from The Club and Harrods, of converting revenue, new clients, media reach and partnerships for brands through activations, events and advertising.',
  },
]

export const BRANDS_CONVERTED =
  'Ralph Lauren · HR Owen: Lamborghini, Lotus, Maserati & Bentley · Boodles · Powells Jewellery · Baresi & Caine · Together Money · Myerson Solicitors · Harvey Nichols · Black Label Supply · Levare Aviation · Louis Vuitton · Holt Living · The Commerce Group · Arighi Bianchi · Elite Pre Loved · CJE Official · Zouga & Wolf · Parced IO'

export const COMPARISON = {
  head: ['', 'Building the event from scratch', 'Headline Partner with The Club'],
  rows: [
    ['Cost', 'Venue hire, every supplier, contingency and your team’s time', 'One partnership fee, on a series rate negotiated by The Club'],
    ['Logistics', 'Harrods approvals, access, licensing and production to manage', 'Managed, negotiated and delivered by The Club'],
    ['Your team', 'Heavy demand on marketing, events and client teams', 'Your team focuses on your clients and your brand moment'],
    ['Audience', 'Find every prospect yourself, and look after your own clients', 'A new audience curated with Harrods, alongside your own clients'],
    ['Harrods reach', 'Harrods CRM and channels bought separately', 'A Harrods CRM email and SMS feature included'],
    ['Results', 'Measured on your own', 'Introductions followed up and results reported by The Club'],
  ],
  line: 'The result: a Harrods event with the audience, delivery and follow-up already in place, for one fee and a fraction of the work.',
}

export const TIERS = [
  {
    name: 'Headline Partner',
    price: '£100,000 + VAT',
    note: 'One per event',
    featured: true,
    items: [
      'Event presented as The Club × your brand',
      'Category exclusivity',
      'A hosted moment in the programme',
      '10 guest places for your clients',
      'Dedicated feature in the Harrods CRM email and SMS',
      'Photography and film for your channels',
    ],
  },
  {
    name: 'Co-Partner',
    price: '£50,000 + VAT',
    note: 'Up to two per event',
    items: [
      'Co-branding and an activation space',
      '4 guest places for your clients',
      'Featured in the Harrods CRM email and SMS',
      'Event content for your channels',
    ],
  },
  {
    name: 'Supporting Partner',
    price: '£25,000 + VAT',
    note: 'Up to three per event',
    items: [
      'A branded touchpoint: gifting, tasting or showcase',
      '2 guest places for your clients',
      'Named in the Harrods CRM email and SMS',
    ],
  },
]
export const TIERS_FOOTNOTE =
  'Every partner receives direct introductions to the Harrods VIPs and guests in the room. Series Partnership (price on application): headline all six events, with Harrods advertising and a 12-month strategy included. For single-event partners, Harrods advertising is available on top.'

// ── Harrods data — rendered ONLY when HARRODS_APPROVED ───────────────
export const HARRODS_CLIENT_STATS = [
  { figure: '£2.4k', label: 'Average spend per Harrods customer' },
  { figure: '75%', label: 'Of Harrods customers spend £10k+ a year, and 35% spend £100k+' },
  { figure: '12.2m', label: 'Visits to Harrods Knightsbridge in 2025' },
  { figure: '2m+', label: 'Harrods Rewards card members' },
]
export const HARRODS_CLIENT_SOURCE =
  'Source: Harrods Insight FY24–FY25 and Harrods footfall analysis, January–December 2025.'

export const HARRODS_CHANNELS = [
  ['Store windows and pop-up spaces', 'One month', '£34,500 – £181,000'],
  ['Window vinyl takeovers', '6–8 days', '£25,500 – £40,500'],
  ['In-store digital screen networks', '14–28 days', '£2,500 – £23,500'],
  ['Exterior screens and digital windows', '14–28 days', '£7,000 – £124,500'],
  ['Full digital network takeover', '2–3 days', '£98,000 – £121,000'],
  ['West Turret landmark billboard', 'Two weeks', 'From £287,500'],
  ['Harrods Magazine and Harrods Home', 'Per issue', '£8,500 – £61,000'],
  ['Paid social across Meta and TikTok', 'Two weeks', '£11,500 – £46,000'],
  ['YouTube, offsite banners and Locala', '4–6 weeks', '£23,000 – £34,500'],
  ['Taxi takeovers (ten taxis or more)', '1–2 months', '£14,000 – £49,500'],
  ['CRM brand mailers, SMS and push', 'Per send', '£11,500 – £34,500'],
  ['Events at Harrods, tube stations, bespoke', 'Tailored', 'On application'],
]
export const HARRODS_CHANNELS_NOTE =
  'Indicative ranges including The Club’s campaign management, excluding VAT. Final pricing is confirmed per campaign; all placements are subject to Harrods approval and availability.'

export const HARRODS_RESULTS = [
  { figure: '+349%', label: 'Swarovski trade uplift vs previous period' },
  { figure: '+490%', label: 'The Macallan Knightsbridge trade vs previous year' },
  { figure: '+137%', label: 'Loro Piana trade uplift vs 2023' },
  { figure: '800', label: 'Leads for Red Sea Global in one campaign' },
]
export const HARRODS_RESULTS_NOTE =
  'Source: Harrods partnership case studies. Results are the named brands’ own and illustrate each channel.'

// ── Per-event detail (deck pages 13–24), matched by title keyword ────
export interface SeriesEventDetail {
  match: string
  tagline: string
  intro: string
  format: string
  image: string
  runningOrder: [string, string][]
  roomHeadline: string
  mix: [string, number][]
  profile: [string, string][]
  sectors: [string, string][]
}

const MIX_NOTE = 'Guest mix is indicative and agreed with each partner and Harrods before invitations go out.'
export const GUEST_MIX_NOTE = MIX_NOTE

export const SERIES_DETAILS: SeriesEventDetail[] = [
  {
    match: 'private shopping edit',
    tagline: 'The festive edit, with a private route through Harrods.',
    intro:
      'Harrods at its most spectacular in December. Guests are guided by personal stylists to the right departments, then gather for dinner on the roof just as gifting season peaks.',
    format: 'Private shopping and dinner · 80 seated · 7pm – 11pm',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/london-series/harrods/private-shopping-edit.jpg',
    runningOrder: [
      ['7.00pm', 'Welcome in-store and introductions to personal stylists'],
      ['7.30pm', 'Private appointments: fashion, jewellery, watches and beauty'],
      ['8.30pm', 'Champagne on the Helideck above festive London'],
      ['9.00pm', 'Candlelit dinner and a short conversation on gifting and collecting'],
      ['10.15pm', 'Partner showcase, gifting and introductions'],
      ['11.00pm', 'Close'],
    ],
    roomHeadline: 'Ready to buy: gifting, occasion wear and self-reward',
    mix: [
      ['Harrods VIPs', 40],
      ['The Club', 40],
      ['Partner guests', 20],
    ],
    profile: [
      ['Who', 'UHNW women and men buying for themselves and to gift, Harrods VIPs and Rewards clients and The Club Members'],
      ['Age', 'Mostly 30–60'],
      ['Wealth', 'High discretionary spend; Harrods clients typically spending £10k+ a year'],
      ['From', 'London and international Harrods clients, with The Club Members in the North'],
    ],
    sectors: [
      ['Luxury fashion and accessories', 'Guests are in buying mode, with stylists alongside'],
      ['Fine jewellery and watches', 'The peak moment for significant gifts'],
      ['Beauty and fragrance', 'Gifting and self-reward in one room'],
      ['Luxury gifting and homeware', 'Hosting season is weeks away'],
      ['Premium cards and private banking', 'Sits naturally beside the purchase'],
      ['Chauffeur and concierge', 'Getting guests and purchases home in style'],
    ],
  },
  {
    match: 'padel',
    tagline: 'Performance for the people who run things.',
    intro:
      'An urban country club on the roof, where sport, recovery and longevity meet business. Guests play, get measured, recover and talk about staying at the top of their game for longer.',
    format: 'Timed-session activation · up to 120 · 2pm – 7pm',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/london-series/harrods/padel-longevity.jpg',
    runningOrder: [
      ['2.00pm', 'Arrival, kit-up and a performance check-in'],
      ['2.30pm', 'Timed padel sessions with coaches and founder challenges'],
      ['4.00pm', 'Recovery and biometrics stations; longevity consultations'],
      ['5.00pm', 'In conversation: sustainable performance under pressure'],
      ['5.45pm', 'Healthy rooftop hospitality and curated introductions'],
      ['7.00pm', 'Close'],
    ],
    roomHeadline: 'Active and performance-driven; open to new health habits and technology',
    mix: [
      ['The Club', 40],
      ['Harrods VIPs', 30],
      ['Partner guests', 20],
      ['Athletes and talent', 10],
    ],
    profile: [
      ['Who', 'Founders, CEOs, investors and senior executives, health-conscious HNW couples, amateur padel players, athletes and sports investors'],
      ['Age', 'Mostly 30–60'],
      ['Wealth', 'HNW professionals and business owners with high spend on health and fitness'],
      ['From', 'London, with The Club Members in the North and Harrods sport and wellness clients'],
    ],
    sectors: [
      ['Longevity clinics and private health', 'Guests who treat health as an investment'],
      ['Wellness and performance technology', 'Wearables and recovery, tried on the day'],
      ['Sportswear and padel equipment', 'Product in use, on court'],
      ['Private medical and health insurance', 'A natural conversation in this room'],
      ['Nutrition and functional drinks', 'Fuel and hydration built into the day'],
      ['Wealth and life planning', 'Longevity of health, and of wealth'],
    ],
  },
  {
    match: 'north',
    tagline: 'Northern hospitality comes to Knightsbridge.',
    intro:
      'With Grantley Hall: private shopping appointments in Harrods, then the rooftop becomes a preview of one of the North’s finest estates, ending in dinner and bookings for stays, retreats and celebrations.',
    format: 'Shopping, salon and dinner · 2pm – 9pm',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/london-series/harrods/north-south.jpg',
    runningOrder: [
      ['2.00pm', 'Arrival and private shopping appointments in Harrods'],
      ['4.00pm', 'The Estate zone on the Helideck: scent, florals and film'],
      ['5.00pm', 'The Spa zone, with bookable wellbeing consultations'],
      ['6.00pm', 'In conversation: British luxury, from the North'],
      ['7.00pm', 'Yorkshire-inspired dinner and the Celebration zone'],
      ['9.00pm', 'Close'],
    ],
    roomHeadline: 'Planning: weekends away, retreats, weddings and milestones',
    mix: [
      ['Harrods VIPs', 35],
      ['Grantley Hall clients', 25],
      ['The Club', 25],
      ['Partner guests', 15],
    ],
    profile: [
      ['Who', 'Harrods clients seeking UK escapes, London founders, corporate retreat and celebration buyers, and Grantley Hall’s top clients'],
      ['Age', 'Mostly 35–65'],
      ['Wealth', 'HNW and UHNW households and businesses booking premium stays and events'],
      ['From', 'London and the South East, meeting Yorkshire and the North West'],
    ],
    sectors: [
      ['Luxury hotels and hospitality', 'Bookings made on the night'],
      ['British heritage and country fashion', 'The country wardrobe for the country stay'],
      ['Luxury automotive', 'The drive north, made part of the story'],
      ['Champagne, gin and spirits', 'Tastings woven through every zone'],
      ['Country property', 'Buyers looking beyond London'],
      ['Private aviation and chauffeur', 'Getting there, beautifully'],
    ],
  },
  {
    match: 'aviation',
    tagline: 'From helipad to horizon.',
    intro:
      'The rooftop’s helipad story becomes a departure lounge for the world of private travel: aircraft, destinations and the people who arrange them, in one afternoon.',
    format: 'Aviation salon · up to 120 · 2pm – 7pm',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/london-series/harrods/aviation-travel.jpg',
    runningOrder: [
      ['2.00pm', 'Boarding: arrival into the departure lounge'],
      ['2.30pm', 'Aircraft film, plus cabin and material showcases'],
      ['3.30pm', 'In conversation: the future of private flight and travel'],
      ['4.30pm', 'Destination tables: villas, yachts and journeys'],
      ['5.30pm', 'Private consultations with aviation and travel partners'],
      ['7.00pm', 'Close'],
    ],
    roomHeadline: 'Time-poor and travel-heavy; looking for trusted providers',
    mix: [
      ['The Club', 35],
      ['Harrods VIPs', 35],
      ['Partner guests', 20],
      ['Talent and press', 10],
    ],
    profile: [
      ['Who', 'UHNW frequent flyers and chiefs of staff, founders and CEOs, second-home owners and international Harrods VIPs'],
      ['Age', 'Mostly 35–70'],
      ['Wealth', 'UHNW; many already fly privately or charter regularly'],
      ['From', 'London, with Harrods clients from the GCC, Europe and the US'],
    ],
    sectors: [
      ['Private jet and helicopter operators', 'A room of current and future flyers'],
      ['Aircraft sales and aviation finance', 'Ownership conversations, face to face'],
      ['Luxury travel, villas and yachting', 'Next season’s plans, made on the night'],
      ['Luggage, watches and travel goods', 'The kit that travels with them'],
      ['Aviation and travel insurance', 'Protecting assets and journeys'],
      ['Security, concierge and chauffeur', 'The service around every trip'],
    ],
  },
  {
    match: 'car in the sky',
    tagline: 'Automotive theatre above Knightsbridge.',
    intro:
      'One hero car, revealed where no one expects to see it, and framed as art, engineering and personalisation for a room of buyers and collectors.',
    format: 'Reveal and reception · up to 120 · 7pm – 11pm',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/london-series/harrods/car-in-the-sky.jpg',
    runningOrder: [
      ['7.00pm', 'Arrival and champagne, with the car still under wraps'],
      ['7.45pm', 'The reveal, with a designer or driver on stage'],
      ['8.15pm', 'The atelier: materials, configuration and personalisation'],
      ['8.45pm', 'In conversation: performance, collecting and design'],
      ['9.30pm', 'Private configurations and test-drive bookings'],
      ['11.00pm', 'Close'],
    ],
    roomHeadline: 'Ready to configure, not just browse',
    mix: [
      ['The Club', 30],
      ['Harrods VIPs', 30],
      ['Marque guests', 30],
      ['Talent and press', 10],
    ],
    profile: [
      ['Who', 'Supercar, luxury and classic-car owners, collectors, next-generation wealth, entrepreneurs and entertainment and sports talent'],
      ['Age', 'Mostly 28–65'],
      ['Wealth', 'HNW and UHNW buyers and collectors'],
      ['From', 'London and the North West, with international Harrods clients'],
    ],
    sectors: [
      ['Luxury and performance marques', 'A reveal in front of qualified buyers'],
      ['Watches and jewellery', 'Precision and craft, side by side'],
      ['Private banking and asset finance', 'Funding the purchase and the collection'],
      ['Vehicle and collection insurance', 'Specialist cover for valuable assets'],
      ['Automotive art and auction houses', 'Collectors in the room'],
      ['Premium audio, luggage and lifestyle', 'The world around the car'],
    ],
  },
  {
    match: 'inspire',
    tagline: 'Celebration, relationships and what comes next.',
    intro:
      'The Club’s flagship close to the year: a long lunch in the sky celebrating the community built over twelve months, and the introductions that turned into business.',
    format: 'Private lunch · 80 seated · 2pm – 7pm',
    image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/london-series/harrods/inspire.jpg',
    runningOrder: [
      ['2.00pm', 'Champagne reception on the open deck, skyline views'],
      ['2.45pm', 'Lunch in the pavilion, seated by curated introduction'],
      ['4.00pm', 'In conversation: Sarah Restrick with a celebrity interviewer'],
      ['4.45pm', 'Member moments: the year’s success stories and what’s next'],
      ['5.30pm', 'Rooftop drinks, partner showcases and introductions'],
      ['7.00pm', 'Close'],
    ],
    roomHeadline: 'Reflective and celebratory, and planning the year ahead',
    mix: [
      ['The Club', 50],
      ['Harrods VIPs', 25],
      ['Partner guests', 15],
      ['Press and talent', 10],
    ],
    profile: [
      ['Who', 'Founders, business owners, The Club Members and partner brands, UHNW guests, Harrods VIPs and selected press'],
      ['Age', 'Mostly 35–65'],
      ['Wealth', 'Owners and leaders of £1m to £100m+ businesses; HNW and UHNW individuals'],
      ['From', 'London, Manchester, Cheshire and Leeds, with international Harrods clients'],
    ],
    sectors: [
      ['Private banking and wealth', 'Founders reviewing the year and planning the next'],
      ['Champagne, wine and spirits', 'Own the toast at the year’s celebration'],
      ['Fine jewellery and watches', 'A room on the edge of gifting season'],
      ['Luxury hospitality and travel', 'Year-end is when next year’s trips are booked'],
      ['Law and private wealth structuring', 'Succession and structuring conversations'],
      ['Insurance', 'Protecting what the year has built'],
    ],
  },
]

export function detailFor(title: string): SeriesEventDetail | null {
  const t = title.toLowerCase()
  return SERIES_DETAILS.find((d) => t.includes(d.match)) ?? null
}
