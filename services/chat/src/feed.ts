// Member Feed use-cases (main feed + group feeds, likes, comments, admin
// moderation, in-app notifications), shared by REST routes and socket
// handlers so permission checks and broadcasts happen exactly once.
//
// Broadcast rules: visible posts/comments go to the feed room
// (`feed:main` / `feed:{groupId}`); anything hidden goes only to moderators
// (`feed-mod`) and the author's own sockets, and the rest of the room gets a
// `…:deleted` so it disappears live. Like events carry the count only.
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  ChatPerson,
  FeedComment,
  FeedCommentPage,
  FeedImage,
  FeedLikeResult,
  FeedPage,
  FeedPost,
  MemberNotification,
  NotificationPage,
  NotificationSnapshot,
  UploadTicket,
} from './contract.js'
import type { ViewerContext } from './auth.js'
import { badRequest, forbidden, HttpError, notFound } from './errors.js'
import { clampLimit, decodeTimeCursor, encodeCursor, isUuid } from './cursor.js'
import * as policy from './policy.js'
import { toPerson, type ConversationRow, type ProfileRow } from './rows.js'
import * as convRepo from './repo/conversations.js'
import * as people from './repo/people.js'
import * as feedRepo from './repo/feed.js'
import type { CommentRow, NotificationRow, PostRow, StoredFeedImage } from './repo/feed.js'
import { FEED_MOD_ROOM, feedRoom, getIo, userRoom } from './realtime.js'
import { supabase, must } from './supabase.js'
import { log } from './log.js'

const uuid = z.string().refine(isUuid, 'invalid id')

const imageSchema = z.object({
  path: z.string().min(1).max(512),
  mime: z.enum(policy.ALLOWED_IMAGE_MIME),
  size: z.number().int().positive().max(policy.MAX_ATTACHMENT_BYTES),
  width: z.number().int().positive().max(50_000).optional(),
  height: z.number().int().positive().max(50_000).optional(),
})

const postLimiter = new policy.RateLimiter(5, 60_000)
const commentLimiter = new policy.RateLimiter(10, 30_000)
const likeLimiter = new policy.RateLimiter(40, 10_000)

// ── Scope resolution ────────────────────────────────────────

interface Scope extends policy.FeedScope {
  conv: ConversationRow | null
}

/** groupId → feed scope. The main group "The Club" IS the main feed (groupId null). */
async function resolveScope(v: ViewerContext, rawGroupId: string | null | undefined): Promise<Scope> {
  if (!rawGroupId) return { groupId: null, isParticipant: true, archived: false, conv: null }
  if (!isUuid(rawGroupId)) throw notFound('group not found')
  const conv = await convRepo.getConversation(rawGroupId)
  if (!conv || conv.kind !== 'group') throw notFound('group not found')
  if (conv.is_main) return { groupId: null, isParticipant: true, archived: false, conv: null }
  const me = await convRepo.getParticipant(conv.id, v.id)
  return { groupId: conv.id, isParticipant: !!me, archived: !!conv.archived_at, conv }
}

async function seeableScope(v: ViewerContext, groupId: string | null | undefined): Promise<Scope> {
  const scope = await resolveScope(v, groupId)
  if (!policy.canSeeFeed(v, scope)) throw forbidden('you can’t see this feed')
  return scope
}

async function loadPost(id: string): Promise<PostRow> {
  if (!isUuid(id)) throw notFound('post not found')
  const post = await feedRepo.getPost(id)
  if (!post || post.deleted_at) throw notFound('post not found')
  return post
}

/** A post the viewer may see, plus its scope. Hidden → 404 for everyone but moderators + author. */
async function readablePost(v: ViewerContext, id: string): Promise<{ post: PostRow; scope: Scope }> {
  const post = await loadPost(id)
  if (!policy.canSeePost(v, { hiddenAt: post.hidden_at, authorId: post.author_id, deletedAt: post.deleted_at })) {
    throw notFound('post not found')
  }
  const scope = await seeableScope(v, post.group_id)
  return { post, scope }
}

const asPolicyPost = (p: PostRow) => ({ hiddenAt: p.hidden_at, authorId: p.author_id })

// ── Mapping ─────────────────────────────────────────────────

function toImages(images: StoredFeedImage[] | null, urls: Map<string, string>): FeedImage[] {
  return (images ?? []).map((i) => ({
    path: i.path,
    url: urls.get(i.path) ?? '',
    mime: i.mime,
    size: i.size,
    ...(i.width ? { width: i.width } : {}),
    ...(i.height ? { height: i.height } : {}),
  }))
}

