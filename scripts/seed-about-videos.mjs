// Seed public.video_gallery with Sarah's 4 YouTube videos for the
// /about page. Titles are fetched live from YouTube's oEmbed endpoint
// so we never invent them.

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
  if (!res.ok) {
    throw new Error(`SQL failed: ${res.status} ${text}`)
  }
  return JSON.parse(text)
}

async function ytTitle(url) {
  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  try {
    const r = await fetch(oembed)
    if (!r.ok) throw new Error(`${r.status}`)
    const j = await r.json()
    return j.title || null
  } catch (e) {
    console.warn(`  ! oEmbed failed for ${url}: ${e.message}`)
    return null
  }
}

const urls = [
  'https://youtu.be/g3IJ4N1YbH0',
  'https://youtu.be/hemsMAkR6mM',
  'https://youtu.be/hQlyvKGl3Ak',
  'https://youtu.be/jL0ndHIKa3g',
]

console.log('— Fetching titles from YouTube oEmbed —')
const rows = []
for (let i = 0; i < urls.length; i++) {
  const url = urls[i]
  const title = await ytTitle(url)
  console.log(`  ${i + 1}. ${title ?? '(no title — using placeholder)'}`)
  rows.push({
    url,
    title: title ?? `Video ${i + 1}`,
    order: i,
  })
}

// Clear any prior 'about' rows so re-running is idempotent
console.log("\n— Clearing existing 'about' page rows —")
await sql(`DELETE FROM video_gallery WHERE page_slug = 'about'`)

console.log('\n— Inserting fresh rows —')
const values = rows
  .map(
    (r) =>
      `('${r.url}', ${r.title.replace(/'/g, "''").replace(/^/, "E'") + "'"}, 'about', ${r.order}, true)`,
  )
  .join(', ')
const insertSql = `INSERT INTO video_gallery (youtube_url, title, page_slug, display_order, is_active) VALUES ${values} RETURNING id, title`
const result = await sql(insertSql)
console.log(result)

console.log('\nDone.')
