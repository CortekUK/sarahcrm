// Extends `hero_slides` into a proper per-page hero CMS and seeds the
// initial rows from the copy currently hardcoded into each public hero.
//
// Schema additions (all nullable so existing rows keep working):
//   media_type            'image' | 'video'   (default 'image')
//   video_url             text                  (when media_type='video')
//   video_poster_url      text                  (fallback frame for video)
//   eyebrow               text                  (small-caps tag above title)
//   headline              text                  (big display title)
//   lede                  text                  (italic body paragraph)
//   cta_primary_label     text
//   cta_primary_href      text
//   cta_secondary_label   text
//   cta_secondary_href    text
//
// page_slugs already in use: home, about, gallery, events, memberships,
// private-event-services, contact-us. Adds 'membership-application' too.
//
// Idempotent: re-run safely. Seed uses (page_slug, display_order) as the
// natural key — if rows already exist for a page we update them, otherwise
// insert.

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

console.log('— Extending hero_slides schema —')
await sql(`
  ALTER TABLE public.hero_slides
    ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image',
    ADD COLUMN IF NOT EXISTS video_url text,
    ADD COLUMN IF NOT EXISTS video_poster_url text,
    ADD COLUMN IF NOT EXISTS eyebrow text,
    ADD COLUMN IF NOT EXISTS headline text,
    ADD COLUMN IF NOT EXISTS lede text,
    ADD COLUMN IF NOT EXISTS cta_primary_label text,
    ADD COLUMN IF NOT EXISTS cta_primary_href text,
    ADD COLUMN IF NOT EXISTS cta_secondary_label text,
    ADD COLUMN IF NOT EXISTS cta_secondary_href text;
`)
await sql(`
  ALTER TABLE public.hero_slides
    DROP CONSTRAINT IF EXISTS hero_slides_media_type_check;
  ALTER TABLE public.hero_slides
    ADD CONSTRAINT hero_slides_media_type_check
    CHECK (media_type IN ('image', 'video'));
`)
// image_url is now nullable (video-only heroes don't need it).
await sql(`ALTER TABLE public.hero_slides ALTER COLUMN image_url DROP NOT NULL;`)
// alt_text is nullable too — if a hero has no still image, there's no
// alt to require.
await sql(`ALTER TABLE public.hero_slides ALTER COLUMN alt_text DROP NOT NULL;`)

console.log('— Seeding default heroes for each page —')