function toPost(p: PostRow, profiles: Map<string, ProfileRow>, urls: Map<string, string>, liked: Set<string>): FeedPost {
  const author = p.author_id ? profiles.get(p.author_id) : undefined
  return {
    id: p.id,
    groupId: p.group_id,
    authorId: p.author_id,
    author: author ? toPerson(author) : null,
    body: p.body ?? '',
    images: toImages(p.images, urls),
    clientId: p.client_id,
    pinnedAt: p.pinned_at,
    hiddenAt: p.hidden_at,
    editedAt: p.edited_at,
    createdAt: p.created_at,
    likeCount: p.like_count,
    commentCount: p.comment_count,
    likedByMe: liked.has(p.id),
    mentions: resolveMentions(p.mentions, profiles),
  }
}

function resolveMentions(ids: string[] | null | undefined, profiles: Map<string, ProfileRow>): ChatPerson[] {
  return (ids ?? []).flatMap((id) => {
    const p = profiles.get(id)
    return p ? [toPerson(p)] : []
  })
}

/** Batch-build posts: one profiles query, one signed-URL call, one likes query. */
async function buildPosts(viewerId: string | null, rows: PostRow[]): Promise<FeedPost[]> {
  if (!rows.length) return []
  const [profiles, urls, liked] = await Promise.all([
    people.getProfiles(rows.flatMap((r) => [...(r.author_id ? [r.author_id] : []), ...(r.mentions ?? [])])),
    feedRepo.signFeedUrls(rows.flatMap((r) => (r.images ?? []).map((i) => i.path))),
    viewerId ? feedRepo.likedBy(viewerId, rows.map((r) => r.id)) : Promise.resolve(new Set<string>()),
  ])
  return rows.map((r) => toPost(r, profiles, urls, liked))
}

function toComment(c: CommentRow, profiles: Map<string, ProfileRow>): FeedComment {
  const author = c.author_id ? profiles.get(c.author_id) : undefined
  return {
    id: c.id,
    postId: c.post_id,
    parentId: c.parent_id,
    authorId: c.author_id,
    author: author ? toPerson(author) : null,
    body: c.body,
    clientId: c.client_id,
    hiddenAt: c.hidden_at,
    createdAt: c.created_at,
    replyCount: c.reply_count,
    mentions: resolveMentions(c.mentions, profiles),
  }
}

async function buildComments(rows: CommentRow[]): Promise<FeedComment[]> {
  if (!rows.length) return []
  const profiles = await people.getProfiles(rows.flatMap((r) => [...(r.author_id ? [r.author_id] : []), ...(r.mentions ?? [])]))
  return rows.map((r) => toComment(r, profiles))
}

// ── Broadcasts ──────────────────────────────────────────────

/** Rooms that may see a hidden item: moderators + the given people's own sockets. */
const privateRooms = (...ids: (string | null)[]) => [FEED_MOD_ROOM, ...ids.filter((x): x is string => !!x).map(userRoom)]

function emitPost(event: 'feed:post:new' | 'feed:post:updated', row: PostRow, post: FeedPost) {
  const io = getIo()
  if (!io) return
  const shared = { ...post, likedByMe: false }
  if (row.hidden_at) io.to(privateRooms(row.author_id)).emit(event, { post: shared })
  else io.to(feedRoom(row.group_id)).emit(event, { post: shared })
}

/** Hide/unhide: moderators + author see the change; everyone else in the room loses / regains the post. */
function emitVisibility(row: PostRow, post: FeedPost, wasHidden: boolean) {
  const io = getIo()
  if (!io) return
  const shared = { ...post, likedByMe: false }
  const priv = privateRooms(row.author_id)
  io.to(priv).emit('feed:post:updated', { post: shared })
  if (row.hidden_at && !wasHidden) {
    io.to(feedRoom(row.group_id)).except(priv).emit('feed:post:deleted', { postId: row.id, groupId: row.group_id })
  } else if (!row.hidden_at && wasHidden) {
    io.to(feedRoom(row.group_id)).except(priv).emit('feed:post:new', { post: shared })
  }
}

function commentRooms(post: PostRow, comment: CommentRow): { open: boolean; rooms: string[] } {
  if (post.hidden_at) return { open: false, rooms: privateRooms(post.author_id) }
  if (comment.hidden_at) return { open: false, rooms: privateRooms(comment.author_id) }
  return { open: true, rooms: [feedRoom(post.group_id)] }
}

async function emitNotifications(rows: NotificationRow[]) {
  const io = getIo()
  if (!io || !rows.length) return
  const built = await buildNotifications(rows, null)
  for (const n of built) io.to(userRoom(n.recipientId)).emit('notification:new', { notification: n.notification })
}

export async function emitNotificationSnapshot(profileId: string): Promise<NotificationSnapshot> {
  const snap = { unread: await feedRepo.unreadNotifications(profileId) }
  getIo()?.to(userRoom(profileId)).emit('notifications:snapshot', snap)
  return snap
}

// ── Posts ───────────────────────────────────────────────────

