// Per-member email OPEN engagement, derived from the send logs.
//
// Used by the Member Success "Not opening emails" flag. There is no stored
// last_email_opened_at column — it is derived on read from:
//   • email_log       (automations, transactional, campaign mirror) —
//                      opened_at, stamped by the Resend webhook
//   • communications  (template/campaign sends) — opened_at, same webhook
// Campaign sends are logged in BOTH tables with the same resend_message_id, so
// rows are de-duplicated on that id.
//
// Degrades gracefully: opens only exist once open tracking is enabled on the
// Resend domain. We treat tracking as "live since" the send time of the
// EARLIEST email (inside the window) that has an open recorded; emails sent
// before that are ignored, and if nothing in the window was ever opened we
// return trackingSince = null so the caller raises no flag at all — instead
// of flagging every member while tracking is off.
//
// Batch queries only (never per member). Never throws — any error yields
// "no data" (trackingSince = null).

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, 'public', any>

export interface MemberEmailEngagement {
  sent: number
  opened: number
  // Latest open inside the window (null = none recorded in the window).
  lastOpenedAt: string | null
}

export interface EmailEngagementResult {
  // Null = no open data in the window → open tracking looks off; don't flag.
  trackingSince: string | null
  byMember: Map<string, MemberEmailEngagement>
}

const PAGE = 1000
const ID_CHUNK = 200

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Earliest send time (created_at / sent_at) of an opened email since `sinceIso`.
async function earliestOpenedSend(db: Db, sinceIso: string): Promise<string | null> {
  const [logRes, commsRes] = await Promise.all([
    db
      .from('email_log')
      .select('created_at')
      .not('opened_at', 'is', null)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(1),
    db
      .from('communications')
      .select('sent_at')
      .not('opened_at', 'is', null)
      .not('sent_at', 'is', null)
      .gte('sent_at', sinceIso)
      .order('sent_at', { ascending: true })
      .limit(1),
  ])
  const candidates = [
    logRes.error ? null : ((logRes.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null),
    commsRes.error ? null : ((commsRes.data?.[0] as { sent_at?: string } | undefined)?.sent_at ?? null),
  ].filter((v): v is string => !!v)
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (new Date(a) <= new Date(b) ? a : b))
}

export async function loadEmailEngagement(
  db: Db,
  memberIds: string[],
  windowDays: number,
): Promise<EmailEngagementResult> {
  const byMember = new Map<string, MemberEmailEngagement>()
  try {
    if (memberIds.length === 0) return { trackingSince: null, byMember }
    const windowStart = new Date(Date.now() - windowDays * 86_400_000).toISOString()
    const trackingSince = await earliestOpenedSend(db, windowStart)
    if (!trackingSince) return { trackingSince: null, byMember }

    // One entry per real email (dedup key = Resend id, else the row id).
    const emails = new Map<string, { memberId: string; openedAt: string | null }>()
    const add = (key: string, memberId: string, openedAt: string | null) => {
      const prev = emails.get(key)
      if (!prev) emails.set(key, { memberId, openedAt })
      else if (!prev.openedAt && openedAt) prev.openedAt = openedAt
    }

    for (const ids of chunk(memberIds, ID_CHUNK)) {
      // email_log — sent mail only (failed/bounced can never be opened).
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from('email_log')
          .select('id, member_id, opened_at, resend_message_id')
          .in('member_id', ids)
          .gte('created_at', trackingSince)
          .not('status', 'in', '(failed,bounced)')
          .order('created_at', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) return { trackingSince: null, byMember: new Map() }
        const rows = (data ?? []) as {
          id: string
          member_id: string
          opened_at: string | null
          resend_message_id: string | null
        }[]
        for (const r of rows) add(r.resend_message_id ?? `log:${r.id}`, r.member_id, r.opened_at)
        if (rows.length < PAGE) break
      }

      // communications — actually-sent template/campaign mail.
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from('communications')
          .select('id, member_id, opened_at, resend_message_id')
          .in('member_id', ids)
          .eq('channel', 'email')
          .not('sent_at', 'is', null)
          .gte('sent_at', trackingSince)
          .not('status', 'in', '(draft,failed,bounced)')
          .order('sent_at', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) break // communications is a bonus source; email_log suffices
        const rows = (data ?? []) as {
          id: string
          member_id: string
          opened_at: string | null
          resend_message_id: string | null
        }[]
        for (const r of rows) add(r.resend_message_id ?? `comm:${r.id}`, r.member_id, r.opened_at)
        if (rows.length < PAGE) break
      }
    }

    for (const { memberId, openedAt } of emails.values()) {
      const e = byMember.get(memberId) ?? { sent: 0, opened: 0, lastOpenedAt: null }
      e.sent += 1
      if (openedAt) {
        e.opened += 1
        if (!e.lastOpenedAt || new Date(openedAt) > new Date(e.lastOpenedAt)) {
          e.lastOpenedAt = openedAt
        }
      }
      byMember.set(memberId, e)
    }
    return { trackingSince, byMember }
  } catch (e) {
    console.error('[email-engagement] load failed:', e)
    return { trackingSince: null, byMember: new Map() }
  }
}
