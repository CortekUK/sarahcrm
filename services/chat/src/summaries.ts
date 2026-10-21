// Builds ConversationSummary / ConversationDetail from rows, batching every
// lookup per page (stats rpc, unread rpc, profiles, signed URLs) so a page of
// 20 costs a fixed handful of queries regardless of size.
import type { ChatMessage, ChatPerson, ConversationDetail, ConversationSummary } from './contract.js'
import type { ViewerContext } from './auth.js'
import { dmOtherId, isLocked, isReadOnly } from './policy.js'
import {
  attachmentPaths,
  personName,
  toMessage,
  toPerson,
  toPolicyConversation,
  type ConversationRow,
  type MessageRow,
  type ParticipantRow,
  type ProfileRow,
} from './rows.js'
import { conversationStats, listParticipants, myParticipations, type ConversationStats } from './repo/conversations.js'
import { unreadCounts } from './repo/messages.js'
import { blockDirection, blockedWith, getProfiles } from './repo/people.js'
import { signUrls } from './repo/storage.js'

const dmIds = (c: ConversationRow) => (c.dm_key ? c.dm_key.split(':') : [])

/** "A & B" title used when an overseer looks at someone else's DM. */
function pairTitle(c: ConversationRow, profiles: Map<string, ProfileRow>): string {
  return dmIds(c)
    .map((id) => profiles.get(id))
    .map((p) => (p ? personName(p) : 'Member'))
    .join(' & ')
}

export function titleFor(c: ConversationRow, viewerId: string | null, profiles: Map<string, ProfileRow>): {
  title: string
  otherPerson: ChatPerson | null
} {
  if (c.kind !== 'dm') return { title: c.title ?? 'Conversation', otherPerson: null }
  const otherId = viewerId ? dmOtherId(c.dm_key, viewerId) : null
  const other = otherId ? profiles.get(otherId) : undefined
  if (other) return { title: personName(other), otherPerson: toPerson(other) }
  return { title: pairTitle(c, profiles), otherPerson: null }
}

export async function buildSummaries(
  v: ViewerContext,
  rows: ConversationRow[],
  opts: { allParticipant?: boolean } = {},
): Promise<ConversationSummary[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const hasDm = rows.some((r) => r.kind === 'dm')
  const [stats, unread, parts, blocks, profiles] = await Promise.all([
    conversationStats(ids),
    unreadCounts(v.id),
    myParticipations(v.id, ids), // participation + muted flag
    hasDm ? blockedWith(v.id) : Promise.resolve(new Set<string>()),
    getProfiles(rows.flatMap(dmIds)),
  ])
  const urls = await signUrls(attachmentPaths([...stats.values()].map((s) => s.lastMessage)))
  const now = new Date()

  return rows.map((c) => {
    const isParticipant = opts.allParticipant ? true : parts.has(c.id)
    const otherId = dmOtherId(c.dm_key, v.id)
    const blocked = c.kind === 'dm' && !!otherId && blocks.has(otherId)
    const s = stats.get(c.id)
    const { title, otherPerson } = titleFor(c, v.id, profiles)
    return {
      id: c.id,
      kind: c.kind,
      title,
      avatarUrl: c.kind === 'dm' ? (otherPerson?.avatarUrl ?? null) : c.avatar_url,
      isMain: c.is_main,
      isJoinable: c.is_joinable,
      eventId: c.event_id,
      closesAt: c.closes_at,
      archivedAt: c.archived_at,
      readOnly: isReadOnly(v, toPolicyConversation(c), { isParticipant, blocked, now }),
      lastMessage: s?.lastMessage ? toMessage(s.lastMessage, urls) : null,
      lastMessageAt: c.last_message_at,
      unread: isParticipant ? (unread.byConversation[c.id] ?? 0) : 0,
      participantCount: s?.participantCount ?? 0,
      otherPerson,
      isParticipant,
      muted: !!parts.get(c.id)?.muted,
    }
  })
}

export async function buildDetail(v: ViewerContext, c: ConversationRow, me: ParticipantRow | null): Promise<ConversationDetail> {
  // DM extras are only for the two people in it — overseers get nulls/false.
  const otherId = c.kind === 'dm' && me ? dmOtherId(c.dm_key, v.id) : null
  const [[summary], parts, blocks] = await Promise.all([
    buildSummaries(v, [c]),
    listParticipants(c.id),
    otherId ? blockDirection(v.id, otherId) : Promise.resolve({ byMe: false, me: false }),
  ])
  const profiles = await getProfiles(parts.map((p) => p.profile_id))
  const participants = parts.flatMap((p) => {
    const prof = profiles.get(p.profile_id)
    return prof ? [{ ...toPerson(prof), role: p.role }] : []
  })
  const other = otherId ? parts.find((p) => p.profile_id === otherId) : undefined
  return {
    ...summary!,
    description: c.description,
    participants,
    myLastReadAt: me?.last_read_at ?? null,
    otherLastReadAt: other?.last_read_at ?? null,
    blockedByMe: blocks.byMe,
    blockedMe: blocks.me,
  }
}

/**
 * Perspective-free summary for broadcasts. unread is always 0 — clients
 * increment their own badge (see README "Unread strategy"). readOnly only
 * reflects conversation-level locks (archived / closed event).
 */
export function sharedSummary(
  c: ConversationRow,
  stats: { participantCount: number; lastMessage: ChatMessage | null },
): ConversationSummary {
  return {
    id: c.id,
    kind: c.kind,
    title: c.title ?? 'Conversation',
    avatarUrl: c.avatar_url,
    isMain: c.is_main,
    isJoinable: c.is_joinable,
    eventId: c.event_id,
    closesAt: c.closes_at,
    archivedAt: c.archived_at,
    readOnly: isLocked(toPolicyConversation(c)),
    lastMessage: stats.lastMessage,
    lastMessageAt: stats.lastMessage?.createdAt ?? c.last_message_at,
    unread: 0,
    participantCount: stats.participantCount,
    otherPerson: null,
    isParticipant: true,
    muted: false,
  }
}

/** Stats for one conversation, mapped to contract objects (used by conversation:updated). */
export async function oneStats(c: ConversationRow): Promise<{ participantCount: number; lastMessage: ChatMessage | null }> {
  const stats: Map<string, ConversationStats> = await conversationStats([c.id])
  const s = stats.get(c.id)
  const last: MessageRow | null = s?.lastMessage ?? null
  const urls = await signUrls(attachmentPaths([last]))
  return { participantCount: s?.participantCount ?? 0, lastMessage: last ? toMessage(last, urls) : null }
}