export async function listFeed(v: ViewerContext, query: Record<string, unknown>): Promise<FeedPage> {
  const scope = await seeableScope(v, typeof query.group === 'string' ? query.group : null)
  const limit = clampLimit(query.limit, policy.FEED_PAGE_SIZE, 30)
  const cursor = decodeTimeCursor(typeof query.cursor === 'string' ? query.cursor : null)
  const includeHidden = policy.canModerate(v)
  const [rows, pinnedRows] = await Promise.all([
    feedRepo.listPosts({ groupId: scope.groupId, viewerId: v.id, includeHidden, after: cursor, limit: limit + 1 }),
    cursor ? Promise.resolve([] as PostRow[]) : feedRepo.listPinned(scope.groupId, v.id, includeHidden, policy.MAX_PINNED),
  ])
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  const built = await buildPosts(v.id, [...pinnedRows, ...page])
  return {
    pinned: built.slice(0, pinnedRows.length),
    posts: built.slice(pinnedRows.length),
    nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
  }
}

export async function getPost(v: ViewerContext, id: string): Promise<FeedPost> {
  const { post } = await readablePost(v, id)
  const [built] = await buildPosts(v.id, [post])
  return built!
}

export async function createPost(v: ViewerContext, input: unknown): Promise<FeedPost> {
  const parsed = z
    .object({
      groupId: uuid.nullish(),
      body: z.string().max(policy.MAX_POST_BODY * 2).nullish(),
      images: z.array(imageSchema).max(policy.MAX_POST_IMAGES).optional(),
      clientId: z.string().min(1).max(100).optional(),
    })
    .parse(input)
  const body = parsed.body?.trim() ?? ''
  const images = parsed.images ?? []
  if (body.length > policy.MAX_POST_BODY) throw badRequest(`posts are limited to ${policy.MAX_POST_BODY} characters`)
  if (!body && !images.length) throw badRequest('write something or add a photo')

  const scope = await resolveScope(v, parsed.groupId)
  if (!policy.canPostFeed(v, scope)) throw forbidden(scope.archived ? 'this group is archived' : 'you can’t post here')
  const tagged = await applyMentions(v, body, { post: null, groupId: scope.groupId })
  for (const i of images) {
    if (!policy.isValidFeedImagePath(scope.groupId, i.path)) throw badRequest('invalid image path')
  }
  if (!postLimiter.take(v.id)) throw new HttpError(429, 'slow down — try again in a minute')

  const { post: row, created } = await feedRepo.insertPost({
    authorId: v.id,
    groupId: scope.groupId,
    body: tagged.body,
    mentions: tagged.ids,
    images: images.map((i) => ({
      path: i.path,
      mime: i.mime,
      size: i.size,
      ...(i.width ? { width: i.width } : {}),
      ...(i.height ? { height: i.height } : {}),
    })),
    clientId: parsed.clientId ?? randomUUID(),
  })
  if (row.deleted_at) throw badRequest('clientId already used')
  const [post] = await buildPosts(v.id, [row])
  if (created) {
    log.info('feed_post_created', { post: row.id, group: row.group_id ?? 'main' })
    emitPost('feed:post:new', row, post!)
    // Mentions first; a new post in a group then notifies its (unmuted)
    // participants in one INSERT … SELECT, minus the people just mentioned.
    const mentioned = tagged.ids.filter((id) => id !== v.id)
    void (async () => {
      await notify(mentioned.map((id) => ({ recipientId: id, kind: 'mention' as const })), v.id, row.id, null, row.group_id)
      if (row.group_id) await emitNotifications(await feedRepo.notifyGroupPost(row.id, row.group_id, v.id, mentioned))
    })().catch((e) => log.error('notify_post_failed', e, { post: row.id }))
  }
  return post!
}

