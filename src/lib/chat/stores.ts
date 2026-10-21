// Tiny external stores for high-frequency realtime state (typing indicators,
// DM read receipts). Kept out of React context so a "typing…" event re-renders
// only the thread that shows it, via useSyncExternalStore.

import { useSyncExternalStore } from 'react'

type Listener = () => void

function createStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<Listener>()
  return {
    get: () => state,
    set(next: T) {
      state = next
      listeners.forEach((l) => l())
    },
    subscribe(l: Listener) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

// conversationId → profileId → { name, until }
type TypingState = Record<string, Record<string, { name: string; until: number }>>
export const typingStore = createStore<TypingState>({})

const TYPING_TTL_MS = 6000

export function setTyping(conversationId: string, profileId: string, name: string, isTyping: boolean) {
  const prev = typingStore.get()
  const conv = { ...(prev[conversationId] ?? {}) }
  if (isTyping) conv[profileId] = { name, until: Date.now() + TYPING_TTL_MS }
  else delete conv[profileId]
  typingStore.set({ ...prev, [conversationId]: conv })
}

export function clearTypingFor(conversationId: string, profileId: string) {
  const conv = typingStore.get()[conversationId]
  if (conv?.[profileId]) setTyping(conversationId, profileId, '', false)
}

// Sweep expired typers so a dropped "stopped typing" event can't stick.
export function sweepTyping() {
  const now = Date.now()
  const prev = typingStore.get()
  let changed = false
  const next: TypingState = {}
  for (const [cid, people] of Object.entries(prev)) {
    const kept: TypingState[string] = {}
    for (const [pid, v] of Object.entries(people)) {
      if (v.until > now) kept[pid] = v
      else changed = true
    }
    next[cid] = kept
  }
  if (changed) typingStore.set(next)
}

const EMPTY: string[] = []
const typingCache = new Map<string, { src: unknown; names: string[] }>()

/** Names currently typing in a conversation (excluding `excludeId`). */
export function useTypingNames(conversationId: string | null, excludeId?: string | null): string[] {
  return useSyncExternalStore(
    typingStore.subscribe,
    () => {
      if (!conversationId) return EMPTY
      const conv = typingStore.get()[conversationId]
      const key = `${conversationId}:${excludeId ?? ''}`
      const cached = typingCache.get(key)
      if (cached && cached.src === conv) return cached.names
      const names = conv
        ? Object.entries(conv)
            .filter(([pid]) => pid !== excludeId)
            .map(([, v]) => v.name || 'Someone')
        : EMPTY
      typingCache.set(key, { src: conv, names })
      return names
    },
    () => EMPTY,
  )
}

// conversationId → profileId → ISO time they last read up to.
type ReceiptState = Record<string, Record<string, string>>
export const receiptStore = createStore<ReceiptState>({})

export function setReceipt(conversationId: string, profileId: string, at: string) {
  const prev = receiptStore.get()
  const cur = prev[conversationId]?.[profileId]
  if (cur && cur >= at) return
  receiptStore.set({ ...prev, [conversationId]: { ...(prev[conversationId] ?? {}), [profileId]: at } })
}

/** When `profileId` last read `conversationId` during this session, if known. */
export function useReceipt(conversationId: string | null, profileId: string | null | undefined): string | null {
  return useSyncExternalStore(
    receiptStore.subscribe,
    () => (conversationId && profileId ? receiptStore.get()[conversationId]?.[profileId] ?? null : null),
    () => null,
  )
}

export function resetChatStores() {
  typingStore.set({})
  receiptStore.set({})
}
