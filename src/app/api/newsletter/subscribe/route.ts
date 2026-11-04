// POST /api/newsletter/subscribe
//
// PUBLIC newsletter sign-up (the homepage form). Replaces the browser upsert
// into mailing_list, which needs an UPDATE permission visitors must not have.
// Server-side with the service-role key:
//   • validates + normalises (email lowercased; one subscriber per address
//     regardless of case — matched case-insensitively, never duplicated)
//   • a returning address is re-activated and its name refreshed instead of
//     failing on the unique email
//   • honeypot (`website` — hidden on the form; bots get a fake success),
//     per-IP limit + a global burst cap
//
// Body: { first_name, last_name, email, website? /* honeypot */ }
// Returns: { ok: true } or { ok: false, error }

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { clientIp, overLimit } from '@/lib/public-intake/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PER_IP_PER_10_MIN = 5
const MAX_GLOBAL_PER_10_MIN = 40

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (str(body.website)) return Response.json({ ok: true })

  const first_name = str(body.first_name)
  const last_name = str(body.last_name)
  const email = str(body.email).toLowerCase()
  if (!first_name || !last_name || !email) {
    return Response.json(
      { ok: false, error: 'First name, last name and email are required.' },
      { status: 400 },
    )
  }
  if (email.length > 254 || !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(email)) {
    return Response.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (first_name.length > 100 || last_name.length > 100) {
    return Response.json({ ok: false, error: 'Name is too long.' }, { status: 400 })
  }

  const tooMany = () =>
    Response.json(
      { ok: false, error: 'Too many sign-ups — please try again a little later.' },
      { status: 429 },
    )
  if (overLimit(`newsletter:${clientIp(request)}`, MAX_PER_IP_PER_10_MIN, 10 * 60_000)) {
    return tooMany()
  }

  const admin = getAdminDb()
  try {
    const since = new Date(Date.now() - 10 * 60_000).toISOString()
    const { count } = await admin
      .from('mailing_list')
      .select('id', { count: 'exact', head: true })
      .gte('subscribed_at', since)
    if ((count ?? 0) >= MAX_GLOBAL_PER_10_MIN) return tooMany()
  } catch (e) {
    console.error('[newsletter/subscribe] rate-limit check failed:', e)
  }

  // Case-insensitive lookup (escape ilike wildcards; `_` is common in emails).
  const { data: existing, error: findErr } = await admin
    .from('mailing_list')
    .select('id')
    .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
    .limit(1)
    .maybeSingle()
  if (findErr) {
    console.error('[newsletter/subscribe] lookup failed:', findErr)
    return Response.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  const now = new Date().toISOString()
  const { error } = existing
    ? await admin
        .from('mailing_list')
        .update({ first_name, last_name, unsubscribed_at: null, subscribed: true })
        .eq('id', existing.id)
    : await admin.from('mailing_list').insert({
        email,
        first_name,
        last_name,
        source: 'website',
        subscribed: true,
        subscribed_at: now,
      })
  if (error) {
    console.error('[newsletter/subscribe] write failed:', error)
    return Response.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
  return Response.json({ ok: true })
}