export async function editPost(v: ViewerContext, id: string, input: unknown): Promise<FeedPost> {
  const parsed = z
    .object({
      body: z.string().max(policy.MAX_POST_BODY * 2).optional(),
      // Full replacement list of the post's photos (kept + newly uploaded), in order.
      images: z.array(imageSchema).max(policy.MAX_POST_IMAGES).optional(),
    })
    .parse(input)
  const { post, scope } = await readablePost(v, id)
  if (!policy.canEditFeedItem(v, post.author_id)) throw forbidden('you can only edit your own posts')
  if (!policy.isActiveUser(v) || (scope.groupId && scope.archived)) throw forbidden('you can’t edit posts here')

  const rawBody = parsed.body === undefined ? post.body : parsed.body.trim()
  if (rawBody.length > policy.MAX_POST_BODY) throw badRequest(`posts are limited to ${policy.MAX_POST_BODY} characters`)
  const before = post.mentions ?? []
  // Re-validate every token (an unchanged one stays valid if its person is still taggable).
  const tagged = await applyMentions(v, rawBody, { post, groupId: post.group_id })
  const body = tagged.body
  const existing = post.images ?? []
  const existingPaths = existing.map((i) => i.path)
  let images: StoredFeedImage[] = existing
  if (parsed.images) {
    const nextPaths = parsed.images.map((i) => i.path)
    if (!policy.validEditImagePaths(post.group_id, existingPaths, nextPaths)) throw badRequest('invalid image path')
    const byPath = new Map(existing.map((i) => [i.path, i]))
    images = parsed.images.map((i) => {
      const kept = byPath.get(i.path)
      if (kept) return kept // keep the stored metadata for photos already on the post
      return {
        path: i.path,
        mime: i.mime,
        size: i.size,
        ...(i.width ? { width: i.width } : {}),
        ...(i.height ? { height: i.height } : {}),
      }
    })
  }
  if (!body && !images.length) throw badRequest('a post needs text or a photo')

  const sameImages = images.length === existing.length && images.every((img, i) => img.path === existing[i]!.path)
  if (body === post.body && sameImages) return getPost(v, id)
  const sameMentions = tagged.ids.length === before.length && tagged.ids.every((x, i) => x === before[i])
  const row = await feedRepo.updatePost(post.id, {
    body,
    ...(sameImages ? {} : { images }),
    ...(sameMentions ? {} : { mentions: tagged.ids }),
    edited_at: new Date().toISOString(),
  })
  // Only people newly tagged by this edit hear about it.
  const added = policy.newMentions(before, tagged.ids).filter((x) => x !== v.id)
  if (added.length) {
    void notify(added.map((rid) => ({ recipientId: rid, kind: 'mention' as const })), v.id, post.id, null, post.group_id).catch((e) =>
      log.error('notify_mention_failed', e, { post: post.id }),
    )
  }
  const [built] = await buildPosts(v.id, [row])
  emitPost('feed:post:updated', row, built!)
  // Only after the update succeeded: best-effort cleanup of photos the edit dropped.
  const removed = policy.removedImagePaths(existingPaths, images.map((i) => i.path))
  if (removed.length) void feedRepo.removeFeedObjects(removed)
  return built!
}

export async function deletePost(v: ViewerContext, id: string): Promise<{ ok: true }> {
  const post = await loadPost(id)
  if (!policy.canDeleteFeedItem(v, post.author_id)) throw forbidden('you can only delete your own posts')
  if (!policy.canSeePost(v, { hiddenAt: post.hidden_at, authorId: post.author_id, deletedAt: null })) throw notFound('post not found')
  await feedRepo.updatePost(post.id, { deleted_at: new Date().toISOString(), deleted_by: v.id })
  log.info('feed_post_deleted', { post: post.id, by: post.author_id === v.id ? 'author' : 'moderator' })
  getIo()
    ?.to([feedRoom(post.group_id), ...privateRooms(post.author_id)])
    .emit('feed:post:deleted', { postId: post.id, groupId: post.group_id })
  // Its notifications go too; refresh those people's badges.
  void feedRepo
    .deleteNotificationsForPost(post.id)
    .then((ids) => Promise.all(ids.map((pid) => emitNotificationSnapshot(pid))))
    .catch((e) => log.error('post_notifications_cleanup_failed', e, { post: post.id }))
  return { ok: true }
}

export async function moderatePost(v: ViewerContext, id: string, input: unknown): Promise<FeedPost> {
  if (!policy.canModerate(v)) throw forbidden('moderators only')
  const body = z.object({ pinned: z.boolean().optional(), hidden: z.boolean().optional() }).parse(input)
  const post = await loadPost(id)
  const now = new Date().toISOString()
  const patch: Partial<PostRow> = {}
  if (body.pinned !== undefined) {
    patch.pinned_at = body.pinned ? (post.pinned_at ?? now) : null
    patch.pinned_by = body.pinned ? (post.pinned_by ?? v.id) : null
  }
  if (body.hidden !== undefined) {
    patch.hidden_at = body.hidden ? (post.hidden_at ?? now) : null
    patch.hidden_by = body.hidden ? (post.hidden_by ?? v.id) : null
  }
  const row = Object.keys(patch).length ? await feedRepo.updatePost(post.id, patch) : post
  const [built] = await buildPosts(v.id, [row])
  const wasHidden = !!post.hidden_at
  if (wasHidden !== !!row.hidden_at) emitVisibility(row, built!, wasHidden)
  else emitPost('feed:post:updated', row, built!)
  log.info('feed_post_moderated', { post: post.id, pinned: !!row.pinned_at, hidden: !!row.hidden_at })
  return built!
}

