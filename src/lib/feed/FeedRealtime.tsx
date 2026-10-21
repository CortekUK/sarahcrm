'use client'

// Feed + notifications realtime, layered on the chat socket (one Socket.IO
// connection — same server, same auth). Mounted inside ChatProvider in the
// portal and admin layouts. It:
//   - holds the in-app notification badge (`notifications:snapshot` is
//     authoritative; `notification:new` increments locally),
//   - patches the TanStack feed caches from feed:* events (never refetches a
//     whole feed),
//   - tracks which feed room is open so it can re-join + back-fill page one
//     after a reconnect.
// Renders children unchanged when chat is disabled.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useChat } from '@/lib/chat/ChatProvider'
import { chatClient } from '@/lib/http/chat-client'
import type {
  FeedCommentDeletedEvent,
  FeedCommentEvent,
  FeedLikeEvent,
  FeedPostDeletedEvent,
  FeedPostEvent,
  NotificationNewEvent,
  NotificationSnapshot,
} from '@/lib/chat/contract'
import { feedKeys } from './keys'
import {
  markNotificationsUnavailable,
  mergeLatestFeedPage,
  patchPost,
  prependNotification,
  removeComment,
  removePost,
  setReplyCount,
  upsertComment,
  upsertPost,
} from './cache'
import type { LocalFeedPage } from './types'

interface FeedRealtimeValue {
  /** unread in-app notifications (feed) */
  unreadNotifications: number
  setUnreadNotifications: (n: number | ((prev: number) => number)) => void
  /** the feed this tab has open (undefined = none, null = main) */
  openFeed: (groupId: string | null) => () => void
}

const Ctx = createContext<FeedRealtimeValue>({
  unreadNotifications: 0,
  setUnreadNotifications: () => {},
  openFeed: () => () => {},
})

export function useFeedRealtime() {
  return useContext(Ctx)
}

export function FeedRealtimeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { socket, viewer, enabled } = useChat()
  const [unread, setUnread] = useState(0)
  const openRef = useRef<{ groupId: string | null } | null>(null)
  const meRef = useRef<string | null>(null)
  meRef.current = viewer?.id ?? null

  useEffect(() => {
    if (!socket) return
    const s = socket
    let everConnected = s.connected

    function joinOpen() {
      const open = openRef.current
      if (open) s.emit('feed:open', { groupId: open.groupId }, () => {})
    }

    async function backfill(groupId: string | null) {
      try {
        const { data } = await chatClient.get<LocalFeedPage>('/feed', { params: { group: groupId ?? undefined, limit: 15 } })
        if (!mergeLatestFeedPage(qc, groupId, data)) qc.resetQueries({ queryKey: feedKeys.list(groupId) })
      } catch {
        /* offline again — next connect retries */
      }
    }

    const onConnect = () => {
      joinOpen()
      if (everConnected && openRef.current) void backfill(openRef.current.groupId)
      everConnected = true
    }

    const onPostNew = ({ post }: FeedPostEvent) => {
      // My own post's echo replaces the optimistic row (matched by clientId).
      upsertPost(qc, post, { insert: true, keepLiked: true })
    }
    const onPostUpdated = ({ post }: FeedPostEvent) => upsertPost(qc, post, { insert: !!post.hiddenAt || !!post.pinnedAt, keepLiked: true })
    const onPostDeleted = ({ postId }: FeedPostDeletedEvent) => {
      removePost(qc, postId)
      markNotificationsUnavailable(qc, postId)
      qc.invalidateQueries({ queryKey: feedKeys.post(postId), refetchType: 'active' })
    }
    const onCommentNew = ({ comment, commentCount, replyCount }: FeedCommentEvent) => {
      patchPost(qc, comment.postId, (p) => ({ ...p, commentCount }))
      if (comment.parentId && replyCount !== null) setReplyCount(qc, comment.postId, comment.parentId, replyCount)
      upsertComment(qc, comment, { insert: true })
    }
    const onCommentUpdated = ({ comment, commentCount, replyCount }: FeedCommentEvent) => {
      patchPost(qc, comment.postId, (p) => ({ ...p, commentCount }))
      if (comment.parentId && replyCount !== null) setReplyCount(qc, comment.postId, comment.parentId, replyCount)
      upsertComment(qc, comment, { insert: false })
    }
    const onCommentDeleted = (e: FeedCommentDeletedEvent) => {
      patchPost(qc, e.postId, (p) => ({ ...p, commentCount: e.commentCount }))
      if (e.parentId && e.replyCount !== null) setReplyCount(qc, e.postId, e.parentId, e.replyCount)
      removeComment(qc, { postId: e.postId, parentId: e.parentId, id: e.commentId })
    }
    const onLike = (e: FeedLikeEvent) => {
      patchPost(qc, e.postId, (p) => ({
        ...p,
        likeCount: e.likeCount,
        likedByMe: e.liked === undefined ? p.likedByMe : e.liked,
      }))
    }
    const onNotification = ({ notification }: NotificationNewEvent) => {
      prependNotification(qc, notification)
      if (!notification.readAt) setUnread((n) => n + 1)
    }
    const onSnapshot = (snap: NotificationSnapshot) => setUnread(Math.max(0, snap.unread ?? 0))

    s.on('connect', onConnect)
    s.on('feed:post:new', onPostNew)
    s.on('feed:post:updated', onPostUpdated)
    s.on('feed:post:deleted', onPostDeleted)
    s.on('feed:comment:new', onCommentNew)
    s.on('feed:comment:updated', onCommentUpdated)
    s.on('feed:comment:deleted', onCommentDeleted)
    s.on('feed:like', onLike)
    s.on('notification:new', onNotification)
    s.on('notifications:snapshot', onSnapshot)
    if (s.connected) joinOpen()

    return () => {
      s.off('connect', onConnect)
      s.off('feed:post:new', onPostNew)
      s.off('feed:post:updated', onPostUpdated)
      s.off('feed:post:deleted', onPostDeleted)
      s.off('feed:comment:new', onCommentNew)
      s.off('feed:comment:updated', onCommentUpdated)
      s.off('feed:comment:deleted', onCommentDeleted)
      s.off('feed:like', onLike)
      s.off('notification:new', onNotification)
      s.off('notifications:snapshot', onSnapshot)
    }
  }, [socket, qc])

  // Sign-out / chat off: drop the feed namespace and the badge.
  useEffect(() => {
    if (enabled) return
    qc.removeQueries({ queryKey: feedKeys.all })
    setUnread(0)
  }, [enabled, qc])

  const openFeed = useCallback(
    (groupId: string | null) => {
      openRef.current = { groupId }
      if (socket?.connected) socket.emit('feed:open', { groupId }, () => {})
      return () => {
        if (openRef.current?.groupId !== groupId) return
        openRef.current = null
        if (socket?.connected) socket.emit('feed:close', {}, () => {})
      }
    },
    [socket],
  )

  const value = useMemo<FeedRealtimeValue>(
    () => ({ unreadNotifications: unread, setUnreadNotifications: setUnread, openFeed }),
    [unread, openFeed],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Join the feed's socket room while the view is mounted (re-joined after reconnects). */
export function useFeedRoom(groupId: string | null, enabled = true) {
  const { openFeed } = useFeedRealtime()
  useEffect(() => {
    if (!enabled) return
    return openFeed(groupId)
  }, [groupId, enabled, openFeed])
}
