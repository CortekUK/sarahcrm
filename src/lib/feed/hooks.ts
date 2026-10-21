'use client'

// Member Feed hooks. Everything paged is a keyset `useInfiniteQuery`:
//   feed 15/page (pinned on page one only), top-level comments 20/page
//   (newest first, "View older" loads the next page), replies 10/page (oldest
//   first, behind "View N replies"), notifications 20/page.
// Mutations are optimistic where it matters (posting, liking, commenting) and
// patch the cache instead of refetching; socket events (FeedRealtime) keep
// other viewers and tabs in step.

import { useCallback, useMemo } from 'react'
import axios from 'axios'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chatClient, getApiErrorMessage } from '@/lib/http/chat-client'
import { useChat } from '@/lib/chat/ChatProvider'
import type {
  FeedComment,
  FeedImage,
  FeedLikeResult,
  FeedPost,
  NotificationPage,
  NotificationSnapshot,
  UploadTicket,
} from '@/lib/chat/contract'
import { readImageSize, validateAttachment } from '@/lib/chat/hooks/useUploadAttachment'
import { feedKeys } from './keys'
import {
  findPost,
  flattenComments,
  flattenPosts,
  markNotificationsReadLocal,
  patchLocalComment,
  patchLocalPost,
  patchPost,
  prependPost,
  removeComment,
  removeLocalPost,
  removePost,
  upsertComment,
  upsertPost,
} from './cache'
import { useFeedRealtime } from './FeedRealtime'
import type { LocalCommentPage, LocalFeedComment, LocalFeedPage, LocalFeedPost } from './types'

export const FEED_PAGE_SIZE = 15
export const COMMENT_PAGE_SIZE = 20
export const REPLY_PAGE_SIZE = 10
export const NOTIFICATION_PAGE_SIZE = 20
export const MAX_POST_IMAGES = 4
export const MAX_POST_BODY = 5000
export const MAX_COMMENT_BODY = 2000

export { validateAttachment as validateFeedImage }

function newClientId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// ── Reads ────────────────────────────────────────────────────────────

export function useFeed(groupId: string | null) {
  const { ready } = useChat()
  const query = useInfiniteQuery({
    queryKey: feedKeys.list(groupId),
    enabled: ready,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) =>
      (
        await chatClient.get<LocalFeedPage>('/feed', {
          signal,
          params: { group: groupId ?? undefined, limit: FEED_PAGE_SIZE, cursor: pageParam ?? undefined },
        })
      ).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Socket events patch this live; a refetch would re-request every page.
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })
  const flat = useMemo(() => flattenPosts(query.data?.pages), [query.data])
  return { ...query, ...flat }
}

/** One post (detail modal / deep link). Seeds from any cached feed first. */
export function usePost(postId: string | null) {
  const { ready } = useChat()
  const qc = useQueryClient()
  return useQuery({
    queryKey: feedKeys.post(postId ?? ''),
    enabled: ready && !!postId,
    retry: (n, err) => !(axios.isAxiosError(err) && (err.response?.status === 404 || err.response?.status === 403)) && n < 1,
    initialData: () => (postId ? (findPost(qc, postId) ?? undefined) : undefined),
    staleTime: 30_000,
    queryFn: async ({ signal }) => (await chatClient.get<LocalFeedPost>(`/feed/posts/${postId}`, { signal })).data,
  })
}

export function useComments(postId: string, enabled: boolean) {
  const { ready } = useChat()
  const query = useInfiniteQuery({
    queryKey: feedKeys.comments(postId),
    enabled: ready && enabled && !postId.startsWith('local:'),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) =>
      (
        await chatClient.get<LocalCommentPage>(`/feed/posts/${postId}/comments`, {
          signal,
          params: { limit: COMMENT_PAGE_SIZE, cursor: pageParam ?? undefined },
        })
      ).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })
  const comments = useMemo(() => flattenComments(query.data?.pages), [query.data])
  return { ...query, comments }
}