export async function likePost(v: ViewerContext, id: string, input: unknown): Promise<FeedLikeResult> {
  const { liked } = z.object({ liked: z.boolean() }).parse(input)
  const { post, scope } = await readablePost(v, id)
  if (!policy.canInteract(v, scope, asPolicyPost(post))) throw forbidden('you can’t react to this post')
  if (!likeLimiter.take(v.id)) throw new HttpError(429, 'slow down')
  await feedRepo.setLike(post.id, v.id, liked)
  const fresh = await feedRepo.getPost(post.id)
  const likeCount = fresh?.like_count ?? post.like_count
  const io = getIo()
  if (io) {
    const rooms = post.hidden_at ? privateRooms(post.author_id) : [feedRoom(post.group_id)]
    io.to(rooms).except(userRoom(v.id)).emit('feed:like', { postId: post.id, groupId: post.group_id, likeCount })
    io.to(userRoom(v.id)).emit('feed:like', { postId: post.id, groupId: post.group_id, likeCount, liked })
  }
  return { liked, likeCount }
}

export async function createFeedUpload(v: ViewerContext, input: unknown): Promise<UploadTicket> {
  const body = z
    .object({
      groupId: uuid.nullish(),
      name: z.string().min(1).max(200),
      mime: z.enum(policy.ALLOWED_IMAGE_MIME),
      size: z.number().int().positive().max(policy.MAX_ATTACHMENT_BYTES),
    })
    .parse(input)
  const scope = await resolveScope(v, body.groupId)
  if (!policy.canPostFeed(v, scope)) throw forbidden('you can’t post here')
  return feedRepo.createFeedUploadTicket(`${policy.feedFolder(scope.groupId)}/${randomUUID()}-${safeName(body.name)}`)
}

function safeName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
  return cleaned.slice(-80) || 'image'
}

// ── Comments ────────────────────────────────────────────────

export async function listComments(v: ViewerContext, postId: string, query: Record<string, unknown>): Promise<FeedCommentPage> {
  const { post } = await readablePost(v, postId)
  const limit = clampLimit(query.limit, policy.COMMENT_PAGE_SIZE, 50)
  const cursor = decodeTimeCursor(typeof query.cursor === 'string' ? query.cursor : null)
  const rows = await feedRepo.listComments({ postId: post.id, viewerId: v.id, includeHidden: policy.canModerate(v), after: cursor, limit: limit + 1 })
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    comments: await buildComments(page),
    nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
  }
}

export async function listReplies(v: ViewerContext, commentId: string, query: Record<string, unknown>): Promise<FeedCommentPage> {
  if (!isUuid(commentId)) throw notFound('comment not found')
  const parent = await feedRepo.getComment(commentId)
  if (!parent || parent.deleted_at || parent.parent_id) throw notFound('comment not found')
  await readablePost(v, parent.post_id)
  if (parent.hidden_at && !policy.canModerate(v) && parent.author_id !== v.id) throw notFound('comment not found')
  const limit = clampLimit(query.limit, policy.REPLY_PAGE_SIZE, 50)
  const cursor = decodeTimeCursor(typeof query.cursor === 'string' ? query.cursor : null)
  const rows = await feedRepo.listReplies({ parentId: parent.id, viewerId: v.id, includeHidden: policy.canModerate(v), after: cursor, limit: limit + 1 })
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    comments: await buildComments(page),
    nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
  }
}

export async function addComment(v: ViewerContext, postId: string, input: unknown): Promise<FeedComment> {
  const parsed = z
    .object({
      body: z.string().max(policy.MAX_COMMENT_BODY * 2),
      parentId: uuid.nullish(),
      clientId: z.string().min(1).max(100).optional(),
    })
    .parse(input)
  const body = parsed.body.trim()
  if (!body) throw badRequest('comment is empty')
  if (body.length > policy.MAX_COMMENT_BODY) throw badRequest(`comments are limited to ${policy.MAX_COMMENT_BODY} characters`)

  const { post, scope } = await readablePost(v, postId)
  if (!policy.canInteract(v, scope, asPolicyPost(post))) throw forbidden('you can’t comment on this post')

  let parent: CommentRow | null = null
  if (parsed.parentId) {
    parent = await feedRepo.getComment(parsed.parentId)
    if (!parent || parent.deleted_at || parent.post_id !== post.id) throw badRequest('that comment is no longer available')
    // One level of replies: replying to a reply attaches to its parent.
    if (parent.parent_id) parent = await feedRepo.getComment(parent.parent_id)
    if (!parent || parent.deleted_at) throw badRequest('that comment is no longer available')
    if (parent.hidden_at && !policy.canModerate(v)) throw badRequest('that comment is no longer available')
  }
  if (!commentLimiter.take(v.id)) throw new HttpError(429, 'slow down')
  const tagged = await applyMentions(v, body, { post, groupId: post.group_id })

  const { comment: row, created } = await feedRepo.insertComment({
    postId: post.id,
    authorId: v.id,
    parentId: parent?.id ?? null,
    body: tagged.body,
    mentions: tagged.ids,
    clientId: parsed.clientId ?? randomUUID(),
  })
  if (row.post_id !== post.id) throw badRequest('clientId already used')
  const [comment] = await buildComments([row])

  if (created) {
    const counts = await feedRepo.counts(post.id, row.parent_id)
    const { rooms } = commentRooms(post, row)
    getIo()?.to(rooms).emit('feed:comment:new', { comment: comment!, ...counts })
    // One notification per person for this comment: 'mention' beats comment/reply.
    const targets = policy.mergeMentionTargets(
      policy.commentNotificationTargets({
        actorId: v.id,
        postAuthorId: post.author_id,
        parentAuthorId: parent?.author_id ?? null,
      }),
      tagged.ids,
      v.id,
    )
    void notify(targets, v.id, post.id, row.id, post.group_id).catch((e) => log.error('notify_comment_failed', e, { comment: row.id }))
  }
  return comment!
}

