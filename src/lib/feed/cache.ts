// Pure TanStack-cache patchers for the feed. Socket events and optimistic
// mutations PATCH what's cached — never refetch a whole feed — so every
// realtime update funnels through these.
//
// Feed list = InfiniteData<LocalFeedPage>: page 0 carries `pinned`, every
// page carries `posts` newest-first. Comments = InfiniteData<LocalCommentPage>
// (top-level newest-first per page; replies oldest-first per page).

import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { FeedComment, FeedPost, MemberNotification, NotificationPage } from '@/lib/chat/contract'
import { feedKeys } from './keys'
import type { LocalCommentPage, LocalFeedComment, LocalFeedPage, LocalFeedPost } from './types'

type FeedData = InfiniteData<LocalFeedPage, string | null>
type CommentData = InfiniteData<LocalCommentPage, string | null>
type NotifData = InfiniteData<NotificationPage, string | null>

const samePost = (a: FeedPost, b: FeedPost) =>
  a.id === b.id || (!!a.clientId && a.clientId === b.clientId && a.authorId === b.authorId)
const sameComment = (a: FeedComment, b: FeedComment) =>
  a.id === b.id || (!!a.clientId && a.clientId === b.clientId && a.authorId === b.authorId)

const newerFirst = (a: FeedPost, b: FeedPost) =>
  a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1
const pinnedFirst = (a: FeedPost, b: FeedPost) => ((a.pinnedAt ?? '') < (b.pinnedAt ?? '') ? 1 : -1)

/** Every cached feed list (main + groups). */
function forEachFeed(qc: QueryClient, fn: (data: FeedData, key: readonly unknown[]) => FeedData) {
  for (const [key, data] of qc.getQueriesData<FeedData>({ queryKey: feedKeys.lists() })) {
    if (data) qc.setQueryData<FeedData>(key, fn(data, key))
  }
}

function findIn(data: FeedData, post: FeedPost): LocalFeedPost | undefined {
  for (const p of data.pages) {
    const hit = p.pinned.find((x) => samePost(x, post)) ?? p.posts.find((x) => samePost(x, post))
    if (hit) return hit
  }
  return undefined
}

function without(data: FeedData, match: (p: LocalFeedPost) => boolean): FeedData {
  return {
    ...data,
    pages: data.pages.map((pg) => ({ ...pg, pinned: pg.pinned.filter((p) => !match(p)), posts: pg.posts.filter((p) => !match(p)) })),
  }
}

/** Insert a post at its chronological place among the loaded posts (skip if it's older than what's loaded and more pages exist). */
function placeChronologically(data: FeedData, post: LocalFeedPost): FeedData {
  const pages = data.pages.map((pg) => ({ ...pg, posts: pg.posts.slice() }))
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i]
    const idx = pg.posts.findIndex((p) => newerFirst(post, p) < 0)
    if (idx !== -1) {
      pg.posts.splice(idx, 0, post)
      return { ...data, pages }
    }
    const isLast = i === pages.length - 1
    if (isLast && !pg.nextCursor) {
      pg.posts.push(post)
      return { ...data, pages }
    }
  }
  if (!pages.length) return { ...data, pages: [{ pinned: [], posts: [post], nextCursor: null }], pageParams: [null] }
  return data
}

/**
 * Insert or replace a post in its feed (and the detail cache). Pin changes
 * move it between `pinned` and `posts`. `likedByMe` from socket copies is
 * shared (always false) — pass `keepLiked` to keep the cached value.
 */
export function upsertPost(
  qc: QueryClient,
  post: LocalFeedPost,
  opts: { insert?: boolean; keepLiked?: boolean } = {},
) {
  const listKey = feedKeys.list(post.groupId)
  qc.setQueryData<FeedData>(listKey, (data) => {
    if (!data) return data
    const existing = findIn(data, post)
    if (!existing && !opts.insert) return data
    const next: LocalFeedPost = existing && opts.keepLiked ? { ...post, likedByMe: existing.likedByMe } : post
    let out = without(data, (p) => samePost(p, post))
    if (next.pinnedAt) {
      const first = out.pages[0] ?? { pinned: [], posts: [], nextCursor: null }
      const pinned = [...first.pinned, next].sort(pinnedFirst)
      const pages = out.pages.length ? out.pages.slice() : [first]
      pages[0] = { ...first, pinned }
      out = { ...out, pages, pageParams: out.pageParams.length ? out.pageParams : [null] }
      return out
    }
    return placeChronologically(out, next)
  })
  qc.setQueryData<LocalFeedPost>(feedKeys.post(post.id), (d) =>
    d ? { ...post, likedByMe: opts.keepLiked ? d.likedByMe : post.likedByMe } : d,
  )
}

