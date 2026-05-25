// Seeds 3 placeholder testimonials so the homepage `Members' Voices`
// section renders. Sarah's team should replace these via
// /dashboard/website/testimonials with real, permissioned member
// quotes before going public.
//
// Idempotent — re-running clears the placeholder rows by their
// well-known names and re-inserts them. Adding real testimonials via
// the dashboard with different names is unaffected.

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

const testimonials = [
  {
    person_name: 'Alexandra Cole',
    person_title: 'Chief Executive',
    company_name: 'Linwood & Co.',
    quote_text:
      'Each evening has been considered, each room quietly the right one. That is rarer than it should be — and it is the entire reason we keep coming back.',
    display_order: 0,
  },
  {
    person_name: 'Marcus Bell',
    person_title: 'Founding Partner',
    company_name: 'North Bridge Capital',
    quote_text:
      'The introductions have been thoughtful and entirely without agenda. Three of the most important relationships of the last few years began at one of these dinners.',
    display_order: 1,
  },
  {
    person_name: 'Sophie Linwood',
    person_title: 'Director of Strategy',
    company_name: 'Aurelia Group',
    quote_text:
      "A members club that doesn't feel like one. Curated, useful, and intentionally small — the standard is set by the room, not the brochure.",
    display_order: 2,
  },
]

console.log('— Clearing previous placeholder testimonials by name —')
await sql(
  `DELETE FROM public.testimonials WHERE person_name IN (${testimonials.map((t) => esc(t.person_name)).join(', ')})`,
)

console.log('— Inserting placeholders —')
for (const t of testimonials) {
  await sql(`
    INSERT INTO public.testimonials (
      person_name, person_title, company_name, quote_text,
      display_order, is_active
    ) VALUES (
      ${esc(t.person_name)}, ${esc(t.person_title)}, ${esc(t.company_name)}, ${esc(t.quote_text)},
      ${t.display_order}, TRUE
    );
  `)
  console.log(`  ✓ ${t.person_name} — ${t.person_title} @ ${t.company_name}`)
}

console.log('\n— Verification —')
const rows = await sql(
  `SELECT person_name, person_title, company_name, is_active, display_order FROM public.testimonials ORDER BY display_order`,
)
console.log(`${rows.length} testimonial(s):`)
for (const r of rows) {
  console.log(
    `  #${r.display_order} ${r.is_active ? 'live' : 'off '}  ${r.person_name} — ${r.person_title ?? '—'} @ ${r.company_name ?? '—'}`,
  )
}
console.log('\nDone. Edit / replace these at /dashboard/website/testimonials.')
