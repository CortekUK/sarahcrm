// POST /api/admin/introductions/send
//
// Second stage of the match flow — now PER RECIPIENT. Each side (member_a,
// member_b) gets its own action so Sarah can send to one and not the other,
// or schedule them on different dates.
//
// Body: {
//   introduction_id,
//   a: { action: 'now' | 'schedule' | 'skip', date?: 'YYYY-MM-DD', subject, body },
//   b: { action: 'now' | 'schedule' | 'skip', date?: 'YYYY-MM-DD', subject, body },
// }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { fillIntroMergeTags, renderIntroEmail } from '@/lib/introductions/intro-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

type Action = 'now' | 'schedule' | 'skip'
interface SideInput {
  action?: Action
  date?: string
  subject?: string
  body?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return Response.json({ error: 'Admin only.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    introduction_id?: string
    a?: SideInput
    b?: SideInput
  }
  if (!body.introduction_id) {
    return Response.json({ error: 'introduction_id is required.' }, { status: 400 })
  }
  const sides = { a: body.a ?? {}, b: body.b ?? {} }

  // Validate each non-skip side has content; schedule needs a valid date.
  for (const key of ['a', 'b'] as const) {
    const s = sides[key]
    const action = s.action ?? 'skip'
    if (action === 'skip') continue
    if (!s.subject?.trim() || !s.body?.trim()) {
      return Response.json({ error: `The ${key === 'a' ? 'first' : 'second'} email needs a subject and message.` }, { status: 400 })
    }
    if (action === 'schedule' && (!s.date || !DATE_RE.test(s.date))) {
      return Response.json({ error: 'A valid date (YYYY-MM-DD) is required to schedule.' }, { status: 400 })
    }
    if (action !== 'now' && action !== 'schedule') {
      return Response.json({ error: 'Invalid action.' }, { status: 400 })
    }
  }

  const admin = getAdminDb()
  const { data: intro } = await admin
    .from('introductions')
    .select(
      'id, member_a_id, member_b_id, email_a_sent_at, email_b_sent_at, email_a_scheduled_at, email_b_scheduled_at, member_a_response, member_b_response, a:members!introductions_member_a_id_fkey(profiles(first_name, last_name, email)), b:members!introductions_member_b_id_fkey(profiles(first_name, last_name, email))',
    )
    .eq('id', body.introduction_id)
    .single()
  if (!intro) return Response.json({ error: 'Introduction not found.' }, { status: 404 })

  const prof = (m: unknown) =>
    (m as { profiles?: { first_name?: string | null; last_name?: string | null; email?: string | null } } | null)?.profiles ?? null
  const pa = prof(intro.a)
  const pb = prof(intro.b)
  const nameOf = (p: typeof pa) => `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'a fellow member'

  const { sendClubEmail } = await import('@/lib/email/club-email')
  const update: Record<string, unknown> = {}
  const results: Record<string, { action: Action; sent?: boolean; error?: string; scheduled_for?: string }> = {}

  // recipient = this side; "other" is who the email is about.
  const plan = [
    { key: 'a' as const, self: pa, other: pb, memberId: intro.member_a_id, response: intro.member_a_response },
    { key: 'b' as const, self: pb, other: pa, memberId: intro.member_b_id, response: intro.member_b_response },
  ]

  for (const p of plan) {
    const s = sides[p.key]
    const action: Action = s.action ?? 'skip'
    if (action === 'skip') {
      results[p.key] = { action }
      continue
    }
    // Persist the composed draft for this side.
    update[`email_${p.key}_subject`] = s.subject!.trim()
    update[`email_${p.key}_body`] = s.body!.trim()

    if (action === 'schedule') {
      update[`email_${p.key}_scheduled_at`] = s.date
      results[p.key] = { action, scheduled_for: s.date }
      continue
    }
    // action === 'now' — always sends (re-send after a decline is allowed).
    update[`email_${p.key}_scheduled_at`] = null
    if (!p.self?.email) {
      results[p.key] = { action, sent: false, error: 'No email on file.' }
      continue
    }
    const subject = fillIntroMergeTags(s.subject!.trim(), p.self, nameOf(p.other))
    const html = renderIntroEmail(nameOf(p.other), { subject, body: s.body!.trim() }, p.self)
    const r = await sendClubEmail({
      to: p.self.email,
      subject,
      html,
      category: 'introduction',
      memberId: p.memberId,
    })
    if (r.sent) {
      update[`email_${p.key}_sent_at`] = new Date().toISOString()
      // Re-sending to someone who declined gives them a fresh chance to respond.
      if (p.response === 'declined') {
        update[`member_${p.key}_response`] = 'pending'
        update[`member_${p.key}_responded_at`] = null
        update[`member_${p.key}_response_note`] = null
      }
    }
    results[p.key] = { action, sent: r.sent, error: r.error }
  }

  // Recompute overall status from the resulting per-side state.
  const aSent = Boolean(update['email_a_sent_at'] ?? intro.email_a_sent_at)
  const bSent = Boolean(update['email_b_sent_at'] ?? intro.email_b_sent_at)
  const aSched = update['email_a_scheduled_at'] !== undefined ? Boolean(update['email_a_scheduled_at']) : Boolean(intro.email_a_scheduled_at)
  const bSched = update['email_b_scheduled_at'] !== undefined ? Boolean(update['email_b_scheduled_at']) : Boolean(intro.email_b_scheduled_at)

  if (aSched || bSched) update.status = 'scheduled'
  else if (aSent || bSent) update.status = 'sent'

  if (Object.keys(update).length > 0) {
    await admin.from('introductions').update(update).eq('id', intro.id)
  }

  // First-send claim: sent_at is stamped by a CONDITIONAL update (only while
  // it is still NULL). Two send requests at once (one per side, or a double
  // click) can both reach here, but only one gets the row back — and only
  // that one counts the quota. The scheduled-send cron stamps sent_at too,
  // so an intro first sent by the cron is never counted again here.
  let firstSend = false
  if (aSent || bSent) {
    const { data: claimed } = await admin
      .from('introductions')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', intro.id)
      .is('sent_at', null)
      .select('id')
      .maybeSingle()
    firstSend = Boolean(claimed)
  }

  // Soft quota: the first time an introduction is actually sent, count it
  // against BOTH members' monthly allowance. This is display-only — it
  // never blocks a send (Sarah can always introduce). The counter is reset
  // monthly by the automations cron.
  let quotaWarning: string | null = null
  if (firstSend) {
    for (const memberId of [intro.member_a_id, intro.member_b_id]) {
      const r = await incrementIntroUsage(admin, memberId)
      if (r && r.quota > 0 && r.used > r.quota) {
        quotaWarning = `${r.firstName || 'A member'} is now over their monthly introduction allowance (${r.used}/${r.quota}).`
      }
    }
  }

  return Response.json({ ok: true, results, status: update.status ?? null, quotaWarning })
}

// +1 on members.intros_used_this_month without a lost update: compare-and-
// swap on the value we read (retry if another writer got in first). Swap
// for a single SQL increment RPC if one is added.
async function incrementIntroUsage(
  admin: ReturnType<typeof getAdminDb>,
  memberId: string,
): Promise<{ used: number; quota: number; firstName: string | null } | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: m } = await admin
      .from('members')
      .select('intros_used_this_month, monthly_intro_quota, profiles(first_name)')
      .eq('id', memberId)
      .maybeSingle()
    if (!m) return null
    const current = (m.intros_used_this_month as number | null) ?? 0
    const { data: swapped } = await admin
      .from('members')
      .update({ intros_used_this_month: current + 1 })
      .eq('id', memberId)
      .eq('intros_used_this_month', current)
      .select('id')
      .maybeSingle()
    if (swapped) {
      return {
        used: current + 1,
        quota: (m.monthly_intro_quota as number | null) ?? 0,
        firstName: (m.profiles as { first_name?: string } | null)?.first_name ?? null,
      }
    }
  }
  console.error('[introductions/send] could not bump intro usage for', memberId)
  return null
}