/** Put an optimistic post at the very top of its feed (above everything but pinned). */
export function prependPost(qc: QueryClient, post: LocalFeedPost) {
  qc.setQueryData<FeedData>(feedKeys.list(post.groupId), (data) => {
    if (!data) return data
    const out = without(data, (p) => samePost(p, post))
    const pages = out.pages.slice()
    const first = pages[0] ?? { pinned: [], posts: [], nextCursor: null }
    pages[0] = { ...first, posts: [post, ...first.posts] }
    return { ...out, pages }
  })
}

export function patchPost(qc: QueryClient, postId: string, patch: (p: LocalFeedPost) => LocalFeedPost) {
  const map = (p: LocalFeedPost) => (p.id === postId ? patch(p) : p)
  forEachFeed(qc, (data) => ({
    ...data,
    pages: data.pages.map((pg) => ({ ...pg, pinned: pg.pinned.map(map), posts: pg.posts.map(map) })),
  }))
  qc.setQueryData<LocalFeedPost>(feedKeys.post(postId), (d) => (d ? patch(d) : d))
}

/** Patch an optimistic post by clientId (upload progress, failure). */
export function patchLocalPost(qc: QueryClient, groupId: string | null, clientId: string, patch: Partial<LocalFeedPost>) {
  qc.setQueryData<FeedData>(feedKeys.list(groupId), (data) => {
    if (!data) return data
    const map = (p: LocalFeedPost) => (p.clientId === clientId && p.id.startsWith('local:') ? { ...p, ...patch } : p)
    return { ...data, pages: data.pages.map((pg) => ({ ...pg, posts: pg.posts.map(map) })) }
  })
}

export function removePost(qc: QueryClient, postId: string) {
  forEachFeed(qc, (data) => without(data, (p) => p.id === postId))
  qc.removeQueries({ queryKey: feedKeys.comments(postId) })
}

export function removeLocalPost(qc: QueryClient, groupId: string | null, clientId: string) {
  qc.setQueryData<FeedData>(feedKeys.list(groupId), (data) =>
    data ? without(data, (p) => p.clientId === clientId && p.id.startsWith('local:')) : data,
  )
}

/** Find a post anywhere in the cache (detail, then lists). */
export function findPost(qc: QueryClient, postId: string): LocalFeedPost | null {
  const detail = qc.getQueryData<LocalFeedPost>(feedKeys.post(postId))
  if (detail) return detail
  for (const [, data] of qc.getQueriesData<FeedData>({ queryKey: feedKeys.lists() })) {
    for (const pg of data?.pages ?? []) {
      const hit = pg.pinned.find((p) => p.id === postId) ?? pg.posts.find((p) => p.id === postId)
      if (hit) return hit
    }
  }
  return null
}

/** Merge a freshly fetched first page (after reconnect). Returns false when nothing overlaps → caller resets. */
export function mergeLatestFeedPage(qc: QueryClient, groupId: string | null, latest: LocalFeedPage): boolean {
  const data = qc.getQueryData<FeedData>(feedKeys.list(groupId))
  if (!data) return true
  const known = new Set(data.pages.flatMap((p) => [...p.pinned, ...p.posts].map((x) => x.id)))
  const overlaps = latest.posts.some((p) => known.has(p.id))
  if (!overlaps && known.size > 0 && latest.nextCursor) return false
  qc.setQueryData<FeedData>(feedKeys.list(groupId), (d) => {
    if (!d) return d
    const pages = d.pages.slice()
    pages[0] = { ...pages[0], pinned: latest.pinned }
    return { ...d, pages }
  })
  for (const p of [...latest.posts].reverse()) upsertPost(qc, p, { insert: !known.has(p.id) })
  return true
}

// ── Comments ─────────────────────────────────────────────────────────

const commentsKey = (c: { postId: string; parentId: string | null }) =>
  c.parentId ? feedKeys.replies(c.parentId) : feedKeys.comments(c.postId)

/**
 * Insert or replace a comment. Top-level comments go to the head of page 0
 * (newest first); replies are appended to the last page, but only once every
 * reply is loaded (otherwise "View N replies" picks it up).
 */
export function upsertComment(qc: QueryClient, comment: LocalFeedComment, opts: { insert?: boolean } = { insert: true }) {
  qc.setQueryData<CommentData>(commentsKey(comment), (data) => {
    if (!data) return data
    let found = false
    const pages = data.pages.map((pg) => {
      const idx = pg.comments.findIndex((c) => sameComment(c, comment))
      if (idx === -1) return pg
      found = true
      const comments = pg.comments.slice()
      comments[idx] = comment
      return { ...pg, comments }
    })
    if (found || !opts.insert) return { ...data, pages }
    if (!comment.parentId) {
      const first = pages[0] ?? { comments: [], nextCursor: null }
      pages[0] = { ...first, comments: [comment, ...first.comments] }
      return { ...data, pages }
    }
    const last = pages[pages.length - 1]
    if (last && last.nextCursor) return { ...data, pages }
    if (!last) return { ...data, pages: [{ comments: [comment], nextCursor: null }] }
    pages[pages.length - 1] = { ...last, comments: [...last.comments, comment] }
    return { ...data, pages }
  })
}

