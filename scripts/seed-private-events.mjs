// Seed curated_experiences (visible cards on /private-event-services)
// + video_gallery rows scoped to page_slug='private-events'. All
// placeholder — Sarah's team to replace via admin.

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

function esc(v) {
  if (v == null) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return `'${String(v).replace(/'/g, "''")}'`
}

// Verbatim copy from Sarah's reference screenshot for the 3 visible
// cards; placeholder link_url (Sarah supplies real URLs in admin).
const experiences = [
  {
    title: 'Monaco Grand Prix',
    description:
      'Experience the pinnacle of motorsport and luxury with four extraordinary days of curated indulgence in Cannes and Monaco, celebrating trackside thrills, glamour and the excitement of the Monaco Grand Prix. The ultimate blend of sophistication and speed.',
    image: '/gallery/land2.png',
    link: 'https://theclubbysarahrestrick.com',
    order: 0,
  },
  {
    title: 'Great British Polo – St Tropez',
    description:
      'Experience quintessential British polo in the heart of Saint-Tropez, held exclusively at the prestigious Polo Club Saint-Tropez. Enjoy world-class matches with international teams, fine dining and an elite gathering of distinguished guests and luxury brands.',
    image: '/gallery/land1.png',
    link: 'https://theclubbysarahrestrick.com',
    order: 1,
  },
  {
    title: 'Gleneagles Golf & Tennis Experience',
    description:
      'Embark on a two-day escape to the iconic Gleneagles Estate, where championship golf meets world-class tennis amid the stunning Perthshire landscape. Helicopter arrivals and matches with legends define this luxurious sporting experience.',
    image: '/gallery/land3.png',
    link: 'https://theclubbysarahrestrick.com',
    order: 2,
  },
  // PLACEHOLDER additional rows — Sarah's team to swap titles/copy.
  {
    title: 'Cannes Yachting Weekend',
    description:
      'Three days afloat on the Côte d’Azur with a curated guestlist, private skipper service and evenings at Cap d’Antibes. A bespoke escape designed around quiet conversation between courses.',
    image: '/gallery/bigland.png',
    link: 'https://theclubbysarahrestrick.com',
    order: 3,
  },
  {
    title: 'The Royal Ascot Enclosure',
    description:
      'A morning in the Royal Enclosure, an afternoon at the rails, an evening with the team back at the house. Black tie, briefings on the field, and the kind of company that makes the race incidental.',
    image: '/gallery/potrait.png',
    link: 'https://theclubbysarahrestrick.com',
    order: 4,
  },
  {
    title: 'Wimbledon Centre Court',
    description:
      'Centre Court seats, a long lunch beforehand at a private club, and a quiet drink with the team after the final point. We arrange the day end-to-end so you turn up and simply watch the tennis.',
    image: '/theclub-section.png',
    link: 'https://theclubbysarahrestrick.com',
    order: 5,
  },
]

// ── Clear + insert curated_experiences ────────────────────────
console.log('— Clearing prior curated_experiences placeholders —')
await sql(`DELETE FROM curated_experiences WHERE title IN (${experiences.map((e) => esc(e.title)).join(', ')})`)

console.log('\n— Inserting curated_experiences —')
for (const e of experiences) {
  await sql(
    `INSERT INTO curated_experiences (title, description, image_url, link_url, display_order, is_active) VALUES (${esc(e.title)}, ${esc(e.description)}, ${esc(e.image)}, ${esc(e.link)}, ${e.order}, TRUE)`,
  )
  console.log(`  ✓ ${e.title}`)
}

// ── Link videos for private-events page_slug ──────────────────
console.log('\n— Linking videos to page_slug=private-events —')
await sql(`DELETE FROM video_gallery WHERE page_slug = 'private-events'`)

const videoUrls = [
  ['https://youtu.be/g3IJ4N1YbH0', 'The Club — Curated Luxury Event'],
  ['https://youtu.be/hemsMAkR6mM', 'The Club — Curated Luxury Event: Lamborghini'],
  ['https://youtu.be/hQlyvKGl3Ak', 'The Club — Grantley Hall Bonfire Night'],
  ['https://youtu.be/jL0ndHIKa3g', 'The Club — Members Evening Highlights'],
]
const values = videoUrls
  .map(([url, title], i) => `(${esc(url)}, ${esc(title)}, ${esc('private-events')}, ${i}, TRUE)`)
  .join(', ')
await sql(
  `INSERT INTO video_gallery (youtube_url, title, page_slug, display_order, is_active) VALUES ${values}`,
)
console.log(`  ✓ ${videoUrls.length} films linked`)

console.log('\nDone.')