export function useReplies(commentId: string, enabled: boolean) {
  const { ready } = useChat()
  const query = useInfiniteQuery({
    queryKey: feedKeys.replies(commentId),
    enabled: ready && enabled && !commentId.startsWith('local:'),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) =>
      (
        await chatClient.get<LocalCommentPage>(`/feed/comments/${commentId}/replies`, {
          signal,
          params: { limit: REPLY_PAGE_SIZE, cursor: pageParam ?? undefined },
        })
      ).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })
  const replies = useMemo(() => flattenComments(query.data?.pages), [query.data])
  return { ...query, replies }
}

export function useNotifications(enabled: boolean) {
  const { ready } = useChat()
  const { setUnreadNotifications } = useFeedRealtime()
  const query = useInfiniteQuery({
    queryKey: feedKeys.notifications(),
    enabled: ready && enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await chatClient.get<NotificationPage>('/notifications', {
        signal,
        params: { limit: NOTIFICATION_PAGE_SIZE, cursor: pageParam ?? undefined },
      })
      if (!pageParam) setUnreadNotifications(data.unread)
      return data
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  })
  const notifications = useMemo(() => query.data?.pages.flatMap((p) => p.notifications) ?? [], [query.data])
  return { ...query, notifications }
}

// ── Posting ──────────────────────────────────────────────────────────

/** Signed upload into feed-media for this feed (POST /feed/uploads, then PUT with progress). */
export async function uploadFeedImage(groupId: string | null, file: File, onProgress?: (f: number) => void) {
  const problem = validateAttachment(file)
  if (problem) throw new Error(problem)
  const [{ data: ticket }, size] = await Promise.all([
    chatClient.post<UploadTicket>('/feed/uploads', { groupId, name: file.name, mime: file.type, size: file.size }),
    readImageSize(file),
  ])
  const form = new FormData()
  form.append('cacheControl', '3600')
  form.append('', file)
  await axios.put(ticket.signedUrl, form, {
    headers: { 'x-upsert': 'false' },
    onUploadProgress: (e) => {
      if (e.total) onProgress?.(e.loaded / e.total)
    },
  })
  onProgress?.(1)
  return { path: ticket.path, mime: file.type, size: file.size, ...size }
}

export interface PostInput {
  body: string
  files: File[]
}

/**
 * Optimistic create: the post appears at the top instantly with local photo
 * previews + upload progress; the server row (REST response or the socket
 * echo, whichever lands first) replaces it by clientId. Failures stay in the
 * feed with Retry / Discard; a retry re-sends the SAME clientId (server de-dupes).
 */
export function useCreatePost(groupId: string | null) {
  const qc = useQueryClient()
  const { viewer, me } = useChat()

  const run = useCallback(
    async (input: PostInput, existingClientId?: string) => {
      if (!viewer) return
      const body = input.body.trim()
      const files = input.files
      if (!body && !files.length) return
      const clientId = existingClientId ?? newClientId()
      const optimistic: LocalFeedPost = {
        id: `local:${clientId}`,
        groupId,
        authorId: viewer.id,
        author: me,
        body,
        images: files.map((f) => ({ path: '', url: URL.createObjectURL(f), mime: f.type, size: f.size })),
        clientId,
        pinnedAt: null,
        hiddenAt: null,
        editedAt: null,
        createdAt: new Date().toISOString(),
        likeCount: 0,
        commentCount: 0,
        likedByMe: false,
        mentions: [],
        _status: 'sending',
        _progress: files.map(() => 0),
        _files: files,
      }
      prependPost(qc, optimistic)
      const previews = optimistic.images.map((i) => i.url)
      try {
        const progress = files.map(() => 0)
        const images = await Promise.all(
          files.map((f, i) =>
            uploadFeedImage(groupId, f, (frac) => {
              progress[i] = frac
              patchLocalPost(qc, groupId, clientId, { _progress: progress.slice() })
            }),
          ),
        )
        const { data } = await chatClient.post<FeedPost>('/feed/posts', { groupId, body, images, clientId })
        upsertPost(qc, data, { insert: true })
        setTimeout(() => previews.forEach((u) => URL.revokeObjectURL(u)), 4000)
      } catch (err) {
        patchLocalPost(qc, groupId, clientId, { _status: 'failed', _error: getApiErrorMessage(err, 'Your post wasn’t shared.') })
      }
    },
    [qc, viewer, me, groupId],
  )

  const create = useCallback((input: PostInput) => run(input), [run])
  const retry = useCallback(
    (p: LocalFeedPost) => {
      if (!p.clientId) return
      p.images.forEach((i) => i.url.startsWith('blob:') && URL.revokeObjectURL(i.url))
      return run({ body: p.body, files: p._files ?? [] }, p.clientId)
    },
    [run],
  )
  const discard = useCallback(
    (p: LocalFeedPost) => {
      p.images.forEach((i) => i.url.startsWith('blob:') && URL.revokeObjectURL(i.url))
      if (p.clientId) removeLocalPost(qc, p.groupId, p.clientId)
    },
    [qc],
  )
  return { create, retry, discard }
}

