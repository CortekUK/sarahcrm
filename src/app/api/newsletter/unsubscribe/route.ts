// POST /api/newsletter/unsubscribe
//
// The confirm step behind the public /unsubscribe page. POST-only on purpose:
// mail security scanners pre-open (GET) every link in an email, so opening
// an unsubscribe link must never unsubscribe anyone — the page shows a
// "Confirm unsubscribe" button that calls this.
//
// Body: { token }             — newsletter subscriber (mailing_list token)
//    or { e, sig }            — member link (signed email, see
//                               src/lib/email/unsubscribe.ts)
// Returns: { ok: true, state: 'ok' | 'already', email } or { ok: false, error }

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { verifyMemberUnsubscribe } from '@/lib/email/unsubscribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  let body: { token?: unknown; e?: unknown; sig?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }
  const admin = getAdminDb()
  const now = new Date().toISOString()

  // ── Subscriber token ───────────────────────────────────────────
  if (typeof body?.token === 'string' && body.token) {
    if (!UUID_RE.test(body.token)) {
      return Response.json({ ok: false, error: 'This unsubscribe link is not valid.' }, { status: 404 })
    }
    const { data: row } = await admin
      .from('mailing_list')
      .select('id, email, unsubscribed_at')
      .eq('unsubscribe_token', body.token)
      .maybeSingle()
    if (!row) {
      return Response.json({ ok: false, error: 'This unsubscribe link is not valid.' }, { status: 404 })
    }
    if (row.unsubscribed_at) return Response.json({ ok: true, state: 'already', email: row.email })
    const { error } = await admin.from('mailing_list').update({ unsubscribed_at: now }).eq('id', row.id)
    if (error) {
      return Response.json({ ok: false, error: 'Could not unsubscribe. Please try again.' }, { status: 500 })
    }
    return Response.json({ ok: true, state: 'ok', email: row.email })
  }

  // ── Signed member link ─────────────────────────────────────────
  const email =
    typeof body?.e === 'string' && typeof body?.sig === 'string'
      ? verifyMemberUnsubscribe(body.e, body.sig)
      : null
  if (!email) {
    return Response.json({ ok: false, error: 'This unsubscribe link is not valid.' }, { status: 404 })
  }
  // Record the opt-out on the (case-insensitive) mailing_list row, creating a
  // suppression row if the member never subscribed to the newsletter.
  const { data: existing } = await admin
    .from('mailing_list')
    .select('id, unsubscribed_at')
    .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
    .limit(1)
    .maybeSingle()
  if (existing?.unsubscribed_at) return Response.json({ ok: true, state: 'already', email })
  const { error } = existing
    ? await admin.from('mailing_list').update({ unsubscribed_at: now }).eq('id', existing.id)
    : await admin
        .from('mailing_list')
        .insert({ email, source: 'member_unsubscribe', subscribed: false, unsubscribed_at: now })
  if (error) {
    return Response.json({ ok: false, error: 'Could not unsubscribe. Please try again.' }, { status: 500 })
  }
  return Response.json({ ok: true, state: 'ok', email })
}
