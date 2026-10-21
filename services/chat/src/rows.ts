// DB row shapes (no generated types in this standalone service) and the
// mappers that turn them into contract objects.
import type { ChatAttachment, ChatMessage, ChatPerson } from './contract.js'
import type { PolicyConversation } from './policy.js'

export interface ProfileRow {
  id: string
  role: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  company_name: string | null
  job_title: string | null
}

export const PROFILE_COLS = 'id, role, first_name, last_name, avatar_url, company_name, job_title'

export interface ConversationRow {
  id: string
  kind: 'dm' | 'group' | 'event'
  title: string | null
  description: string | null
  avatar_url: string | null
  dm_key: string | null
  event_id: string | null
  is_main: boolean
  is_joinable: boolean
  created_by: string | null
  closes_at: string | null
  archived_at: string | null
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface ParticipantRow {
  conversation_id: string
  profile_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  last_read_at: string | null
  muted: boolean
  left_at: string | null
}

export interface StoredAttachment {
  path: string
  name: string
  mime: string
  size: number
  width?: number
  height?: number
}

export interface MessageRow {
  id: string
  conversation_id: string
  sender_id: string | null
  kind: 'text' | 'system'
  body: string | null
  attachments: StoredAttachment[] | null
  client_id: string | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  deleted_by: string | null
}

export function personName(p: Pick<ProfileRow, 'first_name' | 'last_name'>): string {
  const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  return name || 'Member'
}

export function toPerson(p: ProfileRow): ChatPerson {
  return {
    id: p.id,
    name: personName(p),
    avatarUrl: p.avatar_url,
    company: p.company_name,
    jobTitle: p.job_title,
    isAdmin: p.role === 'admin',
  }
}

export function toPolicyConversation(c: ConversationRow): PolicyConversation {
  return {
    kind: c.kind,
    isMain: c.is_main,
    isJoinable: c.is_joinable,
    archivedAt: c.archived_at,
    closesAt: c.closes_at,
  }
}

/** Deleted messages lose body + attachments in API output. */
export function toMessage(m: MessageRow, urls: Map<string, string>): ChatMessage {
  const deleted = !!m.deleted_at
  const attachments: ChatAttachment[] = deleted
    ? []
    : (m.attachments ?? []).map((a) => ({
        path: a.path,
        url: urls.get(a.path) ?? '',
        name: a.name,
        mime: a.mime,
        size: a.size,
        ...(a.width ? { width: a.width } : {}),
        ...(a.height ? { height: a.height } : {}),
      }))
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    kind: m.kind,
    body: deleted ? null : m.body,
    attachments,
    clientId: m.client_id,
    createdAt: m.created_at,
    editedAt: m.edited_at,
    deletedAt: m.deleted_at,
  }
}

export function attachmentPaths(rows: (MessageRow | null | undefined)[]): string[] {
  const out = new Set<string>()
  for (const r of rows) {
    if (!r || r.deleted_at) continue
    for (const a of r.attachments ?? []) out.add(a.path)
  }
  return [...out]
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}
