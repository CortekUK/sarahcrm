// Feed reads/writes: keyset pages via the feed_list_* SQL functions,
// de-duped inserts, soft delete / hide / pin, likes, notifications and the
// private feed-media bucket.
import { FEED_BUCKET, supabase, must } from '../supabase.js'
import type { Cursor } from '../cursor.js'
import { log } from '../log.js'

export interface StoredFeedImage {
  path: string
  mime: string
  size: number
  width?: number
  height?: number
}

export interface PostRow {
  id: string
  author_id: string | null
  group_id: string | null
  body: string
  images: StoredFeedImage[] | null
  client_id: string | null
  pinned_at: string | null
  pinned_by: string | null
  hidden_at: string | null
  hidden_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  edited_at: string | null
  like_count: number
  comment_count: number
  /** validated @mention profile ids (20261022_feed_mentions.sql; undefined before it's applied) */
  mentions?: string[] | null
  created_at: string
}

export interface CommentRow {
  id: string
  post_id: string
  author_id: string | null
  parent_id: string | null
  body: string
  client_id: string | null
  reply_count: number
  hidden_at: string | null
  hidden_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  mentions?: string[] | null
  created_at: string
}

export interface NotificationRow {
  id: string
  recipient_id: string
  kind: 'comment' | 'reply' | 'group_post' | 'mention'
  actor_id: string | null
  post_id: string | null
  comment_id: string | null
  group_id: string | null
  read_at: string | null
  created_at: string
}

const q = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

function keyset(after: Cursor | null) {
  return {
    p_has_cursor: !!after?.key,
    p_after_at: after?.key ?? null,
    p_after_id: after?.key ? after.id : null,
  }
}

// ── Posts ───────────────────────────────────────────────────

export async function listPosts(args: {
  groupId: string | null
  viewerId: string
  includeHidden: boolean
  after: Cursor | null
  limit: number
}): Promise<PostRow[]> {
  const res = await supabase.rpc('feed_list_posts', {
    p_group: args.groupId,
    p_viewer: args.viewerId,
    p_include_hidden: args.includeHidden,
    ...keyset(args.after),
    p_limit: args.limit,
  })
  return must(res, 'feed_list_posts') as PostRow[]
}

export async function listPinned(groupId: string | null, viewerId: string, includeHidden: boolean, max: number): Promise<PostRow[]> {
  let query = supabase
    .from('feed_posts')
    .select('*')
    .not('pinned_at', 'is', null)
    .is('deleted_at', null)
    .order('pinned_at', { ascending: false })
    .limit(max)
  query = groupId ? query.eq('group_id', groupId) : query.is('group_id', null)
  if (!includeHidden) query = query.or(`hidden_at.is.null,author_id.eq.${viewerId}`)
  return must(await query, 'pinned posts') as PostRow[]
}

export async function getPost(id: string): Promise<PostRow | null> {
  return must(await supabase.from('feed_posts').select('*').eq('id', id).maybeSingle(), 'post') as PostRow | null
}

export async function getPosts(ids: string[]): Promise<Map<string, PostRow>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (!unique.length) return new Map()
  const rows = must(await supabase.from('feed_posts').select('*').in('id', unique), 'posts by id') as PostRow[]
  return new Map(rows.map((r) => [r.id, r]))
}

/** Insert, or return the existing row for the same (author_id, client_id). */
export async function insertPost(row: {
  authorId: string
  groupId: string | null
  body: string
  images: StoredFeedImage[]
  clientId: string
  mentions: string[]
}): Promise<{ post: PostRow; created: boolean }> {
  const res = await supabase
    .from('feed_posts')
    .upsert(
      {
        author_id: row.authorId,
        group_id: row.groupId,
        body: row.body,
        images: row.images,
        client_id: row.clientId,
        // Only send the column when used, so posting works before the mentions migration.
        ...(row.mentions.length ? { mentions: row.mentions } : {}),
      },
      { onConflict: 'author_id,client_id', ignoreDuplicates: true },
    )
    .select('*')
  const inserted = must(res, 'insert post') as PostRow[]
  if (inserted[0]) return { post: inserted[0], created: true }
  const existing = must(
    await supabase.from('feed_posts').select('*').eq('author_id', row.authorId).eq('client_id', row.clientId).single(),
    'existing post',
  ) as PostRow
  return { post: existing, created: false }
}

