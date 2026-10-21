// Pure merge of a thread's cached pages into the render list. Pages are
// newest-first (page 0 = newest); the result is oldest → newest.
//
// A message can be in the cache more than once while a send is in flight —
// the optimistic row (id "local:<clientId>") and the server row (real id, same
// clientId), possibly in different pages after a back-fill. We collapse by id
// AND by sender+clientId, keeping the server row, so every rendered key
// (clientId || id) is unique.

import type { LocalChatMessage, LocalMessagePage } from './types'

const isLocal = (m: LocalChatMessage) => m.id.startsWith('local:') || !!m._status

export function flattenMessages(pages: LocalMessagePage[] | undefined): LocalChatMessage[] {
  if (!pages?.length) return []
  const byKey = new Map<string, LocalChatMessage>()
  const idToKey = new Map<string, string>()

  for (const page of pages) {
    for (const m of page.messages) {
      const key = m.clientId ? `c:${m.senderId ?? ''}:${m.clientId}` : `i:${m.id}`
      const existingKey = idToKey.get(m.id) ?? (byKey.has(key) ? key : undefined)
      if (existingKey) {
        const prev = byKey.get(existingKey)!
        // Server row wins over the optimistic one; otherwise first seen wins.
        if (isLocal(prev) && !isLocal(m)) byKey.set(existingKey, m)
        idToKey.set(m.id, existingKey)
        continue
      }
      byKey.set(key, m)
      idToKey.set(m.id, key)
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1,
  )
}

/** Stable React key for a rendered message (survives optimistic → server swap). */
export const messageKey = (m: LocalChatMessage) => (m.clientId ? `c:${m.clientId}` : `i:${m.id}`)

/** Header/sidebar badge: all unread except muted conversations (mirrors the server's snapshot total). */
export function badgeTotal(unread: Record<string, number>, muted: ReadonlySet<string>): number {
  let n = 0
  for (const [id, v] of Object.entries(unread)) if (v > 0 && !muted.has(id)) n += v
  return n
}
