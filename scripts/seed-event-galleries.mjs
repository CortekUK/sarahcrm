// Adds gallery_urls to the 3 completed/past events so the
// "From the evening" strip on the public /events/[slug] page has
// something to render. Uses existing /gallery/*.png placeholders that
// already ship in /public — no new uploads required.

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

// Placeholder pool — pulled from /public/gallery/. Each past event gets
// a different 6-photo selection so the bento doesn't look identical.
const POOL = {
  property_sourcing: [
    '/gallery/land1.png',
    '/gallery/land2.png',
    '/gallery/land3.png',
    '/gallery/bigland.png',
    '/gallery/potrait.png',
    '/theclub-section.png',
  ],
  members_cocktails: [
    '/gallery/land2.png',
    '/gallery/land3.png',
    '/gallery/bigland.png',
    '/gallery/potrait.png',
    '/gallery/land1.png',
    '/theclub-section.png',
  ],
  members_retreat: [
    '/gallery/bigland.png',
    '/gallery/land1.png',
    '/gallery/potrait.png',
    '/gallery/land3.png',
    '/gallery/land2.png',
    '/theclub-section.png',
  ],
}

const updates = [
  { slug: 'past-property-sourcing-city-tower', urls: POOL.property_sourcing },
  { slug: 'past-members-cocktails-tattu', urls: POOL.members_cocktails },
  { slug: 'past-members-retreat-lakes', urls: POOL.members_retreat },
]

console.log('— Adding gallery_urls to completed events —')
for (const { slug, urls } of updates) {
  const arr = `ARRAY[${urls.map(esc).join(', ')}]::text[]`
  const result = await sql(
    `UPDATE events SET gallery_urls = ${arr} WHERE slug = ${esc(slug)} RETURNING title`,
  )
  if (result.length === 0) {
    console.log(`  ⚠ ${slug} — no matching event (skipped)`)
  } else {
    console.log(`  ✓ ${result[0].title} — ${urls.length} photos`)
  }
}

console.log('\nDone.')
