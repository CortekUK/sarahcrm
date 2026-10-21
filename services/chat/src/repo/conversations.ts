// Conversation + participant access, including the lazy "ensure" upserts that
// keep the main group and event chats in step with members/bookings.
import { supabase, must } from '../supabase.js'
import { chunk, type ConversationRow, type MessageRow, type ParticipantRow } from '../rows.js'
import { eventPruneTargets, staleEventChats, type ParticipantRole } from '../policy.js'
import { log } from '../log.js'

const CONV_COLS =
  'id, kind, title, description, avatar_url, dm_key, event_id, is_main, is_joinable, created_by, closes_at, archived_at, last_message_at, created_at, updated_at'

export async function getConversation(id: string): Promise<ConversationRow | null> {
  const res = await supabase.from('chat_conversations').select(CONV_COLS).eq('id', id).maybeSingle()
  return must(res, 'conversation') as ConversationRow | null
}

export async function getConversationByDmKey(key: string): Promise<ConversationRow | null> {
  const res = await supabase.from('chat_conversations').select(CONV_COLS).eq('dm_key', key).maybeSingle()
  return must(res, 'dm conversation') as ConversationRow | null
}

/** Active (not left) participation row, or null. */
export async function getParticipant(conversationId: string, profileId: string): Promise<ParticipantRow | null> {
  const res = await supabase
    .from('chat_participants')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('profile_id', profileId)
    .is('left_at', null)
    .maybeSingle()
  return must(res, 'participant') as ParticipantRow | null
}

export async function listParticipants(conversationId: string): Promise<ParticipantRow[]> {
  const res = await supabase
    .from('chat_participants')
    .select('*')
    .eq('conversation_id', conversationId)
    .is('left_at', null)
    .order('joined_at', { ascending: true })
  return must(res, 'participants') as ParticipantRow[]
}

// Recipient lists are read on every message; a short cache keeps big groups
// cheap. Invalidated whenever this process changes participation.
const recipientCache = new Map<string, { ids: string[]; muted: Set<string>; at: number }>()
const RECIPIENT_TTL_MS = 30_000

/** Active participants + which of them muted it (for per-recipient summaries). */
export async function recipients(conversationId: string): Promise<{ ids: string[]; muted: Set<string> }> {
  const hit = recipientCache.get(conversationId)
  if (hit && Date.now() - hit.at < RECIPIENT_TTL_MS) return hit
  const res = await supabase
    .from('chat_participants')
    .select('profile_id, muted')
    .eq('conversation_id', conversationId)
    .is('left_at', null)
  const rows = must(res, 'participant ids') as { profile_id: string; muted: boolean }[]
  const entry = { ids: rows.map((r) => r.profile_id), muted: new Set(rows.filter((r) => r.muted).map((r) => r.profile_id)), at: Date.now() }
  recipientCache.set(conversationId, entry)
  if (recipientCache.size > 5000) recipientCache.clear()
  return entry
}

export async function participantIds(conversationId: string): Promise<string[]> {
  return (await recipients(conversationId)).ids
}

export async function setMuted(conversationId: string, profileId: string, muted: boolean): Promise<void> {
  must(
    await supabase
      .from('chat_participants')
      .update({ muted })
      .eq('conversation_id', conversationId)
      .eq('profile_id', profileId)
      .is('left_at', null),
    'mute',
  )
  invalidateRecipients(conversationId)
}

export function invalidateRecipients(conversationId: string) {
  recipientCache.delete(conversationId)
}

/** Which of `ids` the viewer actively participates in, with their row. */
export async function myParticipations(profileId: string, ids: string[]): Promise<Map<string, ParticipantRow>> {
  const out = new Map<string, ParticipantRow>()
  for (const part of chunk(ids, 150)) {
    const rows = must(
      await supabase
        .from('chat_participants')
        .select('*')
        .eq('profile_id', profileId)
        .in('conversation_id', part)
        .is('left_at', null),
      'my participations',
    ) as ParticipantRow[]
    for (const r of rows) out.set(r.conversation_id, r)
  }
  return out
}

