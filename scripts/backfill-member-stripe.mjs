// One-off backfill: for active members whose Stripe IDs aren't set,
// look up their customer + active subscription in Stripe by email,
// link them on the member row, and insert the initial payment row.
//
// Run after fixing the webhook so any historical applicants who paid
// before the webhook was fixed get reconciled.

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
const STRIPE_KEY = env.STRIPE_SECRET_KEY
const REF = 'owjnsljovmaaxgxpxxtw'

if (!STRIPE_KEY) {
  console.error('STRIPE_SECRET_KEY not set in .env.local')
  process.exit(1)
}

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

async function stripe(method, url, body) {
  const res = await fetch(`https://api.stripe.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Stripe ${url}: ${res.status} ${JSON.stringify(json)}`)
  return json
}

console.log('— Finding active members without Stripe linkage —')
const members = await sql(`
  SELECT m.id, p.email, p.first_name, p.last_name
  FROM members m JOIN profiles p ON p.id = m.profile_id
  WHERE m.deleted_at IS NULL
    AND m.membership_status = 'active'
    AND m.stripe_subscription_id IS NULL
    AND p.email NOT LIKE '%@theclub.local'    -- skip claude seed accounts
    AND p.email NOT LIKE '%@demo.club'        -- skip demo seed accounts
    AND p.email NOT LIKE '%@sarahrestrick.com' -- skip dev seed accounts
`)
console.log(`${members.length} member(s) to check`)

for (const m of members) {
  console.log(`\n→ ${m.first_name} ${m.last_name} <${m.email}>`)

  // 1. Find Stripe customer by email
  const custList = await stripe(
    'GET',
    `/v1/customers?email=${encodeURIComponent(m.email)}&limit=10`,
  )
  if (!custList.data || custList.data.length === 0) {
    console.log('  ⚠ no Stripe customer found — skipping')
    continue
  }
  // If multiple customers with same email, pick the one with an active sub
  let chosenCustomer = null
  let chosenSub = null
  for (const cust of custList.data) {
    const subList = await stripe(
      'GET',
      `/v1/subscriptions?customer=${cust.id}&status=all&limit=10`,
    )
    const active = (subList.data ?? []).find(
      (s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due',
    )
    if (active) {
      chosenCustomer = cust
      chosenSub = active
      break
    }
    // If no active sub, remember the first customer as a fallback for the
    // customer-id link (still useful even without a live sub).
    if (!chosenCustomer) chosenCustomer = cust
  }

  if (!chosenCustomer) {
    console.log('  ⚠ no customer match — skipping')
    continue
  }
  console.log(`  ✓ customer: ${chosenCustomer.id}`)
  if (chosenSub) {
    console.log(`  ✓ subscription: ${chosenSub.id} (status: ${chosenSub.status})`)
  } else {
    console.log('  · no active subscription on this customer')
  }

  // 2. Update the member row
  const sets = [`stripe_customer_id = ${esc(chosenCustomer.id)}`]
  if (chosenSub) {
    sets.push(`stripe_subscription_id = ${esc(chosenSub.id)}`)
    // Renewal date — prefer Stripe's authoritative current_period_end
    // (the actual next-bill date). If Stripe didn't return one, fall
    // back to start + cadence using the sub's plan interval.
    let renewal = null
    if (chosenSub.current_period_end) {
      renewal = new Date(chosenSub.current_period_end * 1000).toISOString()
    } else if (chosenSub.metadata?.cadence) {
      const start = chosenSub.start_date
        ? new Date(chosenSub.start_date * 1000)
        : new Date()
      if (chosenSub.metadata.cadence === 'annual') {
        start.setFullYear(start.getFullYear() + 1)
      } else {
        start.setMonth(start.getMonth() + 1)
      }
      renewal = start.toISOString()
    }
    if (renewal) sets.push(`renewal_date = ${esc(renewal)}`)
  }
  await sql(`UPDATE members SET ${sets.join(', ')} WHERE id = ${esc(m.id)}`)
  console.log(`  ✓ member row updated`)

  // 3. Insert payment row for the initial subscription payment
  if (chosenSub) {
    // Find the most recent paid invoice for this subscription
    const invList = await stripe(
      'GET',
      `/v1/invoices?subscription=${chosenSub.id}&status=paid&limit=10`,
    )
    const firstPaid = (invList.data ?? []).sort(
      (a, b) => (a.created ?? 0) - (b.created ?? 0),
    )[0]

    if (firstPaid) {
      const desc = `Membership — initial payment (sub ${chosenSub.id})`
      const exists = await sql(
        `SELECT id FROM payments WHERE member_id = ${esc(m.id)} AND description = ${esc(desc)} LIMIT 1`,
      )
      if (exists.length === 0) {
        const paidAt = new Date((firstPaid.status_transitions?.paid_at ?? firstPaid.created) * 1000).toISOString()
        await sql(`
          INSERT INTO payments (
            member_id, amount_pence, currency,
            payment_type, payment_method, status,
            paid_at, stripe_invoice_id, description
          ) VALUES (
            ${esc(m.id)}, ${esc(firstPaid.amount_paid ?? 0)}, 'GBP',
            'membership', 'stripe', 'paid',
            ${esc(paidAt)}, ${esc(firstPaid.id)}, ${esc(desc)}
          )
        `)
        console.log(`  ✓ payment row inserted: £${((firstPaid.amount_paid ?? 0) / 100).toFixed(2)}`)
      } else {
        console.log('  · payment row already exists, skipped')
      }
    } else {
      console.log('  · no paid invoices found for this subscription')
    }
  }
}

console.log('\nDone.')