export async function updatePost(id: string, patch: Partial<PostRow>): Promise<PostRow> {
  const res = await supabase.from('feed_posts').update(patch).eq('id', id).select('*').single()
  return must(res, 'update post') as PostRow
}

// ── Likes ───────────────────────────────────────────────────

export async function setLike(postId: string, profileId: string, liked: boolean): Promise<void> {
  if (liked) {
    must(
      await supabase
        .from('feed_likes')
        .upsert({ post_id: postId, profile_id: profileId }, { onConflict: 'post_id,profile_id', ignoreDuplicates: true }),
      'like',
    )
  } else {
    must(await supabase.from('feed_likes').delete().eq('post_id', postId).eq('profile_id', profileId), 'unlike')
  }
}

export async function likedBy(profileId: string, postIds: string[]): Promise<Set<string>> {
  if (!postIds.length) return new Set()
  const rows = must(
    await supabase.from('feed_likes').select('post_id').eq('profile_id', profileId).in('post_id', postIds),
    'liked posts',
  ) as { post_id: string }[]
  return new Set(rows.map((r) => r.post_id))
}

// ── Comments ────────────────────────────────────────────────

export async function listComments(args: {
  postId: string
  viewerId: string
  includeHidden: boolean
  after: Cursor | null
  limit: number
}): Promise<CommentRow[]> {
  const res = await supabase.rpc('feed_list_comments', {
    p_post: args.postId,
    p_viewer: args.viewerId,
    p_include_hidden: args.includeHidden,
    ...keyset(args.after),
    p_limit: args.limit,
  })
  return must(res, 'feed_list_comments') as CommentRow[]
}

export async function listReplies(args: {
  parentId: string
  viewerId: string
  includeHidden: boolean
  after: Cursor | null
  limit: number
}): Promise<CommentRow[]> {
  const res = await supabase.rpc('feed_list_replies', {
    p_parent: args.parentId,
    p_viewer: args.viewerId,
    p_include_hidden: args.includeHidden,
    ...keyset(args.after),
    p_limit: args.limit,
  })
  return must(res, 'feed_list_replies') as CommentRow[]
}

export async function getComment(id: string): Promise<CommentRow | null> {
  return must(await supabase.from('feed_comments').select('*').eq('id', id).maybeSingle(), 'comment') as CommentRow | null
}

export async function getComments(ids: string[]): Promise<Map<string, CommentRow>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (!unique.length) return new Map()
  const rows = must(await supabase.from('feed_comments').select('*').in('id', unique), 'comments by id') as CommentRow[]
  return new Map(rows.map((r) => [r.id, r]))
}

export async function insertComment(row: {
  postId: string
  authorId: string
  parentId: string | null
  body: string
  clientId: string
  mentions: string[]
}): Promise<{ comment: CommentRow; created: boolean }> {
  const res = await supabase
    .from('feed_comments')
    .upsert(
      {
        post_id: row.postId,
        author_id: row.authorId,
        parent_id: row.parentId,
        body: row.body,
        client_id: row.clientId,
        ...(row.mentions.length ? { mentions: row.mentions } : {}),
      },
      { onConflict: 'author_id,client_id', ignoreDuplicates: true },
    )
    .select('*')
  const inserted = must(res, 'insert comment') as CommentRow[]
  if (inserted[0]) return { comment: inserted[0], created: true }
  const existing = must(
    await supabase.from('feed_comments').select('*').eq('author_id', row.authorId).eq('client_id', row.clientId).single(),
    'existing comment',
  ) as CommentRow
  return { comment: existing, created: false }
}

export async function updateComment(id: string, patch: Partial<CommentRow>): Promise<CommentRow> {
  const res = await supabase.from('feed_comments').update(patch).eq('id', id).select('*').single()
  return must(res, 'update comment') as CommentRow
}