export async function deleteComment(v: ViewerContext, id: string): Promise<{ ok: true }> {
  if (!isUuid(id)) throw notFound('comment not found')
  const c = await feedRepo.getComment(id)
  if (!c || c.deleted_at) throw notFound('comment not found')
  if (!policy.canDeleteFeedItem(v, c.author_id)) throw forbidden('you can only delete your own comments')
  const post = await loadPost(c.post_id)
  const now = new Date().toISOString()
  await feedRepo.updateComment(c.id, { deleted_at: now, deleted_by: v.id })
  if (!c.parent_id) await feedRepo.deleteReplies(c.id, v.id)
  const counts = await feedRepo.counts(post.id, c.parent_id)
  getIo()
    ?.to([feedRoom(post.group_id), ...privateRooms(post.author_id, c.author_id)])
    .emit('feed:comment:deleted', { postId: post.id, commentId: c.id, parentId: c.parent_id, ...counts })
  return { ok: true }
}

export async function moderateComment(v: ViewerContext, id: string, input: unknown): Promise<FeedComment> {
  if (!policy.canModerate(v)) throw forbidden('moderators only')
  const { hidden } = z.object({ hidden: z.boolean() }).parse(input)
  if (!isUuid(id)) throw notFound('comment not found')
  const c = await feedRepo.getComment(id)
  if (!c || c.deleted_at) throw notFound('comment not found')
  const post = await loadPost(c.post_id)
  const hiddenAt = hidden ? (c.hidden_at ?? new Date().toISOString()) : null
  let row = hiddenAt === c.hidden_at ? c : await feedRepo.updateComment(c.id, { hidden_at: hiddenAt, hidden_by: hidden ? v.id : null })
  if (!c.parent_id && hiddenAt !== c.hidden_at) {
    // Replies follow their parent (same timestamp, so unhide restores only those).
    await feedRepo.setRepliesHidden(c.id, hiddenAt, v.id, c.hidden_at)
    row = (await feedRepo.getComment(c.id)) ?? row
  }
  const [comment] = await buildComments([row])
  const counts = await feedRepo.counts(post.id, row.parent_id)
  const io = getIo()
  if (io) {
    const priv = privateRooms(row.author_id, post.hidden_at ? post.author_id : null)
    io.to(priv).emit('feed:comment:updated', { comment: comment!, ...counts })
    if (!post.hidden_at) {
      const others = io.to(feedRoom(post.group_id)).except(priv)
      if (hidden) others.emit('feed:comment:deleted', { postId: post.id, commentId: row.id, parentId: row.parent_id, ...counts })
      else others.emit('feed:comment:new', { comment: comment!, ...counts })
    }
  }
  return comment!
}

// ── Notifications ───────────────────────────────────────────

interface BuiltNotification {
  recipientId: string
  notification: MemberNotification
}

/**
 * Batch-build notifications: actors, posts, comments and group titles in a
 * fixed handful of queries. `viewer` (the recipient, when known) decides
 * `available` for hidden posts; live pushes use the post author rule.
 */
async function buildNotifications(rows: NotificationRow[], viewer: ViewerContext | null): Promise<BuiltNotification[]> {
  if (!rows.length) return []
  const [profiles, posts, comments, groups] = await Promise.all([
    people.getProfiles(rows.flatMap((r) => (r.actor_id ? [r.actor_id] : []))),
    feedRepo.getPosts(rows.flatMap((r) => (r.post_id ? [r.post_id] : []))),
    feedRepo.getComments(rows.flatMap((r) => (r.comment_id ? [r.comment_id] : []))),
    groupTitles(rows.flatMap((r) => (r.group_id ? [r.group_id] : []))),
  ])
  return rows.map((r) => {
    const post = r.post_id ? posts.get(r.post_id) : undefined
    const comment = r.comment_id ? comments.get(r.comment_id) : undefined
    const actor = r.actor_id ? profiles.get(r.actor_id) : undefined
    const hiddenOk = viewer ? policy.canModerate(viewer) || post?.author_id === viewer.id : post?.author_id === r.recipient_id
    const available = !!post && !post.deleted_at && (!post.hidden_at || hiddenOk) && !(comment && comment.deleted_at)
    const text =
      r.kind === 'group_post' || (r.kind === 'mention' && !r.comment_id)
        ? policy.excerpt(post?.body) ?? ((post?.images ?? []).length ? 'Shared a photo' : null)
        : policy.excerpt(comment && !comment.deleted_at && !comment.hidden_at ? comment.body : null)
    const notification: MemberNotification = {
      id: r.id,
      kind: r.kind,
      actor: actor ? toPerson(actor) : null,
      postId: r.post_id,
      commentId: r.comment_id,
      groupId: r.group_id,
      groupTitle: r.group_id ? (groups.get(r.group_id) ?? null) : null,
      excerpt: available ? text : null,
      available,
      readAt: r.read_at,
      createdAt: r.created_at,
    }
    return { recipientId: r.recipient_id, notification }
  })
}