export function removeComment(qc: QueryClient, c: { postId: string; parentId: string | null; id: string }) {
  qc.setQueryData<CommentData>(commentsKey(c), (data) =>
    data ? { ...data, pages: data.pages.map((pg) => ({ ...pg, comments: pg.comments.filter((x) => x.id !== c.id) })) } : data,
  )
  if (!c.parentId) qc.removeQueries({ queryKey: feedKeys.replies(c.id) })
}

export function patchLocalComment(
  qc: QueryClient,
  c: { postId: string; parentId: string | null },
  clientId: string,
  patch: Partial<LocalFeedComment> | null,
) {
  qc.setQueryData<CommentData>(commentsKey(c), (data) => {
    if (!data) return data
    return {
      ...data,
      pages: data.pages.map((pg) => ({
        ...pg,
        comments: patch
          ? pg.comments.map((x) => (x.clientId === clientId && x.id.startsWith('local:') ? { ...x, ...patch } : x))
          : pg.comments.filter((x) => !(x.clientId === clientId && x.id.startsWith('local:'))),
      })),
    }
  })
}

/** Set a top-level comment's reply total (from events). */
export function setReplyCount(qc: QueryClient, postId: string, commentId: string, replyCount: number) {
  qc.setQueryData<CommentData>(feedKeys.comments(postId), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((pg) => ({
            ...pg,
            comments: pg.comments.map((c) => (c.id === commentId ? { ...c, replyCount } : c)),
          })),
        }
      : data,
  )
}

/** Oldest → newest for rendering; collapses optimistic + server copies. */
export function flattenComments(pages: LocalCommentPage[] | undefined): LocalFeedComment[] {
  if (!pages?.length) return []
  const seen = new Map<string, LocalFeedComment>()
  const byId = new Map<string, string>()
  for (const pg of pages) {
    for (const c of pg.comments) {
      const key = c.clientId ? `c:${c.authorId ?? ''}:${c.clientId}` : `i:${c.id}`
      const existingKey = byId.get(c.id) ?? (seen.has(key) ? key : undefined)
      if (existingKey) {
        const prev = seen.get(existingKey)!
        if (prev._status && !c._status) seen.set(existingKey, c)
        byId.set(c.id, existingKey)
        continue
      }
      seen.set(key, c)
      byId.set(c.id, key)
    }
  }
  const list = [...seen.values()]
  list.sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1))
  return list
}

export const commentKey = (c: LocalFeedComment) => (c.clientId ? `c:${c.clientId}` : `i:${c.id}`)
export const postKey = (p: LocalFeedPost) => (p.clientId ? `c:${p.clientId}` : `i:${p.id}`)

/** Flatten + de-dupe a feed's posts (newest first). */
export function flattenPosts(pages: LocalFeedPage[] | undefined): { pinned: LocalFeedPost[]; posts: LocalFeedPost[] } {
  if (!pages?.length) return { pinned: [], posts: [] }
  const pinned = pages[0].pinned
  const pinnedIds = new Set(pinned.map((p) => p.id))
  const seen = new Set<string>()
  const posts: LocalFeedPost[] = []
  for (const pg of pages) {
    for (const p of pg.posts) {
      const key = postKey(p)
      if (pinnedIds.has(p.id) || seen.has(key) || seen.has(`i:${p.id}`)) continue
      seen.add(key)
      seen.add(`i:${p.id}`)
      posts.push(p)
    }
  }
  return { pinned, posts }
}

// ── Notifications ────────────────────────────────────────────────────

export function prependNotification(qc: QueryClient, n: MemberNotification) {
  qc.setQueryData<NotifData>(feedKeys.notifications(), (data) => {
    if (!data) return data
    if (data.pages.some((p) => p.notifications.some((x) => x.id === n.id))) return data
    const pages = data.pages.slice()
    pages[0] = { ...pages[0], notifications: [n, ...pages[0].notifications] }
    return { ...data, pages }
  })
}

export function markNotificationsReadLocal(qc: QueryClient, ids: string[] | null) {
  const at = new Date().toISOString()
  const set = ids ? new Set(ids) : null
  qc.setQueryData<NotifData>(feedKeys.notifications(), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            notifications: p.notifications.map((n) => (!n.readAt && (!set || set.has(n.id)) ? { ...n, readAt: at } : n)),
          })),
        }
      : data,
  )
}

export function markNotificationsUnavailable(qc: QueryClient, postId: string) {
  qc.setQueryData<NotifData>(feedKeys.notifications(), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            notifications: p.notifications.map((n) => (n.postId === postId ? { ...n, available: false, excerpt: null } : n)),
          })),
        }
      : data,
  )
}