/** Soft-delete a top-level comment's live replies (they're unreachable without it). */
export async function deleteReplies(parentId: string, by: string): Promise<void> {
  must(
    await supabase
      .from('feed_comments')
      .update({ deleted_at: new Date().toISOString(), deleted_by: by })
      .eq('parent_id', parentId)
      .is('deleted_at', null),
    'delete replies',
  )
}

/** Hide a parent's visible replies with the parent's timestamp; unhide only those. */
export async function setRepliesHidden(parentId: string, hiddenAt: string | null, by: string, previousHiddenAt: string | null) {
  if (hiddenAt) {
    must(
      await supabase
        .from('feed_comments')
        .update({ hidden_at: hiddenAt, hidden_by: by })
        .eq('parent_id', parentId)
        .is('hidden_at', null),
      'hide replies',
    )
  } else if (previousHiddenAt) {
    must(
      await supabase
        .from('feed_comments')
        .update({ hidden_at: null, hidden_by: null })
        .eq('parent_id', parentId)
        .eq('hidden_at', previousHiddenAt),
      'unhide replies',
    )
  }
}

export async function counts(postId: string, parentId: string | null): Promise<{ commentCount: number; replyCount: number | null }> {
  const [post, parent] = await Promise.all([
    supabase.from('feed_posts').select('comment_count').eq('id', postId).maybeSingle(),
    parentId ? supabase.from('feed_comments').select('reply_count').eq('id', parentId).maybeSingle() : Promise.resolve(null),
  ])
  const p = must(post, 'post counts') as { comment_count: number } | null
  const c = parent ? (must(parent, 'reply counts') as { reply_count: number } | null) : null
  return { commentCount: p?.comment_count ?? 0, replyCount: parentId ? (c?.reply_count ?? 0) : null }
}

// ── Notifications ───────────────────────────────────────────

export async function insertNotifications(
  rows: { recipientId: string; kind: NotificationRow['kind']; actorId: string; postId: string; commentId: string | null; groupId: string | null }[],
): Promise<NotificationRow[]> {
  if (!rows.length) return []
  const res = await supabase
    .from('member_notifications')
    .insert(
      rows.map((r) => ({
        recipient_id: r.recipientId,
        kind: r.kind,
        actor_id: r.actorId,
        post_id: r.postId,
        comment_id: r.commentId,
        group_id: r.groupId,
      })),
    )
    .select('*')
  return must(res, 'insert notifications') as NotificationRow[]
}

/**
 * One INSERT … SELECT over the group's participants (see SQL
 * feed_notify_group_post). `exclude` = people getting a 'mention' for the same
 * post instead (needs 20261022_feed_mentions.sql; falls back to the 3-arg
 * signature before it's applied).
 */
export async function notifyGroupPost(postId: string, groupId: string, actorId: string, exclude: string[] = []): Promise<NotificationRow[]> {
  const base = { p_post: postId, p_group: groupId, p_actor: actorId }
  const res = await supabase.rpc('feed_notify_group_post', { ...base, p_exclude: exclude })
  if (res.error && (res.error as { code?: string }).code === 'PGRST202') {
    log.warn('feed_notify_v1_fallback', { hint: 'apply supabase/migrations/20261022_feed_mentions.sql' })
    const rows = must(await supabase.rpc('feed_notify_group_post', base), 'feed_notify_group_post') as NotificationRow[]
    return rows
  }
  return must(res, 'feed_notify_group_post') as NotificationRow[]
}

// ── Mentions ────────────────────────────────────────────────

/** The post's author + everyone with a visible (not deleted / hidden) comment or reply on it. */
export async function threadAuthors(post: { id: string; author_id: string | null }): Promise<string[]> {
  const rows = must(
    await supabase
      .from('feed_comments')
      .select('author_id, created_at')
      .eq('post_id', post.id)
      .is('deleted_at', null)
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(500),
    'thread authors',
  ) as { author_id: string | null }[]
  const ids = [post.author_id, ...rows.map((r) => r.author_id)].filter((x): x is string => !!x)
  return [...new Set(ids)]
}