async function groupTitles(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map()
  const rows = must(await supabase.from('chat_conversations').select('id, title').in('id', unique), 'group titles') as {
    id: string
    title: string | null
  }[]
  return new Map(rows.map((r) => [r.id, r.title ?? 'Group']))
}

export async function listNotifications(v: ViewerContext, query: Record<string, unknown>): Promise<NotificationPage> {
  const limit = clampLimit(query.limit, policy.NOTIFICATION_PAGE_SIZE, 50)
  const cursor = decodeTimeCursor(typeof query.cursor === 'string' ? query.cursor : null)
  const [rows, unread] = await Promise.all([feedRepo.listNotifications(v.id, cursor, limit), feedRepo.unreadNotifications(v.id)])
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    notifications: (await buildNotifications(page, v)).map((b) => b.notification),
    nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
    unread,
  }
}

export async function markNotificationsRead(v: ViewerContext, input: unknown): Promise<NotificationSnapshot> {
  const { ids } = z.object({ ids: z.array(uuid).max(200).optional() }).parse(input ?? {})
  await feedRepo.markNotificationsRead(v.id, ids?.length ? ids : null)
  return emitNotificationSnapshot(v.id)
}

export async function notificationSnapshot(v: ViewerContext): Promise<NotificationSnapshot> {
  return { unread: await feedRepo.unreadNotifications(v.id) }
}

// ── Socket room checks + reports helpers ────────────────────

/** `feed:open` — the room for a feed the viewer may see (main group id → main room). */
export async function feedRoomFor(v: ViewerContext, groupId: string | null | undefined): Promise<string> {
  const scope = await seeableScope(v, groupId)
  return feedRoom(scope.groupId)
}

/** For POST /reports with postId / commentId: what's reported and which conversation it files under. */
export async function reportTarget(
  v: ViewerContext,
  ids: { postId?: string | null; commentId?: string | null },
): Promise<{ conversationId: string; postId: string; commentId: string | null }> {
  let postId = ids.postId ?? null
  let commentId: string | null = null
  if (ids.commentId) {
    const c = await feedRepo.getComment(ids.commentId)
    if (!c || c.deleted_at) throw notFound('comment not found')
    if (postId && c.post_id !== postId) throw badRequest('comment is not on this post')
    postId = c.post_id
    commentId = c.id
  }
  if (!postId) throw badRequest('nothing to report')
  const { post } = await readablePost(v, postId)
  const conversationId = post.group_id ?? (await convRepo.mainGroupId())
  if (!conversationId) throw new HttpError(503, 'reports are unavailable right now')
  return { conversationId, postId: post.id, commentId }
}

/** Reviewer context for feed reports: the reported text (even if since removed) + its feed. */
export async function reportContext(
  rows: { post_id?: string | null; comment_id?: string | null }[],
): Promise<Map<string, { body: string | null; groupId: string | null }>> {
  const postIds = rows.flatMap((r) => (r.post_id ? [r.post_id] : []))
  const commentIds = rows.flatMap((r) => (r.comment_id ? [r.comment_id] : []))
  const out = new Map<string, { body: string | null; groupId: string | null }>()
  if (!postIds.length && !commentIds.length) return out
  const [posts, comments] = await Promise.all([feedRepo.getPosts(postIds), feedRepo.getComments(commentIds)])
  for (const [id, p] of posts) out.set(`p:${id}`, { body: policy.plainMentions(p.body) || (p.images?.length ? '[photo post]' : null), groupId: p.group_id })
  for (const [id, c] of comments) out.set(`c:${id}`, { body: policy.plainMentions(c.body), groupId: posts.get(c.post_id)?.group_id ?? null })
  return out
}


// ── @mentions ───────────────────────────────────────────────

/** Insert + push notifications for one event (no-op when empty). */
async function notify(
  targets: { recipientId: string; kind: NotificationRow['kind'] }[],
  actorId: string,
  postId: string,
  commentId: string | null,
  groupId: string | null,
) {
  const rows = targets.filter((t) => t.recipientId !== actorId)
  if (!rows.length) return
  await emitNotifications(
    await feedRepo.insertNotifications(rows.map((t) => ({ recipientId: t.recipientId, kind: t.kind, actorId, postId, commentId, groupId }))),
  )
}

