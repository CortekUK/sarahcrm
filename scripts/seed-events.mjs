// Seed public.events with placeholder evenings so the /events and
// /events/[slug] layouts can be reviewed. Every row is clearly a
// demo — Sarah's team will replace these through the admin.

import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(
  fs
    .readFileSync(path.resolve(import.meta.dirname, '..', '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const TOKEN = env.SUPABASE_ACCESS_TOKEN
const REF = 'owjnsljovmaaxgxpxxtw'

async function sql(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`SQL failed: ${res.status} ${text}`)
  return JSON.parse(text)
}

const NOW = new Date()
function inDays(d) {
  const x = new Date(NOW)
  x.setDate(x.getDate() + d)
  x.setHours(19, 0, 0, 0)
  return x.toISOString()
}
function inDaysDoors(d) {
  const x = new Date(NOW)
  x.setDate(x.getDate() + d)
  x.setHours(18, 30, 0, 0)
  return x.toISOString()
}
function inDaysEnd(d) {
  const x = new Date(NOW)
  x.setDate(x.getDate() + d)
  x.setHours(23, 0, 0, 0)
  return x.toISOString()
}

// PLACEHOLDER events — overwrite via admin. Images point at existing
// /public/gallery assets so the dev build doesn't 404 on covers.
const events = [
  {
    title: 'Members Evening · Manchester',
    slug: 'members-evening-manchester',
    description:
      "The monthly members' evening returns to Manchester. A long table, an unannounced guest of honour, and the easy conversation that this room is known for.\n\nPlaces are limited. Bookings open three weeks before each evening.",
    event_type: 'member_event',
    status: 'published',
    venue_name: 'A private dining room',
    venue_city: 'Manchester',
    venue_postcode: 'M2 4AA',
    start_date: inDays(18),
    end_date: inDaysEnd(18),
    doors_open: inDaysDoors(18),
    capacity: 40,
    guest_ticket_capacity: 10,
    // Complimentary for Members, £500 + VAT Guests — matches the
    // reference card the user supplied.
    member_price_pence: 0,
    guest_price_pence: 50000,
    cover_image_url: '/gallery/bigland.png',
  },
  {
    title: 'A Curated Evening at City Tower',
    slug: 'curated-evening-city-tower',
    description:
      'A curated luxury evening on the top floor of City Tower. A panel, a long dinner, and time afterwards for the conversation to settle. Black tie optional.',
    event_type: 'curated_luxury',
    status: 'published',
    venue_name: 'City Tower',
    venue_city: 'Manchester',
    venue_postcode: 'M1 4BT',
    start_date: inDays(32),
    end_date: inDaysEnd(32),
    doors_open: inDaysDoors(32),
    capacity: 60,
    guest_ticket_capacity: 20,
    // £1,500 + VAT Members · £2,500 + VAT Guests — Estelle Manor style.
    member_price_pence: 150000,
    guest_price_pence: 250000,
    cover_image_url: '/gallery/land2.png',
  },
  {
    title: 'The Spring Retreat',
    slug: 'the-spring-retreat',
    description:
      "Two nights, one quiet hotel in the Yorkshire Dales. Long walks, longer meals, and a few conversations off the record. The retreat is open to members and to a small number of guests we'd be proud to introduce.",
    event_type: 'retreat',
    status: 'published',
    venue_name: 'A private country house',
    venue_city: 'Yorkshire Dales',
    start_date: inDays(56),
    end_date: inDaysEnd(58),
    doors_open: inDaysDoors(56),
    capacity: 24,
    guest_ticket_capacity: 6,
    member_price_pence: 65000,
    guest_price_pence: 95000,
    travel_included: false,
    cover_image_url: '/gallery/land3.png',
  },
  {
    title: 'Members Dining · Leeds',
    slug: 'members-dining-leeds',
    description:
      'A short, considered dinner at one of the new Leeds rooms. Eight courses, fifteen at the table, and a guest from outside the city to keep the conversation honest.',
    event_type: 'member_event',
    status: 'published',
    venue_name: 'A private dining room',
    venue_city: 'Leeds',
    venue_postcode: 'LS1 4AP',
    start_date: inDays(11),
    end_date: inDaysEnd(11),
    doors_open: inDaysDoors(11),
    capacity: 16,
    guest_ticket_capacity: 4,
    // Complimentary Members · £350 + VAT Guests.
    member_price_pence: 0,
    guest_price_pence: 35000,
    cover_image_url: '/gallery/land1.png',
  },
  // ── PAST ───────────────────────────────────────────────────────
  {
    title: 'The Property Sourcing Company · City Tower',
    slug: 'past-property-sourcing-city-tower',
    description:
      'A members evening with The Property Sourcing Company on the top floor of City Tower. A long table, candid conversation, and a room full of operators.',
    event_type: 'curated_luxury',
    status: 'completed',
    venue_name: 'City Tower',
    venue_city: 'Manchester',
    start_date: inDays(-38),
    end_date: inDays(-37),
    capacity: 60,
    member_price_pence: 9500,
    guest_price_pence: 15000,
    cover_image_url: '/gallery/potrait.png',
  },
  {
    title: 'Members Cocktails · Tattu Leeds',
    slug: 'past-members-cocktails-tattu',
    description:
      "An evening at Tattu Leeds — cocktails on the mezzanine, dinner downstairs, and the room held until close.",
    event_type: 'member_event',
    status: 'completed',
    venue_name: 'Tattu',
    venue_city: 'Leeds',
    start_date: inDays(-72),
    end_date: inDays(-71),
    capacity: 50,
    member_price_pence: 7500,
    guest_price_pence: 12500,
    cover_image_url: '/manchester.png',
  },
  {
    title: 'Members Retreat · Lake District',
    slug: 'past-members-retreat-lakes',
    description:
      "Three nights at a private country house in the Lake District. Walks, long lunches, and the quiet conversation a retreat is meant for.",
    event_type: 'retreat',
    status: 'completed',
    venue_name: 'A private country house',
    venue_city: 'Lake District',
    start_date: inDays(-120),
    end_date: inDays(-118),
    capacity: 20,
    member_price_pence: 65000,
    guest_price_pence: 95000,
    cover_image_url: '/theclub-section.png',
  },
]

function escape(v) {
  if (v == null) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return `'${String(v).replace(/'/g, "''")}'`
}

// Clear prior placeholder events before re-seeding
console.log('— Clearing prior placeholder events —')
await sql(
  `DELETE FROM events WHERE slug IN (${events.map((e) => escape(e.slug)).join(', ')})`,
)

console.log('\n— Inserting placeholder events —')
for (const e of events) {
  const cols = Object.keys(e)
  const vals = cols.map((c) => escape(e[c]))
  const stmt = `INSERT INTO events (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING id, slug, status`
  const r = await sql(stmt)
  console.log(`  ✓ ${e.slug} → ${r[0].status}`)
}

console.log('\nDone.')
