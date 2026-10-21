// Per-member introduction history for admin decision-making ("how many has
// this member had?"). Computed from the source tables — NOT the soft
// members.intros_used_this_month counter — in four grouped queries:
//
//   made     = member↔member introductions with sent_at set (either side)
//            + contact_intro_requests marked 'completed' (by handled_at)
//   pending  = introductions 'suggested' with requested_by = member
//            + contact_intro_requests 'pending' / 'approved'
//
// "This month" is the calendar month in Europe/London. Display-only: nothing
// in the platform is ever blocked by these numbers.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface IntroHistory {
  quota: number // members.monthly_intro_quota (0 = none set)
  thisMonth: number
  total: number
  pendingRequests: number
  lastIntroAt: string | null
}

export const MAX_HISTORY_IDS = 100

// UTC instant of 00:00 on the 1st of the current month, London time.
export function londonMonthStart(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const y = Number(parts.find((p) => p.type === 'year')?.value)
  const m = Number(parts.find((p) => p.type === 'month')?.value)
  const utcMidnight = new Date(Date.UTC(y, m - 1, 1))
  // London is UTC+0 or UTC+1; the hour London shows at UTC midnight is the offset.
  const londonHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(utcMidnight),
  )
  return new Date(utcMidnight.getTime() - londonHour * 3600_000)
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

export async function getIntroHistory(
  admin: SupabaseClient,
  memberIds: string[],
): Promise<Record<string, IntroHistory>> {
  const ids = [...new Set(memberIds)].slice(0, MAX_HISTORY_IDS)
  const out: Record<string, IntroHistory> = {}
  if (ids.length === 0) return out
  for (const id of ids) {
    out[id] = { quota: 0, thisMonth: 0, total: 0, pendingRequests: 0, lastIntroAt: null }
  }
  const monthStart = londonMonthStart().toISOString()
  const list = ids.join(',')

  const [membersRes, sentRes, suggestedRes, contactRes] = await Promise.all([
    admin.from('members').select('id, monthly_intro_quota').in('id', ids),
    admin
      .from('introductions')
      .select('member_a_id, member_b_id, sent_at')
      .not('sent_at', 'is', null)
      .or(`member_a_id.in.(${list}),member_b_id.in.(${list})`),
    admin
      .from('introductions')
      .select('requested_by')
      .eq('status', 'suggested')
      .in('requested_by', ids),
    admin
      .from('contact_intro_requests')
      .select('requester_member_id, status, handled_at')
      .in('requester_member_id', ids)
      .in('status', ['pending', 'approved', 'completed']),
  ])
  for (const r of [membersRes, sentRes, suggestedRes]) {
    if (r.error) throw r.error
  }
  // The contact table may not exist on an un-migrated database — treat as empty.
  if (contactRes.error) console.error('[intro-history] contact requests:', contactRes.error)

  for (const m of membersRes.data ?? []) {
    out[m.id].quota = (m.monthly_intro_quota as number | null) ?? 0
  }

  function countMade(memberId: string, at: string | null) {
    const h = out[memberId]
    if (!h) return
    h.total += 1
    if (at && at >= monthStart) h.thisMonth += 1
    h.lastIntroAt = later(h.lastIntroAt, at)
  }

  for (const row of sentRes.data ?? []) {
    const at = row.sent_at as string | null
    // Normalise to ISO so string comparison against monthStart is valid.
    const iso = at ? new Date(at).toISOString() : null
    countMade(row.member_a_id as string, iso)
    if (row.member_b_id !== row.member_a_id) countMade(row.member_b_id as string, iso)
  }
  for (const row of suggestedRes.data ?? []) {
    const h = out[row.requested_by as string]
    if (h) h.pendingRequests += 1
  }
  for (const row of contactRes.data ?? []) {
    const id = row.requester_member_id as string
    if (row.status === 'completed') {
      countMade(id, row.handled_at ? new Date(row.handled_at as string).toISOString() : null)
    } else if (out[id]) {
      out[id].pendingRequests += 1
    }
  }
  return out
}