// Each entry mirrors exactly what the public page currently renders. The
// admin can edit these from /dashboard/website/hero-slides afterwards.
const heroes = [
  {
    page_slug: 'home',
    display_order: 0,
    media_type: 'video',
    video_url:
      'https://res.cloudinary.com/dyxt44zjj/video/upload/f_auto,q_auto/v1779573614/hero-video_nxcbkk.mp4',
    video_poster_url:
      'https://res.cloudinary.com/dyxt44zjj/video/upload/so_32,f_jpg,w_1920,q_80/v1779573614/hero-video_nxcbkk.jpg',
    image_url: null,
    alt_text: 'The Club',
    eyebrow: 'Est. by Sarah Restrick',
    headline: 'The Club',
    lede: 'Connecting leaders in business through luxury experience.',
    cta_primary_label: 'Apply for Membership',
    cta_primary_href: '/membership-application',
    cta_secondary_label: 'Discover The Club',
    cta_secondary_href: '/about',
  },
  {
    page_slug: 'about',
    display_order: 0,
    media_type: 'image',
    image_url: '/gallery/potrait.png',
    alt_text: 'Sarah Restrick',
    eyebrow: 'The Club · Founder',
    headline: 'A visionary in luxury and connections.',
    lede: 'Sarah Restrick’s journey.',
    cta_primary_label: null,
    cta_primary_href: null,
    cta_secondary_label: null,
    cta_secondary_href: null,
  },
  {
    page_slug: 'memberships',
    display_order: 0,
    media_type: 'image',
    image_url: '/gallery/bigland.png',
    alt_text: 'A members’ evening',
    eyebrow: 'At The Club',
    headline: 'Memberships.',
    lede: 'Three ways to belong. Each is a 12 month decision.',
    cta_primary_label: null,
    cta_primary_href: null,
    cta_secondary_label: null,
    cta_secondary_href: null,
  },
  {
    page_slug: 'events',
    display_order: 0,
    media_type: 'image',
    image_url: '/gallery/bigland.png',
    alt_text: 'A members’ evening',
    eyebrow: 'The Calendar',
    headline: 'Events.',
    lede:
      'Explore a curated collection of upcoming and past events, each designed to offer a unique blend of luxury and networking. From the glamour of high-profile gatherings to the intimate settings of exclusive venues, our events page is your portal to the extraordinary.',
    cta_primary_label: null,
    cta_primary_href: null,
    cta_secondary_label: null,
    cta_secondary_href: null,
  },
  {
    page_slug: 'gallery',
    display_order: 0,
    media_type: 'image',
    image_url: '/gallery/bigland.png',
    alt_text: 'The atlas',
    eyebrow: 'The Atlas',
    headline: 'Gallery.',
    lede: 'A quiet ledger of the year — the rooms, the runs, the recorded nights.',
    cta_primary_label: null,
    cta_primary_href: null,
    cta_secondary_label: null,
    cta_secondary_href: null,
  },
  {
    page_slug: 'private-event-services',
    display_order: 0,
    media_type: 'image',
    image_url: '/theclub-section.png',
    alt_text: 'A private dining setup',
    eyebrow: 'At The Club',
    headline: 'Private Events.',
    lede: null,
    cta_primary_label: null,
    cta_primary_href: null,
    cta_secondary_label: null,
    cta_secondary_href: null,
  },
  {
    page_slug: 'contact-us',
    display_order: 0,
    media_type: 'image',
    image_url: '/gallery/bigland.png',
    alt_text: 'Get in touch',
    eyebrow: 'Get in Touch',
    headline: 'Contact us.',
    lede: 'A short note is enough — the team writes back personally.',
    cta_primary_label: null,
    cta_primary_href: null,
    cta_secondary_label: null,
    cta_secondary_href: null,
  },
  {
    page_slug: 'membership-application',
    display_order: 0,
    media_type: 'image',
    image_url: '/theclub-section.png',
    alt_text: 'The Club',
    eyebrow: null,
    headline: 'Apply for Membership.',
    lede: null,
    cta_primary_label: null,
    cta_primary_href: null,
    cta_secondary_label: null,
    cta_secondary_href: null,
  },
]

// Replace any existing (page_slug, display_order=0) row so the seed
// produces a clean default state.
for (const h of heroes) {
  // Delete the existing default row for this page (display_order = 0)
  // — keeps any custom slideshow rows the admin has added (>0).
  await sql(`
    DELETE FROM public.hero_slides
      WHERE page_slug = ${esc(h.page_slug)} AND display_order = 0;
  `)
  await sql(`
    INSERT INTO public.hero_slides (
      page_slug, display_order, is_active,
      media_type, image_url, alt_text, video_url, video_poster_url,
      eyebrow, headline, lede,
      cta_primary_label, cta_primary_href,
      cta_secondary_label, cta_secondary_href,
      overlay_text
    ) VALUES (
      ${esc(h.page_slug)}, ${esc(h.display_order)}, TRUE,
      ${esc(h.media_type)}, ${esc(h.image_url)}, ${esc(h.alt_text)}, ${esc(h.video_url ?? null)}, ${esc(h.video_poster_url ?? null)},
      ${esc(h.eyebrow)}, ${esc(h.headline)}, ${esc(h.lede)},
      ${esc(h.cta_primary_label)}, ${esc(h.cta_primary_href)},
      ${esc(h.cta_secondary_label)}, ${esc(h.cta_secondary_href)},
      NULL
    );
  `)
  console.log(
    `  ✓ ${h.page_slug.padEnd(28)} [${h.media_type}] ${h.headline}`,
  )
}

console.log('\n— Verification —')
const rows = await sql(`
  SELECT page_slug, media_type, headline, is_active
  FROM public.hero_slides
  WHERE display_order = 0
  ORDER BY page_slug;
`)
console.log(`${rows.length} default heroes:`)
for (const r of rows) {
  console.log(`  ${r.page_slug.padEnd(28)} [${r.media_type}] ${r.is_active ? 'live' : 'off '}  ${r.headline ?? ''}`)
}