/** Profiles linked to the viewer's members rows by an accepted/completed introduction. */
export async function introducedProfiles(memberIds: string[]): Promise<Set<string>> {
  if (!memberIds.length) return new Set()
  const list = memberIds.join(',')
  const intros = must(
    await supabase
      .from('introductions')
      .select('member_a_id, member_b_id')
      .in('status', ['accepted', 'completed'])
      .or(`member_a_id.in.(${list}),member_b_id.in.(${list})`)
      .limit(2000),
    'introductions',
  ) as { member_a_id: string; member_b_id: string }[]
  const mine = new Set(memberIds)
  const others = [...new Set(intros.map((i) => (mine.has(i.member_a_id) ? i.member_b_id : i.member_a_id)))].filter((id) => !mine.has(id))
  const out = new Set<string>()
  for (let i = 0; i < others.length; i += 150) {
    const rows = must(
      await supabase.from('members').select('profile_id').in('id', others.slice(i, i + 150)).is('deleted_at', null),
      'introduced members',
    ) as { profile_id: string | null }[]
    for (const r of rows) if (r.profile_id) out.add(r.profile_id)
  }
  return out
}

/** Name/company search restricted to a set of profile ids (group participants), cheap and capped. */
export async function searchProfilesIn(ids: string[], q: string, limit: number): Promise<string[]> {
  const out: string[] = []
  const like = `%${q.replace(/[\\%_,()"]/g, ' ').trim()}%`
  for (let i = 0; i < ids.length && out.length < limit; i += 150) {
    const rows = must(
      await supabase
        .from('profiles')
        .select('id')
        .in('id', ids.slice(i, i + 150))
        .or(`first_name.ilike.${q2(like)},last_name.ilike.${q2(like)},company_name.ilike.${q2(like)}`)
        .limit(limit),
      'profiles in group',
    ) as { id: string }[]
    out.push(...rows.map((r) => r.id))
  }
  return out.slice(0, limit)
}
const q2 = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

export async function listNotifications(recipientId: string, after: Cursor | null, limit: number): Promise<NotificationRow[]> {
  let query = supabase
    .from('member_notifications')
    .select('*')
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (after?.key) query = query.or(`created_at.lt.${q(after.key)},and(created_at.eq.${q(after.key)},id.lt.${after.id})`)
  return must(await query, 'notifications') as NotificationRow[]
}

export async function unreadNotifications(recipientId: string): Promise<number> {
  const res = await supabase
    .from('member_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .is('read_at', null)
  if (res.error) throw new Error(`unread notifications: ${res.error.message}`)
  return res.count ?? 0
}

export async function markNotificationsRead(recipientId: string, ids: string[] | null): Promise<void> {
  let query = supabase
    .from('member_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', recipientId)
    .is('read_at', null)
  if (ids) query = query.in('id', ids)
  must(await query, 'mark notifications read')
}

/** A removed post's notifications go away; returns who had them so badges can refresh. */
export async function deleteNotificationsForPost(postId: string): Promise<string[]> {
  const res = await supabase.from('member_notifications').delete().eq('post_id', postId).select('recipient_id')
  const rows = must(res, 'delete post notifications') as { recipient_id: string }[]
  return [...new Set(rows.map((r) => r.recipient_id))]
}

// ── Storage (private feed-media bucket) ─────────────────────
const READ_TTL_S = 12 * 60 * 60

export async function signFeedUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(paths)].filter(Boolean)
  if (!unique.length) return out
  const { data, error } = await supabase.storage.from(FEED_BUCKET).createSignedUrls(unique, READ_TTL_S)
  if (error) {
    log.warn('feed_sign_urls_failed', { count: unique.length })
    return out
  }
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl)
  return out
}

export async function createFeedUploadTicket(path: string) {
  const { data, error } = await supabase.storage.from(FEED_BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error(`signed upload: ${error?.message ?? 'no data'}`)
  return { path: data.path, signedUrl: data.signedUrl, token: data.token }
}

/** Best-effort delete of feed photos (never throws — a leftover object is harmless). */
export async function removeFeedObjects(paths: string[]): Promise<void> {
  if (!paths.length) return
  try {
    const { error } = await supabase.storage.from(FEED_BUCKET).remove(paths)
    if (error) log.warn('feed_remove_objects_failed', { count: paths.length })
  } catch {
    log.warn('feed_remove_objects_failed', { count: paths.length })
  }
}
