// Pure TanStack-cache patchers used by the socket handlers and optimistic
// sends. Socket events must PATCH what's cached — never trigger a refetch of
// every list/page — so all realtime updates funnel through these.

import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type {
  ChatMessage,
  ConversationDetail,
  ConversationPage,
  ConversationSummary,
} from './contract'
import { chatKeys } from './keys'
import type { LocalChatMessage, LocalMessagePage } from './types'

type MessagesData = InfiniteData<LocalMessagePage, string | null>
type ListData = InfiniteData<ConversationPage, string | null>

const sameMessage = (a: ChatMessage, b: ChatMessage) =>
  a.id === b.id || (!!a.clientId && a.clientId === b.clientId && a.senderId === b.senderId)

/**
 * Insert or replace a message in a conversation's paged cache. Optimistic rows
 * are matched by clientId so the server echo (ack or message:new, whichever
 * lands first) replaces them instead of duplicating.
 */
export function upsertMessage(qc: QueryClient, message: LocalChatMessage) {
  qc.setQueryData<MessagesData>(chatKeys.messages(message.conversationId), (data) => {
    if (!data) return data
    let found = false
    const pages = data.pages.map((p) => {
      const idx = p.messages.findIndex((m) => sameMessage(m, message))
      if (idx === -1) return p
      found = true
      const messages = p.messages.slice()
      // Keep the local preview attachments until the server row carries urls.
      messages[idx] = { ...message }
      return { ...p, messages }
    })
    if (!found) {
      const first = pages[0] ?? { messages: [], nextCursor: null }
      pages[0] = { ...first, messages: [message, ...first.messages] }
    }
    return { ...data, pages }
  })
}

export function patchMessage(
  qc: QueryClient,
  conversationId: string,
  match: (m: LocalChatMessage) => boolean,
  patch: Partial<LocalChatMessage>,
) {
  qc.setQueryData<MessagesData>(chatKeys.messages(conversationId), (data) => {
    if (!data) return data
    return {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        messages: p.messages.map((m) => (match(m) ? { ...m, ...patch } : m)),
      })),
    }
  })
}

export function removeMessage(qc: QueryClient, conversationId: string, match: (m: LocalChatMessage) => boolean) {
  qc.setQueryData<MessagesData>(chatKeys.messages(conversationId), (data) => {
    if (!data) return data
    return {
      ...data,
      pages: data.pages.map((p) => ({ ...p, messages: p.messages.filter((m) => !match(m)) })),
    }
  })
}

export function markMessageDeleted(qc: QueryClient, conversationId: string, messageId: string) {
  const deletedAt = new Date().toISOString()
  patchMessage(qc, conversationId, (m) => m.id === messageId, { deletedAt, body: null, attachments: [] })
  forEachList(qc, (data) => mapSummaries(data, (c) =>
    c.id === conversationId && c.lastMessage?.id === messageId
      ? { ...c, lastMessage: { ...c.lastMessage, deletedAt, body: null, attachments: [] } }
      : c,
  ))
}

/** Merge a freshly-fetched newest page into the cache (used after reconnect). */
export function mergeLatestPage(qc: QueryClient, conversationId: string, latest: LocalMessagePage): boolean {
  const data = qc.getQueryData<MessagesData>(chatKeys.messages(conversationId))
  if (!data) return true
  const known = new Set(data.pages.flatMap((p) => p.messages.map((m) => m.id)))
  const overlaps = latest.messages.some((m) => known.has(m.id))
  // No overlap → we missed more than a page; caller should reset instead.
  if (!overlaps && known.size > 0 && latest.nextCursor) return false
  for (const m of [...latest.messages].reverse()) if (!known.has(m.id)) upsertMessage(qc, m)
  return true
}

// ── Conversation lists ───────────────────────────────────────────────

function forEachList(qc: QueryClient, fn: (data: ListData, key: readonly unknown[]) => ListData) {
  for (const [key, data] of qc.getQueriesData<ListData>({ queryKey: chatKeys.conversationLists() })) {
    if (data) qc.setQueryData<ListData>(key, fn(data, key))
  }
}

function mapSummaries(data: ListData, fn: (c: ConversationSummary) => ConversationSummary): ListData {
  return {
    ...data,
    pages: data.pages.map((p) => ({ ...p, conversations: p.conversations.map(fn) })),
  }
}

function listParams(key: readonly unknown[]) {
  return (key[2] ?? {}) as { scope?: string; q?: string; kind?: string }
}

/**
 * Put a conversation at the top of every cached list it belongs in (or update
 * it in place). Filtered lists (search / kind) only update rows they already
 * hold, since we can't evaluate the server's search locally.
 */
export function upsertConversation(
  qc: QueryClient,
  summary: ConversationSummary,
  opts: { moveToTop?: boolean } = {},
) {
  forEachList(qc, (data, key) => {
    const { scope, q, kind } = listParams(key)
    const inList = data.pages.some((p) => p.conversations.some((c) => c.id === summary.id))
    const belongsInMine = summary.isParticipant && !summary.archivedAt
    if (scope !== 'all' && !belongsInMine) return removeFrom(data, summary.id)
    if (!inList && (q || (kind && kind !== summary.kind))) return data
    if (inList && !opts.moveToTop) {
      return mapSummaries(data, (c) => (c.id === summary.id ? { ...c, ...summary } : c))
    }
    const without = removeFrom(data, summary.id)
    const pages = without.pages.slice()
    const first = pages[0] ?? { conversations: [], nextCursor: null }
    pages[0] = { ...first, conversations: [summary, ...first.conversations] }
    return { ...without, pages }
  })
  qc.setQueryData<ConversationDetail>(chatKeys.conversation(summary.id), (d) => (d ? { ...d, ...summary } : d))
}

function removeFrom(data: ListData, id: string): ListData {
  return {
    ...data,
    pages: data.pages.map((p) => ({ ...p, conversations: p.conversations.filter((c) => c.id !== id) })),
  }
}

export function removeConversation(qc: QueryClient, id: string) {
  forEachList(qc, (data, key) => (listParams(key).scope === 'all' ? data : removeFrom(data, id)))
}

/** Find a summary anywhere in the cache (lists first, then detail). */
export function findConversation(qc: QueryClient, id: string): ConversationSummary | null {
  const detail = qc.getQueryData<ConversationDetail>(chatKeys.conversation(id))
  if (detail) return detail
  for (const [, data] of qc.getQueriesData<ListData>({ queryKey: chatKeys.conversationLists() })) {
    const hit = data?.pages.flatMap((p) => p.conversations).find((c) => c.id === id)
    if (hit) return hit
  }
  return null
}