/** Who among `ids` the viewer may tag here (see policy.canMentionTarget). */
async function allowedMentions(
  v: ViewerContext,
  ids: string[],
  ctx: { post: PostRow | null; groupId: string | null },
): Promise<Set<string>> {
  const candidates = [...new Set(ids)].filter((id) => isUuid(id) && id !== v.id).slice(0, policy.MAX_MENTIONS * 2)
  if (!candidates.length) return new Set()
  const moderator = policy.canModerate(v)
  const [profiles, active, blocked, introduced, thread, group] = await Promise.all([
    people.getProfiles(candidates),
    people.activeMemberProfiles(candidates),
    people.blockedWith(v.id),
    moderator ? Promise.resolve(new Set<string>()) : feedRepo.introducedProfiles(v.memberIds),
    !moderator && ctx.post ? feedRepo.threadAuthors(ctx.post) : Promise.resolve([] as string[]),
    !moderator && ctx.groupId ? convRepo.participantIds(ctx.groupId) : Promise.resolve([] as string[]),
  ])
  const inThread = new Set(thread)
  const inGroup = new Set(group)
  const out = new Set<string>()
  for (const id of candidates) {
    const p = profiles.get(id)
    if (!p) continue
    const ok = policy.canMentionTarget(
      v,
      { id, isAdmin: p.role === 'admin', isActiveMember: p.role === 'member' && active.has(id) },
      { blocked: blocked.has(id), introduced: introduced.has(id), inThread: inThread.has(id), inGroup: inGroup.has(id) },
    )
    if (ok) out.add(id)
  }
  return out
}

/** Validate + rewrite a body's mention tokens; invalid ones become plain `@Name`. */
async function applyMentions(
  v: ViewerContext,
  body: string,
  ctx: { post: PostRow | null; groupId: string | null },
): Promise<{ body: string; ids: string[] }> {
  const ids = policy.mentionIds(body)
  if (!ids.length) return { body, ids: [] }
  return policy.rewriteMentions(body, await allowedMentions(v, ids, ctx))
}

function likeFragment(q: string): string | null {
  const t = q.trim().slice(0, 50)
  return t ? t.replace(/[\\%_]/g, '\\$&') : null
}

/**
 * GET /feed/mentionable — up to 8 people the viewer may tag, ranked: this
 * post's thread (author + commenters), introduced members, the group's
 * participants, then the Club team. Empty `q` returns only the thread.
 */
export async function mentionable(v: ViewerContext, query: Record<string, unknown>): Promise<{ people: ChatPerson[] }> {
  const limit = clampLimit(query.limit, 8, 8)
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 50) : ''
  const needle = q.toLowerCase()
  let post: PostRow | null = null
  let groupId: string | null
  if (typeof query.postId === 'string' && query.postId) {
    const r = await readablePost(v, query.postId)
    post = r.post
    groupId = r.scope.groupId
  } else {
    groupId = (await seeableScope(v, typeof query.groupId === 'string' ? query.groupId : null)).groupId
  }
  if (!policy.isActiveUser(v)) return { people: [] }
  if (!q && !post) return { people: [] }

  const moderator = policy.canModerate(v)
  const blocked = await people.blockedWith(v.id)
  const ranked: string[] = []
  const push = (id: string) => {
    if (id !== v.id && !blocked.has(id) && !ranked.includes(id)) ranked.push(id)
  }

  // 1. Thread participants (filtered by q locally — it's a short list).
  if (post) {
    const thread = await feedRepo.threadAuthors(post)
    const profiles = await people.getProfiles(thread)
    for (const id of thread) {
      const p = profiles.get(id)
      if (!p) continue
      const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase()
      if (!needle || name.includes(needle) || (p.company_name ?? '').toLowerCase().includes(needle)) push(id)
    }
  }
  if (q) {
    // 2./4. Introduced members + team (members) or everyone active (moderators) — the chat_people RPC.
    const found = await people.searchPeople({ viewerId: v.id, all: moderator, q: likeFragment(q), after: null, limit: 20 })
    for (const r of found) if (r.role !== 'admin') push(r.id)
    // 3. Group participants (members only — moderators already search everyone).
    if (!moderator && groupId && ranked.length < limit * 2) {
      for (const id of await feedRepo.searchProfilesIn(await convRepo.participantIds(groupId), q, limit)) push(id)
    }
    for (const r of found) if (r.role === 'admin') push(r.id)
  }

  // Final gate: the same rule the server applies when the post is saved.
  const allowed = await allowedMentions(v, ranked.slice(0, limit * 3), { post, groupId })
  const ids = ranked.filter((id) => allowed.has(id)).slice(0, limit)
  const profiles = await people.getProfiles(ids)
  return { people: ids.flatMap((id) => (profiles.get(id) ? [toPerson(profiles.get(id)!)] : [])) }
}