export async function listConversations(args: {
  viewerId: string
  all: boolean
  kind: string | null
  q: string | null
  includeArchived: boolean
  after: { at: string | null; id: string } | null
  limit: number
}): Promise<ConversationRow[]> {
  const res = await supabase.rpc('chat_list_conversations', {
    p_viewer: args.viewerId,
    p_all: args.all,
    p_kind: args.kind,
    p_q: args.q,
    p_include_archived: args.includeArchived,
    p_has_cursor: !!args.after,
    p_after_at: args.after?.at ?? null,
    p_after_id: args.after?.id ?? null,
    p_limit: args.limit,
  })
  return must(res, 'chat_list_conversations') as ConversationRow[]
}

export interface ConversationStats {
  participantCount: number
  lastMessage: MessageRow | null
}

export async function conversationStats(ids: string[]): Promise<Map<string, ConversationStats>> {
  const out = new Map<string, ConversationStats>()
  if (!ids.length) return out
  const rows = must(await supabase.rpc('chat_conversation_stats', { p_ids: ids }), 'chat_conversation_stats') as {
    conversation_id: string
    participant_count: number
    last_message: MessageRow | null
  }[]
  for (const r of rows) out.set(r.conversation_id, { participantCount: r.participant_count, lastMessage: r.last_message })
  return out
}