export function useEditPost() {
  const qc = useQueryClient()
  return useMutation({
    /** `images` = the full new list (kept + uploaded), in order; omit to leave photos alone. */
    mutationFn: async (v: { id: string; body: string; images?: Omit<FeedImage, 'url'>[] }) =>
      (await chatClient.patch<FeedPost>(`/feed/posts/${v.id}`, { body: v.body, ...(v.images ? { images: v.images } : {}) })).data,
    onSuccess: (post) => upsertPost(qc, post, { keepLiked: true }),
  })
}

export function useDeletePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => (await chatClient.delete(`/feed/posts/${id}`)).data,
    onSuccess: (_d, id) => removePost(qc, id),
  })
}

/** Moderators: pin / unpin, hide / unhide. */
export function useModeratePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; pinned?: boolean; hidden?: boolean }) => {
      const { id, ...body } = v
      return (await chatClient.post<FeedPost>(`/feed/posts/${id}/moderate`, body)).data
    },
    onSuccess: (post) => upsertPost(qc, post, { insert: true, keepLiked: true }),
  })
}

/** Optimistic like toggle; the server's count wins when it answers. */
export function useLikePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; liked: boolean }) =>
      (await chatClient.post<FeedLikeResult>(`/feed/posts/${v.id}/like`, { liked: v.liked })).data,
    onMutate: (v) => {
      patchPost(qc, v.id, (p) =>
        p.likedByMe === v.liked ? p : { ...p, likedByMe: v.liked, likeCount: Math.max(0, p.likeCount + (v.liked ? 1 : -1)) },
      )
    },
    onError: (_e, v) => {
      patchPost(qc, v.id, (p) =>
        p.likedByMe !== v.liked ? p : { ...p, likedByMe: !v.liked, likeCount: Math.max(0, p.likeCount + (v.liked ? -1 : 1)) },
      )
    },
    onSuccess: (res, v) => patchPost(qc, v.id, (p) => ({ ...p, likedByMe: res.liked, likeCount: res.likeCount })),
  })
}

// ── Comments ─────────────────────────────────────────────────────────

