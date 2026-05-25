// One-off migration: create the public-facing `membership_plans` table
// + seed it with the 3 plans currently hardcoded on /memberships.
//
// This table is intentionally separate from `membership_tiers` (which
// is an internal benefit-classification with 6 rows for tier×type
// combinations). `membership_plans` is what the public site sells —
// Individual / Business / Corporate.
//
// Idempotent: safe to re-run. The seed uses ON CONFLICT (slug) so
// existing rows are updated rather than duplicated.

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
  if (Array.isArray(v)) {
    // text[] literal — escape each element and wrap in ARRAY[...]::text[]
    return `ARRAY[${v.map((e) => `'${String(e).replace(/'/g, "''")}'`).join(', ')}]::text[]`
  }
  return `'${String(v).replace(/'/g, "''")}'`
}

console.log('— Creating membership_plans table —')
await sql(`
  CREATE TABLE IF NOT EXISTS public.membership_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    lede text,
    contract_terms text,
    annual_price_pence integer NOT NULL DEFAULT 0,
    monthly_price_pence integer NOT NULL DEFAULT 0,
    features text[] NOT NULL DEFAULT '{}',
    image_url text,
    tier_classification text,
    is_active boolean NOT NULL DEFAULT true,
    is_featured boolean NOT NULL DEFAULT false,
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`)

console.log('— Adding update-trigger for updated_at —')
await sql(`
  CREATE OR REPLACE FUNCTION public.tg_membership_plans_set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;
`)
await sql(`
  DROP TRIGGER IF EXISTS trg_membership_plans_updated_at ON public.membership_plans;
  CREATE TRIGGER trg_membership_plans_updated_at
    BEFORE UPDATE ON public.membership_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_membership_plans_set_updated_at();
`)

console.log('— Enabling RLS, granting policies —')
await sql(`ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;`)
// Public read of active plans (anyone can see what's on offer).
await sql(`DROP POLICY IF EXISTS "Public read active plans" ON public.membership_plans;`)
await sql(`
  CREATE POLICY "Public read active plans"
    ON public.membership_plans
    FOR SELECT
    USING (is_active = true);
`)
// Admins can do anything.
await sql(`DROP POLICY IF EXISTS "Admins manage plans" ON public.membership_plans;`)
await sql(`
  CREATE POLICY "Admins manage plans"
    ON public.membership_plans
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    );
`)

console.log('\n— Seeding 3 public plans from existing hardcoded data —')
// Pence values mirror the current /memberships hardcoded TIERS exactly.
const plans = [
  {
    slug: 'individual',
    name: 'Individual',
    lede:
      'A single representation in the room. Quiet, considered, and built for the founder who keeps their own calendar.',
    contract_terms: '12 months · plus VAT',
    annual_price_pence: 250000,    // £2,500
    monthly_price_pence: 20833,    // £208.33
    features: [
      '1 representation',
      '12 month minimum term',
      'Businesses can take multiple individual memberships',
      '6 Member tickets',
      '1 Ticket at Member Rate for paid events',
    ],
    image_url: '/theclub-section.png',
    tier_classification: 'tier_1',
    display_order: 0,
    is_featured: false,
  },
  {
    slug: 'business',
    name: 'Business',
    lede:
      'Up to four seats with shared invitations, a brand showcase evening, and the corporate concierge on call.',
    contract_terms: '12 months · plus VAT',
    annual_price_pence: 1500000,   // £15,000
    monthly_price_pence: 125000,   // £1,250
    features: [
      'Up to 4 representations / guests',
      '12 month minimum term',
      '6 Member tickets',
      '4 Tickets at Member rates for paid events',
      '1 brand showcase event with curated guestlist of prospects (additional fees apply)',
      'Corporate & luxury concierge',
    ],
    image_url: '/gallery/land2.png',
    tier_classification: 'tier_2',
    display_order: 1,
    is_featured: true,
  },
  {
    slug: 'corporate',
    name: 'Corporate',
    lede:
      'A full partnership — your team across the calendar, a sponsorship moment, and a showcase evening of your own.',
    contract_terms: '12 months · plus VAT',
    annual_price_pence: 3000000,   // £30,000
    monthly_price_pence: 250000,   // £2,500
    features: [
      'Up to 4 representations / guests',
      '12 month minimum term',
      '6 Member tickets',
      '4 Tickets at Member rates for paid events',
      '1 brand showcase event with curated guestlist of prospects (additional fees apply)',
      '1 sponsorship opportunity included',
      'Corporate & luxury concierge',
    ],
    image_url: '/gallery/land3.png',
    tier_classification: 'tier_3',
    display_order: 2,
    is_featured: false,
  },
]

for (const p of plans) {
  await sql(`
    INSERT INTO public.membership_plans (
      slug, name, lede, contract_terms,
      annual_price_pence, monthly_price_pence,
      features, image_url, tier_classification,
      display_order, is_active, is_featured
    ) VALUES (
      ${esc(p.slug)}, ${esc(p.name)}, ${esc(p.lede)}, ${esc(p.contract_terms)},
      ${esc(p.annual_price_pence)}, ${esc(p.monthly_price_pence)},
      ${esc(p.features)}, ${esc(p.image_url)}, ${esc(p.tier_classification)},
      ${esc(p.display_order)}, TRUE, ${esc(p.is_featured)}
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      lede = EXCLUDED.lede,
      contract_terms = EXCLUDED.contract_terms,
      annual_price_pence = EXCLUDED.annual_price_pence,
      monthly_price_pence = EXCLUDED.monthly_price_pence,
      features = EXCLUDED.features,
      image_url = EXCLUDED.image_url,
      tier_classification = EXCLUDED.tier_classification,
      display_order = EXCLUDED.display_order,
      is_featured = EXCLUDED.is_featured,
      updated_at = now();
  `)
  console.log(`  ✓ ${p.name.padEnd(12)} £${(p.annual_price_pence / 100).toLocaleString()} / year`)
}

console.log('\n— Verification —')
const rows = await sql(
  `SELECT slug, name, annual_price_pence, monthly_price_pence, is_active, display_order FROM public.membership_plans ORDER BY display_order`,
)
console.log(`${rows.length} plan(s):`)
for (const r of rows) {
  console.log(
    `  #${r.display_order}  ${r.slug.padEnd(12)} £${(r.annual_price_pence / 100).toLocaleString()}/y · £${(r.monthly_price_pence / 100).toLocaleString()}/m  ${r.is_active ? 'active' : 'hidden'}`,
  )
}
