// Seed public.galleries + gallery_photos + video_gallery (page_slug =
// gallery-{slug}) so the /gallery and /gallery/[slug] layouts can be
// reviewed at scale. All rows are clearly demo data — Sarah's team
// will replace them through the admin.

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

const IMAGES = [
  '/gallery/bigland.png',
  '/gallery/land1.png',
  '/gallery/land2.png',
  '/gallery/land3.png',
  '/gallery/potrait.png',
  '/theclub-section.png',
  '/theapproch-image.png',
  '/manchester.png',
]

function daysAgo(d) {
  const x = new Date()
  x.setDate(x.getDate() - d)
  return x.toISOString().slice(0, 10)
}

// 14 placeholder galleries spread across all six categories + a range
// of dates so the listing demonstrates filtering + pagination behaviour.
const galleries = [
  { title: 'Members Dining · Tattu, Leeds', slug: 'g-tattu-leeds', category: 'members_event', event_date: daysAgo(28), venue_name: 'Tattu', location: 'Leeds', cover: '/gallery/bigland.png' },
  { title: 'Estelle Manor · Curated Day', slug: 'g-estelle-manor-curated', category: 'curated_experience', event_date: daysAgo(45), venue_name: 'Estelle Manor', location: 'Oxfordshire', cover: '/gallery/land1.png' },
  { title: 'The Deal Table · City Tower', slug: 'g-deal-table-city-tower', category: 'business_enrichment', event_date: daysAgo(62), venue_name: 'City Tower', location: 'Manchester', cover: '/gallery/land2.png' },
  { title: 'Brand & Influence · Members Night', slug: 'g-brand-influence', category: 'sponsored_event', event_date: daysAgo(85), venue_name: 'A private dining room', location: 'Manchester', cover: '/gallery/land3.png' },
  { title: 'Private Dining · Lake District', slug: 'g-private-dining-lakes', category: 'private_dining', event_date: daysAgo(104), venue_name: 'A country house', location: 'Lake District', cover: '/gallery/potrait.png' },
  { title: 'Sponsored Evening · Property Sourcing', slug: 'g-sponsored-property-sourcing', category: 'sponsored_event', event_date: daysAgo(128), venue_name: 'City Tower', location: 'Manchester', cover: '/theclub-section.png' },
  { title: 'Curated Tasting · Knight Frank', slug: 'g-curated-knight-frank', category: 'curated_experience', event_date: daysAgo(150), venue_name: 'Private estate', location: 'Cheshire', cover: '/theapproch-image.png' },
  { title: 'Members Cocktails · Manchester', slug: 'g-members-cocktails-mcr', category: 'members_event', event_date: daysAgo(178), venue_name: 'A private bar', location: 'Manchester', cover: '/manchester.png' },
  { title: 'Special Evening · Boodles Tennis', slug: 'g-special-boodles', category: 'special_event', event_date: daysAgo(205), venue_name: 'The Hurlingham Club', location: 'London', cover: '/gallery/bigland.png' },
  { title: 'Business Enrichment · Founders Lunch', slug: 'g-business-founders-lunch', category: 'business_enrichment', event_date: daysAgo(230), venue_name: 'A private dining room', location: 'Leeds', cover: '/gallery/land1.png' },
  { title: 'Private Dining · Cheshire', slug: 'g-private-dining-cheshire', category: 'private_dining', event_date: daysAgo(258), venue_name: 'A country house', location: 'Cheshire', cover: '/gallery/land2.png' },
  { title: 'Curated Day · Goodwood', slug: 'g-curated-goodwood', category: 'curated_experience', event_date: daysAgo(284), venue_name: 'Goodwood', location: 'West Sussex', cover: '/gallery/land3.png' },
  { title: 'Special Evening · Royal Ascot', slug: 'g-special-ascot', category: 'special_event', event_date: daysAgo(312), venue_name: 'Ascot Racecourse', location: 'Berkshire', cover: '/gallery/potrait.png' },
  { title: 'Members Dining · The Edition', slug: 'g-members-edition', category: 'members_event', event_date: daysAgo(340), venue_name: 'The Edition Hotel', location: 'London', cover: '/theclub-section.png' },
]

// ── Clear prior placeholders ────────────────────────────────────
console.log('— Clearing prior placeholder galleries —')
const slugs = galleries.map((g) => esc(g.slug)).join(', ')
await sql(`DELETE FROM gallery_photos WHERE gallery_id IN (SELECT id FROM galleries WHERE slug IN (${slugs}))`)
await sql(`DELETE FROM galleries WHERE slug IN (${slugs})`)
await sql(
  `DELETE FROM video_gallery WHERE page_slug LIKE 'gallery-g-%'`,
)

// ── Insert galleries ──────────────────────────────────────────
console.log('\n— Inserting placeholder galleries —')
for (const g of galleries) {
  const insertSql = `INSERT INTO galleries (title, slug, category, event_date, venue_name, location, cover_image_url, is_published) VALUES (${esc(g.title)}, ${esc(g.slug)}, ${esc(g.category)}, ${esc(g.event_date)}, ${esc(g.venue_name)}, ${esc(g.location)}, ${esc(g.cover)}, TRUE) RETURNING id, slug`
  const [row] = await sql(insertSql)
  console.log(`  ✓ ${row.slug}`)

  // Each gallery gets 8–14 photos cycled from /public/gallery + others
  const photoCount = 8 + Math.floor(Math.random() * 7)
  const photoValues = []
  for (let i = 0; i < photoCount; i++) {
    const url = IMAGES[(i + galleries.indexOf(g)) % IMAGES.length]
    photoValues.push(
      `(${esc(row.id)}, ${esc(url)}, ${esc(`Frame ${String(i + 1).padStart(2, '0')}`)}, ${i})`,
    )
  }
  await sql(
    `INSERT INTO gallery_photos (gallery_id, image_url, caption, display_order) VALUES ${photoValues.join(', ')}`,
  )
}

// ── Seed videos for one gallery so the films section is visible ─
console.log('\n— Linking films to one gallery (Tattu Leeds) —')
const videoUrls = [
  ['https://youtu.be/g3IJ4N1YbH0', 'The Club Monthly Members Event @ Tattu, Leeds'],
  ['https://youtu.be/hemsMAkR6mM', 'Business Events with The Club'],
]
const videoValues = videoUrls.map(([url, title], i) => `(${esc(url)}, ${esc(title)}, ${esc('gallery-g-tattu-leeds')}, ${i}, TRUE)`).join(', ')
await sql(
  `INSERT INTO video_gallery (youtube_url, title, page_slug, display_order, is_active) VALUES ${videoValues}`,
)

console.log('\nDone.')