/** Optimistic comment / reply (keyed by clientId); failures stay with Retry. */
export function useAddComment(postId: string) {
  const qc = useQueryClient()
  const { viewer, me } = useChat()
  return useCallback(
    async (input: { body: string; parentId: string | null }, existingClientId?: string) => {
      if (!viewer) return
      const body = input.body.trim()
      if (!body) return
      const clientId = existingClientId ?? newClientId()
      const scope = { postId, parentId: input.parentId }
      const optimistic: LocalFeedComment = {
        id: `local:${clientId}`,
        postId,
        parentId: input.parentId,
        authorId: viewer.id,
        author: me,
        body,
        clientId,
        hiddenAt: null,
        createdAt: new Date().toISOString(),
        replyCount: 0,
        mentions: [],
        _status: 'sending',
      }
      if (existingClientId) patchLocalComment(qc, scope, clientId, { _status: 'sending', _error: undefined })
      else forceInsertComment(qc, optimistic)
      try {
        const { data } = await chatClient.post<FeedComment>(`/feed/posts/${postId}/comments`, {
          body,
          parentId: input.parentId,
          clientId,
        })
        forceInsertComment(qc, data)
      } catch (err) {
        patchLocalComment(qc, scope, clientId, { _status: 'failed', _error: getApiErrorMessage(err, 'Comment not posted.') })
      }
    },
    [qc, viewer, me, postId],
  )
}

/** Insert even when older reply pages are still unloaded (my own reply should show). */
function forceInsertComment(qc: ReturnType<typeof useQueryClient>, c: LocalFeedComment) {
  const key = c.parentId ? feedKeys.replies(c.parentId) : feedKeys.comments(c.postId)
  if (!qc.getQueryData(key)) {
    qc.setQueryData<{ pages: LocalCommentPage[]; pageParams: (string | null)[] }>(key, {
      pages: [{ comments: [], nextCursor: null }],
      pageParams: [null],
    })
    // A placeholder isn't the real list: mark it stale so the first observer
    // still fetches the existing replies/comments (staleTime is Infinity).
    void qc.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' })
  }
  const data = qc.getQueryData<{ pages: LocalCommentPage[] }>(key)
  const last = data?.pages[data.pages.length - 1]
  if (c.parentId && last?.nextCursor) {
    // Some replies aren't loaded yet: append to the last page anyway.
    const exists = data!.pages.some((p) => p.comments.some((x) => x.id === c.id || (!!c.clientId && x.clientId === c.clientId)))
    if (exists) upsertComment(qc, c, { insert: false })
    else
      qc.setQueryData<{ pages: LocalCommentPage[]; pageParams: (string | null)[] }>(key, (d) =>
        d ? { ...d, pages: d.pages.map((p, i) => (i === d.pages.length - 1 ? { ...p, comments: [...p.comments, c] } : p)) } : d,
      )
    return
  }
  upsertComment(qc, c, { insert: true })
}

export function useDiscardComment() {
  const qc = useQueryClient()
  return useCallback(
    (c: LocalFeedComment) => c.clientId && patchLocalComment(qc, { postId: c.postId, parentId: c.parentId }, c.clientId, null),
    [qc],
  )
}

export function useDeleteComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { id: string; postId: string; parentId: string | null }) => (await chatClient.delete(`/feed/comments/${c.id}`)).data,
    onSuccess: (_d, c) => removeComment(qc, c),
  })
}

export function useModerateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; hidden: boolean }) =>
      (await chatClient.post<FeedComment>(`/feed/comments/${v.id}/moderate`, { hidden: v.hidden })).data,
    onSuccess: (c) => upsertComment(qc, c, { insert: false }),
  })
}

export function useReportFeed() {
  return useMutation({
    mutationFn: async (v: { postId?: string; commentId?: string; reason: string }) => (await chatClient.post('/reports', v)).data,
  })
}

// ── Notifications ────────────────────────────────────────────────────

/** Mark some (ids) or all (no ids) notifications read — local first, then the server's snapshot. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient()
  const { setUnreadNotifications } = useFeedRealtime()
  return useMutation({
    mutationFn: async (ids: string[] | null) =>
      (await chatClient.post<NotificationSnapshot>('/notifications/read', ids ? { ids } : {})).data,
    onMutate: (ids) => {
      markNotificationsReadLocal(qc, ids)
      if (!ids) setUnreadNotifications(0)
      else setUnreadNotifications((n) => Math.max(0, n - ids.length))
    },
    onSuccess: (snap) => setUnreadNotifications(snap.unread),
  })
}

export type { FeedImage }
