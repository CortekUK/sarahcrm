'use client'

// One Socket.IO connection per signed-in user, mounted in BOTH the portal and
// admin layouts (inside AuthProvider + QueryProvider). It:
//   - loads the viewer from GET /me (isOwner / isAdmin / canOversee),
//   - holds the unread map (authoritative `unread:snapshot`, plus local
//     increments on `message:new` — the event's summary is shared, so its
//     `unread` isn't per-recipient),
//   - patches the TanStack cache on message:new / message:deleted /
//     conversation:updated / read, and feeds typing + receipt stores,
//   - re-joins the open thread's room and back-fills it after a reconnect.
// With NEXT_PUBLIC_CHAT_URL unset it renders children with chat disabled.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { CHAT_URL, chatClient, chatEnabled, isChatAuthError } from '@/lib/http/chat-client'
import type {
  ChatPerson,
  ConversationUpdatedEvent,
  MessageDeletedEvent,
  MessageNewEvent,
  ReadEvent,
  TypingEvent,
  UnreadSnapshot,
  Viewer,
  ViewerUpdatedEvent,
  ConversationDetail,
} from './contract'
import { chatKeys } from './keys'
import { badgeTotal } from './merge'
import {
  findConversation,
  markMessageDeleted,
  mergeLatestPage,
  upsertConversation,
  upsertMessage,
} from './cache'
import type { LocalMessagePage, MeResponse } from './types'
import { clearTypingFor, resetChatStores, setReceipt, setTyping, sweepTyping } from './stores'

export type ChatConnection = 'disabled' | 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

interface ChatContextValue {
  /** NEXT_PUBLIC_CHAT_URL is set and someone is signed in. */
  enabled: boolean
  /** /me succeeded — the viewer may use chat. */
  ready: boolean
  viewer: Viewer | null
  me: ChatPerson | null
  meError: unknown
  socket: Socket | null
  connection: ChatConnection
  unread: Record<string, number>
  /** true once an unread:snapshot has arrived (then `unread` is authoritative). */
  hasSnapshot: boolean
  /** badge total — excludes muted conversations */
  totalUnread: number
  /** conversations the viewer muted */
  muted: ReadonlySet<string>
  setMutedLocal: (conversationId: string, muted: boolean) => void
  activeConversationId: string | null
  setActiveConversation: (id: string | null) => void
  /** Zero a conversation's unread locally (before the server snapshot confirms). */
  clearUnread: (conversationId: string) => void
}

const ChatContext = createContext<ChatContextValue>({
  enabled: false,
  ready: false,
  viewer: null,
  me: null,
  meError: null,
  socket: null,
  connection: 'disabled',
  unread: {},
  hasSnapshot: false,
  totalUnread: 0,
  muted: new Set(),
  setMutedLocal: () => {},
  activeConversationId: null,
  setActiveConversation: () => {},
  clearUnread: () => {},
})

const noopSubscribe = () => () => {}

// Per-consumer hydration guard. The provider's own mount flag isn't enough:
// a Suspense boundary can hydrate AFTER the provider's effects ran, and would
// then render chat UI the server never emitted. useSyncExternalStore reports
// the server snapshot (false) while each consumer is hydrating.
export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext)
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false)
  return hydrated ? ctx : { ...ctx, enabled: false, ready: false }
}

function isVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  // Only switch on after mount: the server never has a session, so enabling
  // during the first client render would hydrate chat UI the server didn't emit.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const enabled = mounted && chatEnabled && !!userId
  const qc = useQueryClient()

  const [socket, setSocket] = useState<Socket | null>(null)
  const [connection, setConnection] = useState<ChatConnection>(chatEnabled ? 'idle' : 'disabled')
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set())
  const setMutedLocal = useCallback((conversationId: string, on: boolean) => {
    setMuted((prev) => {
      if (prev.has(conversationId) === on) return prev
      const next = new Set(prev)
      if (on) next.add(conversationId)
      else next.delete(conversationId)
      return next
    })
  }, [])
  const [activeConversationId, setActiveId] = useState<string | null>(null)

  const activeRef = useRef<string | null>(null)
  const meIdRef = useRef<string | null>(null)

  const meQuery = useQuery({
    queryKey: chatKeys.me(),
    enabled,
    // Short + focus refetch so role / oversight changes land quickly (plus the
    // live `viewer:updated` push below).
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: (count, err) => !isChatAuthError(err) && count < 2,
    queryFn: async () => (await chatClient.get<MeResponse>('/me')).data,
  })
  const viewer = enabled ? meQuery.data?.viewer ?? null : null
  const me = viewer ? meQuery.data?.people?.[viewer.id] ?? null : null
  meIdRef.current = viewer?.id ?? userId
  const ready = !!viewer

  // ── Socket lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !ready) return
    const s = io(CHAT_URL, {
      // Callback form → every (re)connect sends the CURRENT access token.
      auth: (cb) => {
        supabase.auth.getSession().then((r) => cb({ token: r.data.session?.access_token }))
      },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 10_000,
    })
    let everConnected = false
    let authRetried = false
    setConnection('connecting')

    s.on('connect', () => {
      setConnection('connected')
      authRetried = false
      const active = activeRef.current
      if (active) s.emit('conversation:open', { conversationId: active }, () => {})
      if (everConnected) {
        // Back-fill what we missed while offline: newest page of the open
        // thread + the first page of each list. Never the whole history.
        if (active) void backfill(active)
        qc.invalidateQueries({ queryKey: chatKeys.conversationLists(), refetchType: 'active' })
      }
      everConnected = true
    })
    s.on('disconnect', (reason) => {
      // 'io client disconnect' = we closed it on purpose.
      setConnection(reason === 'io client disconnect' ? 'idle' : 'reconnecting')
    })
    s.on('connect_error', async (err) => {
      // Middleware rejections don't auto-retry; refresh the token once and go again.
      if (/unauthori[sz]ed/i.test(err.message) && !authRetried) {
        authRetried = true
        await supabase.auth.refreshSession().catch(() => null)
        s.connect()
        return
      }
      setConnection(s.active ? 'reconnecting' : 'error')
    })

    s.on('unread:snapshot', (snap: UnreadSnapshot) => {
      setUnread({ ...(snap.byConversation ?? {}) })
      if (Array.isArray(snap.muted)) setMuted(new Set(snap.muted))
      setHasSnapshot(true)
    })

    s.on('viewer:updated', ({ viewer: next }: ViewerUpdatedEvent) => {
      qc.setQueryData<MeResponse>(chatKeys.me(), (d) => (d ? { ...d, viewer: next } : d))
      if (!next.canOversee) {
        qc.removeQueries({ queryKey: chatKeys.conversations({ scope: 'all' }) })
        qc.removeQueries({ queryKey: ['chat', 'reports'] })
      }
    })

    s.on('message:new', ({ message, conversation }: MessageNewEvent) => {
      upsertMessage(qc, message)
      // Overseer-perspective copy (we're not in this chat): keep the scope=all
      // list live, never touch unread.
      if (!conversation.isParticipant) {
        upsertConversation(qc, { ...conversation, unread: 0 }, { moveToTop: true })
        return
      }
      const mine = message.senderId === meIdRef.current
      const watching = activeRef.current === message.conversationId && isVisible()
      if (message.senderId) clearTypingFor(message.conversationId, message.senderId)
      // The summary's `unread` is shared — never trust it; use our own map.
      const cached = findConversation(qc, conversation.id)
      const nextUnread = mine || watching ? 0 : (cached?.unread ?? 0) + 1
      if (!mine && !watching) {
        setUnread((prev) => ({
          ...prev,
          [message.conversationId]: (prev[message.conversationId] ?? cached?.unread ?? 0) + 1,
        }))
      }
      // The shared summary's readOnly only knows conversation-level locks; keep ours.
      upsertConversation(
        qc,
        { ...conversation, unread: nextUnread, readOnly: cached?.readOnly ?? conversation.readOnly },
        { moveToTop: true },
      )
      setMutedLocal(conversation.id, !!conversation.muted)
    })

    s.on('message:deleted', ({ conversationId, messageId }: MessageDeletedEvent) => {
      markMessageDeleted(qc, conversationId, messageId)
    })

    s.on('conversation:updated', ({ conversation }: ConversationUpdatedEvent) => {
      const cached = findConversation(qc, conversation.id)
      // isParticipant false = overseer copy (or we were removed) → no unread.
      const unreadNow = conversation.isParticipant ? cached?.unread ?? 0 : 0
      if (conversation.isParticipant) setMutedLocal(conversation.id, !!conversation.muted)
      upsertConversation(qc, { ...conversation, unread: unreadNow }, { moveToTop: !cached })
      // Participants / description live only on the detail — refresh just that one.
      qc.invalidateQueries({ queryKey: chatKeys.conversation(conversation.id), refetchType: 'active' })
    })

    s.on('typing', (e: TypingEvent) => {
      if (e.profileId === meIdRef.current) return
      setTyping(e.conversationId, e.profileId, e.name, e.isTyping)
    })

    s.on('read', (e: ReadEvent) => {
      setReceipt(e.conversationId, e.profileId, e.at)
      // DM receipts also arrive in our user room (thread closed) — keep the
      // detail's otherLastReadAt current so "Seen" is right when it opens.
      if (e.profileId !== meIdRef.current) {
        qc.setQueryData<ConversationDetail>(chatKeys.conversation(e.conversationId), (d) =>
          d && d.kind === 'dm' && (!d.otherLastReadAt || d.otherLastReadAt < e.at) ? { ...d, otherLastReadAt: e.at } : d,
        )
      }
    })

    async function backfill(conversationId: string) {
      try {
        const { data } = await chatClient.get<LocalMessagePage>(
          `/conversations/${conversationId}/messages`,
          { params: { limit: 30 } },
        )
        if (!mergeLatestPage(qc, conversationId, data)) {
          qc.resetQueries({ queryKey: chatKeys.messages(conversationId) })
        }
      } catch {
        /* offline again — the next connect retries */
      }
    }

    const sweep = setInterval(sweepTyping, 2000)
    setSocket(s)

    // A refreshed token only matters at handshake time; if we're currently
    // disconnected (e.g. rejected with an expired token), reconnect with it.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' && !s.connected) s.connect()
    })

    return () => {
      sub.subscription.unsubscribe()
      clearInterval(sweep)
      s.removeAllListeners()
      s.disconnect()
      setSocket(null)
      setConnection('idle')
    }
  }, [enabled, ready, qc, setMutedLocal])

  // ── Sign-out: drop everything chat-related ─────────────────────────
  useEffect(() => {
    if (userId) return
    qc.removeQueries({ queryKey: chatKeys.all })
    setUnread({})
    setMuted(new Set())
    setHasSnapshot(false)
    resetChatStores()
  }, [userId, qc])

  const setActiveConversation = useCallback(
    (id: string | null) => {
      const prev = activeRef.current
      if (prev === id) return
      activeRef.current = id
      setActiveId(id)
      if (!socket?.connected) return
      if (prev) socket.emit('conversation:close', { conversationId: prev }, () => {})
      if (id) socket.emit('conversation:open', { conversationId: id }, () => {})
    },
    [socket],
  )

  const clearUnread = useCallback((conversationId: string) => {
    setUnread((prev) => (prev[conversationId] ? { ...prev, [conversationId]: 0 } : prev))
  }, [])

  const totalUnread = useMemo(() => badgeTotal(unread, muted), [unread, muted])


  const value = useMemo<ChatContextValue>(
    () => ({
      enabled,
      ready,
      viewer,
      me,
      meError: meQuery.error,
      socket,
      connection: !chatEnabled ? 'disabled' : meQuery.isError ? 'error' : connection,
      unread,
      hasSnapshot,
      totalUnread,
      muted,
      setMutedLocal,
      activeConversationId,
      setActiveConversation,
      clearUnread,
    }),
    [
      enabled,
      ready,
      viewer,
      me,
      meQuery.error,
      meQuery.isError,
      socket,
      connection,
      unread,
      hasSnapshot,
      totalUnread,
      muted,
      setMutedLocal,
      activeConversationId,
      setActiveConversation,
      clearUnread,
    ],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

/** Unread count for one conversation — the live map once a snapshot exists. */
export function useUnreadFor(conversationId: string, fallback = 0): number {
  const { unread, hasSnapshot } = useChat()
  if (conversationId in unread) return unread[conversationId]
  return hasSnapshot ? 0 : fallback
}
