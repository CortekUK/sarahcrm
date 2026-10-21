// Message reads/writes: keyset pages, de-duped inserts, soft delete, read
// pointers and unread counts.
import { supabase, must } from '../supabase.js'
import type { MessageRow, StoredAttachment } from '../rows.js'
import type { Cursor } from '../cursor.js'
import type { UnreadSnapshot } from '../contract.js'
import { unreadTotal } from '../policy.js'

const MSG_COLS = 'id, conversation_id, sender_id, kind, body, attachments, client_id, created_at, edited_at, deleted_at, deleted_by'

/** PostgREST logic-tree value quoting (timestamps contain ':' '.' '+'). */
const q = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** Newest first; fetches limit+1 so the caller can tell if there's more. */
export async function listMessages(conversationId: string, after: Cursor | null, limit: number): Promise<MessageRow[]> {
  let query = supabase
    .from('chat_messages')
    .select(MSG_COLS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (after?.key) {
    query = query.or(`created_at.lt.${q(after.key)},and(created_at.eq.${q(after.key)},id.lt.${after.id})`)
  }
  return must(await query, 'messages') as MessageRow[]
}

export async function getMessage(id: string): Promise<MessageRow | null> {
  return must(await supabase.from('chat_messages').select(MSG_COLS).eq('id', id).maybeSingle(), 'message') as MessageRow | null
}

export async function getMessages(ids: string[]): Promise<Map<string, MessageRow>> {
  if (!ids.length) return new Map()
  const rows = must(await supabase.from('chat_messages').select(MSG_COLS).in('id', ids), 'messages by id') as MessageRow[]
  return new Map(rows.map((r) => [r.id, r]))
}

/** Insert, or return the existing row for the same (sender_id, client_id). */
export async function insertMessage(row: {
  conversationId: string
  senderId: string
  body: string | null
  attachments: StoredAttachment[]
  clientId: string
  kind?: 'text' | 'system'
}): Promise<{ message: MessageRow; created: boolean }> {
  const res = await supabase
    .from('chat_messages')
    .upsert(
      {
        conversation_id: row.conversationId,
        sender_id: row.senderId,
        kind: row.kind ?? 'text',
        body: row.body,
        attachments: row.attachments,
        client_id: row.clientId,
      },
      { onConflict: 'sender_id,client_id', ignoreDuplicates: true },
    )
    .select(MSG_COLS)
  const inserted = must(res, 'insert message') as MessageRow[]
  if (inserted[0]) return { message: inserted[0], created: true }
  const existing = must(
    await supabase.from('chat_messages').select(MSG_COLS).eq('sender_id', row.senderId).eq('client_id', row.clientId).single(),
    'existing message',
  ) as MessageRow
  return { message: existing, created: false }
}

export async function softDelete(id: string, by: string): Promise<MessageRow> {
  const res = await supabase
    .from('chat_messages')
    .update({ deleted_at: new Date().toISOString(), deleted_by: by })
    .eq('id', id)
    .is('deleted_at', null)
    .select(MSG_COLS)
    .maybeSingle()
  const row = must(res, 'delete message') as MessageRow | null
  return row ?? ((await getMessage(id)) as MessageRow)
}

/** Move the read pointer forward only (never backwards). Returns true if it moved. */
export async function markRead(conversationId: string, profileId: string, at: string): Promise<boolean> {
  const res = await supabase
    .from('chat_participants')
    .update({ last_read_at: at })
    .eq('conversation_id', conversationId)
    .eq('profile_id', profileId)
    .is('left_at', null)
    .or(`last_read_at.is.null,last_read_at.lt.${q(at)}`)
    .select('conversation_id')
  return (must(res, 'mark read') as unknown[]).length > 0
}

/** Unread per conversation + badge total (muted conversations excluded from the total only). */
export async function unreadCounts(profileId: string): Promise<UnreadSnapshot> {
  const [counts, mutedRes] = await Promise.all([
    supabase.rpc('chat_unread_counts', { p_profile: profileId }),
    supabase.from('chat_participants').select('conversation_id').eq('profile_id', profileId).eq('muted', true).is('left_at', null),
  ])
  const rows = must(counts, 'chat_unread_counts') as { conversation_id: string; unread: number }[]
  const muted = (must(mutedRes, 'muted') as { conversation_id: string }[]).map((r) => r.conversation_id)
  const byConversation: Record<string, number> = {}
  for (const r of rows) if (r.unread > 0) byConversation[r.conversation_id] = r.unread
  return { total: unreadTotal(byConversation, new Set(muted)), byConversation, muted }
}
