// Top-up migration: seeds heroes for the three pages the original
// hero CMS rollout missed — club-rules, privacy-policy, and
// one-london-road. Idempotent.

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

const heroes = [
  {
    page_slug: 'club-rules',
    media_type: 'image',
    image_url:
      'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=2400&q=85',
    alt_text: 'A handwritten letter on a wooden desk',
    eyebrow: 'The Standard · Nine Articles',
    headline: 'The Club Rules.',
    lede: 'Guidelines for a harmonious and enriching experience for all.',
  },
  {
    page_slug: 'privacy-policy',
    media_type: 'image',
    image_url:
      'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=2400&q=85',
    alt_text: 'A quiet desk with a sealed letter',
    eyebrow: 'The Standard · Privacy',
    headline: 'Privacy Policy.',
    lede: 'How and why we collect, store, use, and share your information.',
  },
  {
    page_slug: 'one-london-road',
    media_type: 'image',
    image_url:
      'https://images.unsplash.com/photo-1551269901-5c5e14c25df7?auto=format&fit=crop&w=2400&q=85',
    alt_text: 'One London Road by night',
    eyebrow: 'The Address · London · Marylebone',
    headline: 'One London Road.',
    lede:
      'A four-storey townhouse off Marylebone Lane. The home of The Club, and most of the rooms we host in.',
  },
]

console.log('— Seeding the 3 missed-page heroes —')
for (const h of heroes) {
  await sql(
    `DELETE FROM public.hero_slides WHERE page_slug = ${esc(h.page_slug)} AND display_order = 0;`,
  )
  await sql(`
    INSERT INTO public.hero_slides (
      page_slug, display_order, is_active,
      media_type, image_url, alt_text,
      eyebrow, headline, lede
    ) VALUES (
      ${esc(h.page_slug)}, 0, TRUE,
      ${esc(h.media_type)}, ${esc(h.image_url)}, ${esc(h.alt_text)},
      ${esc(h.eyebrow)}, ${esc(h.headline)}, ${esc(h.lede)}
    );
  `)
  console.log(`  ✓ ${h.page_slug.padEnd(20)} ${h.headline}`)
}

console.log('\n— Verification —')
const rows = await sql(
  `SELECT page_slug, headline FROM public.hero_slides WHERE display_order = 0 ORDER BY page_slug;`,
)
console.log(`${rows.length} default heroes now:`)
for (const r of rows) console.log(`  ${r.page_slug.padEnd(28)} ${r.headline ?? ''}`)