/** Upsert participation. `rejoin` clears left_at (explicit join/add); otherwise existing rows are untouched. */
export async function upsertParticipants(
  conversationId: string,
  rows: { profileId: string; role: ParticipantRole; lastReadAt?: string | null }[],
  opts: { rejoin: boolean },
): Promise<void> {
  if (!rows.length) return
  for (const part of chunk(rows, 500)) {
    if (opts.rejoin) {
      // Merge only left_at so role/joined_at/last_read_at of existing rows survive.
      const existing = await myRows(conversationId, part.map((r) => r.profileId))
      const fresh = part.filter((r) => !existing.has(r.profileId))
      if (fresh.length) {
        must(
          await supabase.from('chat_participants').upsert(
            fresh.map((r) => ({ conversation_id: conversationId, profile_id: r.profileId, role: r.role, last_read_at: r.lastReadAt ?? null })),
            { onConflict: 'conversation_id,profile_id', ignoreDuplicates: true },
          ),
          'insert participants',
        )
      }
      const returning = part.filter((r) => existing.get(r.profileId)?.left_at)
      if (returning.length) {
        must(
          await supabase
            .from('chat_participants')
            .update({ left_at: null, joined_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .in('profile_id', returning.map((r) => r.profileId)),
          'rejoin participants',
        )
      }
    } else {
      must(
        await supabase.from('chat_participants').upsert(
          part.map((r) => ({ conversation_id: conversationId, profile_id: r.profileId, role: r.role, last_read_at: r.lastReadAt ?? null })),
          { onConflict: 'conversation_id,profile_id', ignoreDuplicates: true },
        ),
        'ensure participants',
      )
    }
  }
  invalidateRecipients(conversationId)
}

async function myRows(conversationId: string, profileIds: string[]): Promise<Map<string, ParticipantRow>> {
  const rows = must(
    await supabase.from('chat_participants').select('*').eq('conversation_id', conversationId).in('profile_id', profileIds),
    'participant rows',
  ) as ParticipantRow[]
  return new Map(rows.map((r) => [r.profile_id, r]))
}

export async function markLeft(conversationId: string, profileId: string): Promise<void> {
  must(
    await supabase
      .from('chat_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('profile_id', profileId)
      .is('left_at', null),
    'leave',
  )
  invalidateRecipients(conversationId)
}

export async function insertConversation(row: Partial<ConversationRow>): Promise<ConversationRow> {
  const res = await supabase.from('chat_conversations').insert(row).select(CONV_COLS).single()
  return must(res, 'create conversation') as ConversationRow
}

/** Find-or-create a DM by key (race-safe via the unique dm_key). */
export async function ensureDm(key: string, createdBy: string): Promise<{ conv: ConversationRow; created: boolean }> {
  const existing = await getConversationByDmKey(key)
  if (existing) return { conv: existing, created: false }
  const res = await supabase
    .from('chat_conversations')
    .upsert({ kind: 'dm', dm_key: key, created_by: createdBy }, { onConflict: 'dm_key', ignoreDuplicates: true })
    .select(CONV_COLS)
  const rows = must(res, 'create dm') as ConversationRow[]
  if (rows[0]) return { conv: rows[0], created: true }
  const raced = await getConversationByDmKey(key)
  if (!raced) throw new Error('dm create race')
  return { conv: raced, created: false }
}

export async function updateConversation(id: string, patch: Partial<ConversationRow>): Promise<ConversationRow> {
  const res = await supabase
    .from('chat_conversations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(CONV_COLS)
    .single()
  return must(res, 'update conversation') as ConversationRow
}

// ── Lazy ensure ─────────────────────────────────────────────

let mainCache: { id: string | null; at: number } | null = null

export async function mainGroupId(): Promise<string | null> {
  if (mainCache && Date.now() - mainCache.at < 5 * 60_000) return mainCache.id
  const res = await supabase.from('chat_conversations').select('id').eq('is_main', true).maybeSingle()
  const row = must(res, 'main group') as { id: string } | null
  mainCache = { id: row?.id ?? null, at: Date.now() }
  if (!row) log.warn('main_group_missing')
  return mainCache.id
}

/** New joiners start "read" at join time so they don't inherit the whole backlog as unread. */
export async function ensureMainMembership(profileId: string, role: ParticipantRole): Promise<void> {
  const id = await mainGroupId()
  if (!id) return
  await upsertParticipants(id, [{ profileId, role, lastReadAt: new Date().toISOString() }], { rejoin: false })
}

const EVENT_CHAT_STATUSES = ['published', 'live', 'completed']
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * One chat per event the member has a confirmed booking for; adds them as a
 * participant (re-joining a chat they'd left after a cancellation, if they've
 * re-booked) and leaves event chats whose booking is no longer confirmed.
 * Returns the conversations they left so the caller can notify them.
 */
export async function ensureEventChats(profileId: string, memberIds: string[]): Promise<{ left: string[] }> {
  if (!memberIds.length) return { left: [] }
  const bookings = must(
    await supabase.from('bookings').select('event_id').in('member_id', memberIds).eq('status', 'confirmed'),
    'bookings',
  ) as { event_id: string }[]
  const eventIds = [...new Set(bookings.map((b) => b.event_id).filter(Boolean))]
  const left = await leaveStaleEventChats(profileId, new Set(eventIds))
  if (!eventIds.length) return { left }

  for (const part of chunk(eventIds, 150)) {
    const events = must(
      await supabase
        .from('events')
        .select('id, title, status, start_date, end_date, cover_image_url')
        .in('id', part)
        .in('status', EVENT_CHAT_STATUSES),
      'events',
    ) as { id: string; title: string | null; start_date: string | null; end_date: string | null; cover_image_url: string | null }[]
    if (!events.length) continue

    must(
      await supabase.from('chat_conversations').upsert(
        events.map((e) => {
          const end = e.end_date ?? e.start_date
          return {
            kind: 'event',
            event_id: e.id,
            title: e.title ?? 'Event',
            avatar_url: e.cover_image_url,
            closes_at: end ? new Date(Date.parse(end) + WEEK_MS).toISOString() : null,
          }
        }),
        { onConflict: 'event_id', ignoreDuplicates: true },
      ),
      'ensure event chats',
    )

    const convs = must(
      await supabase.from('chat_conversations').select('id').in('event_id', events.map((e) => e.id)),
      'event chats',
    ) as { id: string }[]
    if (!convs.length) continue
    must(
      await supabase.from('chat_participants').upsert(
        convs.map((c) => ({ conversation_id: c.id, profile_id: profileId, role: 'member' })),
        { onConflict: 'conversation_id,profile_id', ignoreDuplicates: true },
      ),
      'ensure event participants',
    )
    // Re-booked after a cancellation → back in (one statement per chunk).
    must(
      await supabase
        .from('chat_participants')
        .update({ left_at: null, joined_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('role', 'member')
        .in('conversation_id', convs.map((c) => c.id))
        .not('left_at', 'is', null),
      'rejoin event participants',
    )
    for (const c of convs) invalidateRecipients(c.id)
  }
  return { left }
}

/** Leave (left_at = now) the viewer's event chats whose event they no longer have a confirmed booking for. */
async function leaveStaleEventChats(profileId: string, confirmedEventIds: Set<string>): Promise<string[]> {
  const rows = must(
    await supabase
      .from('chat_participants')
      .select('conversation_id, chat_conversations!inner(kind, event_id)')
      .eq('profile_id', profileId)
      .eq('role', 'member')
      .is('left_at', null)
      .eq('chat_conversations.kind', 'event'),
    'my event chats',
  ) as unknown as { conversation_id: string; chat_conversations: { event_id: string | null } | { event_id: string | null }[] }[]
  const mine = rows.map((r) => {
    const c = Array.isArray(r.chat_conversations) ? r.chat_conversations[0] : r.chat_conversations
    return { conversationId: r.conversation_id, eventId: c?.event_id ?? null }
  })
  const stale = staleEventChats(mine, confirmedEventIds)
  if (!stale.length) return []
  for (const part of chunk(stale, 150)) {
    must(
      await supabase
        .from('chat_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .in('conversation_id', part)
        .is('left_at', null),
      'leave stale event chats',
    )
  }
  for (const id of stale) invalidateRecipients(id)
  return stale
}

/**
 * Whole-conversation version, run when an event chat's detail is loaded:
 * every member participant without a confirmed booking for the event leaves.
 * Three cheap reads + one update per chunk, regardless of size. Returns who left.
 */
export async function pruneEventParticipants(c: { id: string; event_id: string | null }): Promise<string[]> {
  if (!c.event_id) return []
  const [parts, booked] = await Promise.all([
    supabase.from('chat_participants').select('profile_id, role').eq('conversation_id', c.id).is('left_at', null).eq('role', 'member'),
    supabase.from('bookings').select('members!inner(profile_id)').eq('event_id', c.event_id).eq('status', 'confirmed'),
  ])
  const participants = (must(parts, 'event participants') as { profile_id: string; role: ParticipantRole }[]).map((p) => ({
    profileId: p.profile_id,
    role: p.role,
  }))
  if (!participants.length) return []
  const confirmed = new Set(
    (must(booked, 'event bookings') as unknown as { members: { profile_id: string | null } | { profile_id: string | null }[] }[]).flatMap((b) =>
      (Array.isArray(b.members) ? b.members : [b.members]).flatMap((m) => (m?.profile_id ? [m.profile_id] : [])),
    ),
  )
  let targets = eventPruneTargets(participants, confirmed)
  if (!targets.length) return []
  const admins = must(
    await supabase.from('profiles').select('id').in('id', targets).eq('role', 'admin'),
    'admin check',
  ) as { id: string }[]
  targets = eventPruneTargets(
    participants.filter((p) => targets.includes(p.profileId)),
    confirmed,
    new Set(admins.map((a) => a.id)),
  )
  for (const part of chunk(targets, 150)) {
    must(
      await supabase
        .from('chat_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('conversation_id', c.id)
        .in('profile_id', part)
        .is('left_at', null),
      'prune event participants',
    )
  }
  invalidateRecipients(c.id)
  return targets
}
