// Reusable per-inbox Gmail sync engine.
//
// Extracted from the cron sync route so both the incremental cron sync and a
// future backfill module share one implementation. Each inbox is impersonated
// via gmailClient({ subject: mailbox }); its cursor (Gmail historyId) lives in
// app_settings key `gmail_sync_state` under a per-mailbox `cursors` map.
//
// Back-compat: the original single-inbox route stored `{ historyId }` (no
// `cursors`). We treat that legacy value as the cursor for the configured
// GOOGLE_WORKSPACE_SUBJECT and migrate it into the `cursors` map on the next
// write, so the switch to multi-inbox needs no data migration.
//
// Noise classification: when `opts.noiseFilter` is on, UNMATCHED rows that look
// automated/bulk (see lib/google/noise) are written with is_noise=true so they
// never become contact suggestions. A row matched to a member is ALWAYS
// is_noise=false — matching wins over the noise heuristic.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { gmailClient } from './client'
import {
  getMessage,
  getStartHistoryId,
  listAddedSince,
  listRecentMessageIds,
  type ParsedMessage,
} from './gmail'
import { isNoiseSender } from './noise'
import { resolveMembersByEmail } from './match'

type Db = SupabaseClient<Database>

const SEED_LIMIT = 150 // messages fetched on first run / re-seed
const BATCH_CAP = 200 // safety cap per run

const SYNC_STATE_KEY = 'gmail_sync_state'

// Shape of the persisted cursor state. `historyId` is the legacy single-inbox
// field kept only so we can read + migrate it.
interface SyncState {
  cursors?: Record<string, string>
  historyId?: string // legacy single-inbox cursor
}

// Reads the whole cursor state, folding a legacy `{ historyId }` value into the
// `cursors` map keyed by the configured GOOGLE_WORKSPACE_SUBJECT.
async function loadCursors(db: Db): Promise<Record<string, string>> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', SYNC_STATE_KEY)
    .maybeSingle()
  const v = (data?.value ?? null) as SyncState | null
  const cursors: Record<string, string> = { ...(v?.cursors ?? {}) }
  // Migrate legacy single-inbox cursor onto the default subject if present and
  // not already superseded by an explicit per-mailbox entry.
  const legacy = v?.historyId
  const defaultSubject = process.env.GOOGLE_WORKSPACE_SUBJECT
  if (legacy && defaultSubject && !cursors[defaultSubject]) {
    cursors[defaultSubject] = legacy
  }
  return cursors
}

// Persists a single mailbox's cursor, preserving every other mailbox's cursor
// and dropping the legacy `historyId` field (now migrated into `cursors`).
async function saveCursor(db: Db, mailbox: string, historyId: string): Promise<void> {
  const cursors = await loadCursors(db)
  cursors[mailbox] = historyId
  await db
    .from('app_settings')
    .upsert({ key: SYNC_STATE_KEY, value: { cursors } }, { onConflict: 'key' })
}

// Given the impersonated mailbox address, work out the counterpart (the other
// party) and the direction of the message.
function classify(
  msg: ParsedMessage,
  mailbox: string,
): { direction: 'inbound' | 'outbound'; counterpart: string | null } {
  const me = mailbox.toLowerCase()
  const outbound = msg.fromEmail === me
  if (outbound) {
    const counterpart = msg.to.find((t) => t !== me) ?? msg.to[0] ?? null
    return { direction: 'outbound', counterpart }
  }
  return { direction: 'inbound', counterpart: msg.fromEmail || null }
}

// Fetch → parse → match → upsert for a given set of message ids on one mailbox.
// Exported so the backfill module can reuse it. Skips individual message
// failures. When `opts.noiseFilter` is on, UNMATCHED automated/bulk senders are
// flagged is_noise=true; matched rows are always is_noise=false.
export async function processMessageIds(
  db: Db,
  gmail: ReturnType<typeof gmailClient>,
  mailbox: string,
  ids: string[],
  opts?: { noiseFilter?: boolean },
): Promise<{ fetched: number; upserted: number; matched: number }> {
  const capped = ids.slice(0, BATCH_CAP)

  // Fetch + parse each message.
  const parsed: ParsedMessage[] = []
  for (const id of capped) {
    try {
      parsed.push(await getMessage(gmail, id))
    } catch {
      /* skip individual failures */
    }
  }

  // Resolve counterparts → members in one batch.
  const classified = parsed.map((m) => ({ msg: m, ...classify(m, mailbox) }))
  const counterparts = classified
    .map((c) => c.counterpart)
    .filter((e): e is string => Boolean(e))
  const memberByEmail = await resolveMembersByEmail(db, counterparts)

  // Upsert rows (idempotent on gmail_message_id).
  let matched = 0
  const noiseFilter = Boolean(opts?.noiseFilter)
  const rows = classified.map(({ msg, direction, counterpart }) => {
    const memberId = counterpart ? memberByEmail.get(counterpart) ?? null : null
    if (memberId) matched++
    // Matching wins over the heuristic: a matched-member message is never noise.
    const is_noise = noiseFilter && !memberId && isNoiseSender(msg)
    return {
      gmail_message_id: msg.id,
      gmail_thread_id: msg.threadId,
      direction,
      from_email: msg.fromEmail || null,
      to_emails: msg.to,
      counterpart_email: counterpart,
      subject: msg.subject,
      snippet: msg.snippet,
      body_text: msg.bodyText,
      internal_date: msg.internalDate,
      member_id: memberId,
      mailbox,
      is_noise,
    }
  })
  if (rows.length) {
    await db.from('gmail_messages').upsert(rows, { onConflict: 'gmail_message_id' })
  }

  return { fetched: parsed.length, upserted: rows.length, matched }
}

// Incrementally syncs a single inbox: reads its cursor, fetches new messages
// (or seeds on first run / re-seeds on an expired cursor), processes them, and
// advances the cursor to the mailbox's current historyId.
export async function syncInboxIncremental(
  db: Db,
  mailbox: string,
  opts?: { noiseFilter?: boolean },
): Promise<{ fetched: number; upserted: number; matched: number; reseeded: boolean }> {
  const gmail = gmailClient({ subject: mailbox })

  // 1. Determine which message ids to fetch for this mailbox.
  const cursors = await loadCursors(db)
  const cursor = cursors[mailbox] ?? null
  let ids: string[]
  let reseeded = false
  if (!cursor) {
    ids = await listRecentMessageIds(gmail, SEED_LIMIT)
    reseeded = true
  } else {
    const res = await listAddedSince(gmail, cursor)
    if (res.expired) {
      ids = await listRecentMessageIds(gmail, SEED_LIMIT)
      reseeded = true
    } else {
      ids = res.ids
    }
  }

  // 2. Fetch → parse → match → upsert.
  const counts = await processMessageIds(db, gmail, mailbox, ids, opts)

  // 3. Advance this mailbox's cursor to its current historyId (preserving
  //    every other mailbox's cursor).
  const latest = await getStartHistoryId(gmail)
  if (latest) await saveCursor(db, mailbox, latest)

  return { ...counts, reseeded }
}
