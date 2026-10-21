// Every chat permission rule in one place, as pure functions over plain
// inputs (no DB access) so they're unit-testable and easy to audit against
// the Rules section of docs/CHAT-ARCHITECTURE.md.

export interface PolicyViewer {
  id: string
  isOwner: boolean
  isAdmin: boolean
  canOversee: boolean
  /** profiles.role = member with an active, non-deleted members row */
  isActiveMember: boolean
}

export interface PolicyConversation {
  kind: 'dm' | 'group' | 'event'
  isMain: boolean
  isJoinable: boolean
  archivedAt: string | null
  closesAt: string | null
}

export interface PostContext {
  isParticipant: boolean
  /** DM only: a block exists between the two people (either direction) */
  blocked?: boolean
  now?: Date
}

export interface DmTarget {
  id: string
  isAdmin: boolean
  isActiveMember: boolean
}

export type ParticipantRole = 'owner' | 'admin' | 'member'

/** Admins, active members and the owner may take part; lapsed members read only. */
export function isActiveUser(v: PolicyViewer): boolean {
  return v.isOwner || v.isAdmin || v.isActiveMember
}

/** Anyone with any business in chat (overseeing staff included). */
export function canUseChat(v: PolicyViewer): boolean {
  return isActiveUser(v) || v.canOversee
}

export function dmKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

export function dmOtherId(key: string | null, me: string): string | null {
  if (!key) return null
  const [a, b] = key.split(':')
  if (a === me) return b ?? null
  if (b === me) return a ?? null
  return null
}

export function isClosed(c: PolicyConversation, now = new Date()): boolean {
  return c.kind === 'event' && !!c.closesAt && Date.parse(c.closesAt) <= now.getTime()
}

/** Conversation-level read-only (same for everyone): archived or closed event. */
export function isLocked(c: PolicyConversation, now = new Date()): boolean {
  return !!c.archivedAt || isClosed(c, now)
}

export function canJoin(v: PolicyViewer, c: PolicyConversation): boolean {
  return c.kind === 'group' && c.isJoinable && !c.archivedAt && (v.isAdmin || v.isActiveMember || v.isOwner)
}

/** Overseers read everything; admins may open any event chat; joinable groups are previewable. */
export function canRead(v: PolicyViewer, c: PolicyConversation, isParticipant: boolean): boolean {
  if (isParticipant) return true
  if (v.canOversee) return true
  if (c.kind === 'event' && v.isAdmin) return true
  return canJoin(v, c)
}

export function canPost(v: PolicyViewer, c: PolicyConversation, ctx: PostContext): boolean {
  if (isLocked(c, ctx.now)) return false
  if (!isActiveUser(v)) return false
  switch (c.kind) {
    case 'dm':
      return ctx.isParticipant && !ctx.blocked
    case 'group':
      // Owner can post in any group; non-participant overseers stay read-only.
      return ctx.isParticipant || v.isOwner
    case 'event':
      // Admins may join an event chat by posting in it.
      return ctx.isParticipant || v.isAdmin
  }
}

export function isReadOnly(v: PolicyViewer, c: PolicyConversation, ctx: PostContext): boolean {
  return !canPost(v, c, ctx)
}

/** Starting a new DM. `introduced` = accepted/completed introduction between their members rows. */
export function canDm(v: PolicyViewer, target: DmTarget, ctx: { introduced: boolean; blocked: boolean }): boolean {
  if (v.id === target.id) return false
  if (ctx.blocked) return false
  if (!(v.isAdmin || v.isActiveMember)) return false
  if (v.isAdmin) return target.isAdmin || target.isActiveMember
  if (target.isAdmin) return true
  return target.isActiveMember && ctx.introduced
}

// ── Owner-only group management ─────────────────────────────
export const canCreateGroup = (v: PolicyViewer) => v.isOwner

export function canManageGroup(v: PolicyViewer, c: PolicyConversation): boolean {
  return v.isOwner && c.kind === 'group'
}

export function canArchive(v: PolicyViewer, c: PolicyConversation): boolean {
  return canManageGroup(v, c) && !c.isMain
}

export function canLeave(c: PolicyConversation, isParticipant: boolean): boolean {
  return isParticipant && c.kind !== 'dm' && !c.isMain
}

/** Removing someone: self-leave, or the owner removing from a group. */
export function canRemoveParticipant(
  v: PolicyViewer,
  c: PolicyConversation,
  targetId: string,
  targetIsParticipant: boolean,
): boolean {
  if (!targetIsParticipant) return false
  if (targetId === v.id) return canLeave(c, true)
  return canManageGroup(v, c)
}

export function canDeleteMessage(v: PolicyViewer, senderId: string | null): boolean {
  return v.isOwner || (!!senderId && senderId === v.id)
}

export const canListAll = (v: PolicyViewer) => v.canOversee
export const canReviewReports = (v: PolicyViewer) => v.isOwner || v.canOversee
export const canManageStaff = (v: PolicyViewer) => v.isOwner

/** Auto-join "The Club" for active members and admins. */
export const shouldEnsureMain = (v: PolicyViewer) => v.isAdmin || v.isActiveMember

export function participantRoleFor(v: PolicyViewer): ParticipantRole {
  return v.isOwner ? 'owner' : v.isAdmin ? 'admin' : 'member'
}

/** Attachment paths must live under the conversation's folder (no traversal). */
export function isValidAttachmentPath(conversationId: string, path: string): boolean {
  if (!path.startsWith(`${conversationId}/`)) return false
  const rest = path.slice(conversationId.length + 1)
  return rest.length > 0 && !rest.includes('/') && !rest.includes('..') && !rest.includes('\\')
}

export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'] as const
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENTS = 6
export const MAX_BODY = 4000

/** Simple sliding-window limiter, keyed by profile id. */
export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const since = now - this.windowMs
    const list = (this.hits.get(key) ?? []).filter((t) => t > since)
    if (list.length >= this.max) {
      this.hits.set(key, list)
      return false
    }
    list.push(now)
    this.hits.set(key, list)
    if (this.hits.size > 10_000) this.sweep(since)
    return true
  }

  private sweep(since: number) {
    for (const [k, list] of this.hits) if (!list.some((t) => t > since)) this.hits.delete(k)
  }
}

// ── Event-chat pruning / unread totals (pure) ───────────────

/**
 * Members whose booking for the event is no longer confirmed leave its chat.
 * Only role 'member' participants are touched (admins/owner join event chats
 * by opening them, not by booking), and never a profile in `adminIds`.
 */
export function eventPruneTargets(
  participants: { profileId: string; role: ParticipantRole }[],
  confirmedProfileIds: ReadonlySet<string>,
  adminIds: ReadonlySet<string> = new Set(),
): string[] {
  return participants
    .filter((p) => p.role === 'member' && !confirmedProfileIds.has(p.profileId) && !adminIds.has(p.profileId))
    .map((p) => p.profileId)
}

/** Event chats a member should leave: ones they sit in whose event they no longer have a confirmed booking for. */
export function staleEventChats(
  mine: { conversationId: string; eventId: string | null }[],
  confirmedEventIds: ReadonlySet<string>,
): string[] {
  return mine.filter((c) => !c.eventId || !confirmedEventIds.has(c.eventId)).map((c) => c.conversationId)
}

/** Badge total: every unread count except muted conversations. */
export function unreadTotal(byConversation: Record<string, number>, muted: ReadonlySet<string>): number {
  let total = 0
  for (const [id, n] of Object.entries(byConversation)) if (n > 0 && !muted.has(id)) total += n
  return total
}

// ── Member Feed ─────────────────────────────────────────────
// Main feed (groupId null) + one feed per group conversation. Admins and the
// owner moderate (pin / hide / remove). With CHAT_ADMINS_FULL_ACCESS every
// admin is isOwner too, so moderation = isAdmin || isOwner either way.

export interface FeedScope {
  /** null = main Club feed */
  groupId: string | null
  /** group feeds: the viewer is an active participant of the group */
  isParticipant: boolean
  /** group feeds: the group is archived (read only) */
  archived: boolean
}

export const canModerate = (v: PolicyViewer) => v.isAdmin || v.isOwner

/** Main feed: everyone who may use chat. Group feeds: participants, admins/owner and overseers. */
export function canSeeFeed(v: PolicyViewer, s: FeedScope): boolean {
  if (s.groupId === null) return canUseChat(v)
  return canSeeGroupFeed(v, s.isParticipant)
}

export function canSeeGroupFeed(v: PolicyViewer, isParticipant: boolean): boolean {
  return isParticipant || v.isAdmin || v.isOwner || v.canOversee
}

/** Posting updates/photos: active members + admins; group feeds need participation (owner posts anywhere). */
export function canPostFeed(v: PolicyViewer, s: FeedScope): boolean {
  if (!isActiveUser(v)) return false
  if (s.groupId === null) return true
  if (s.archived) return false
  return s.isParticipant || v.isOwner
}

/** Liking + commenting: anyone active who can see the feed (admins everywhere), never on hidden posts unless moderating/own. */
export function canInteract(
  v: PolicyViewer,
  s: FeedScope,
  post: { hiddenAt: string | null; authorId: string | null },
): boolean {
  if (!isActiveUser(v) || !canSeeFeed(v, s)) return false
  if (s.groupId !== null && s.archived) return false
  if (s.groupId !== null && !s.isParticipant && !canModerate(v)) return false
  if (post.hiddenAt && !canModerate(v) && post.authorId !== v.id) return false
  return true
}

/** Whether the viewer may see a specific post (hidden posts: moderators + author). */
export function canSeePost(v: PolicyViewer, post: { hiddenAt: string | null; authorId: string | null; deletedAt: string | null }): boolean {
  if (post.deletedAt) return false
  return !post.hiddenAt || canModerate(v) || (!!post.authorId && post.authorId === v.id)
}

export const canEditFeedItem = (v: PolicyViewer, authorId: string | null) => !!authorId && authorId === v.id
export const canDeleteFeedItem = (v: PolicyViewer, authorId: string | null) => canModerate(v) || canEditFeedItem(v, authorId)

export type FeedNotificationKind = 'comment' | 'reply' | 'group_post' | 'mention'

/**
 * Who hears about a new comment. A reply notifies the parent comment's author
 * ('reply') and the post author ('comment'); a top-level comment notifies the
 * post author. Never the actor, never twice for one person.
 */
export function commentNotificationTargets(args: {
  actorId: string
  postAuthorId: string | null
  parentAuthorId: string | null
}): { recipientId: string; kind: FeedNotificationKind }[] {
  const out: { recipientId: string; kind: FeedNotificationKind }[] = []
  const seen = new Set<string>([args.actorId])
  if (args.parentAuthorId && !seen.has(args.parentAuthorId)) {
    out.push({ recipientId: args.parentAuthorId, kind: 'reply' })
    seen.add(args.parentAuthorId)
  }
  if (args.postAuthorId && !seen.has(args.postAuthorId)) {
    out.push({ recipientId: args.postAuthorId, kind: 'comment' })
  }
  return out
}

/**
 * Who gets a 'group_post' notification (mirrors SQL feed_notify_group_post):
 * active, unmuted participants other than the author. Main-feed posts notify
 * nobody — everyone is in the main group and the feed itself is the signal.
 */
export function groupPostRecipients(
  groupId: string | null,
  participants: { profileId: string; muted: boolean }[],
  actorId: string,
): string[] {
  if (groupId === null) return []
  return participants.filter((p) => !p.muted && p.profileId !== actorId).map((p) => p.profileId)
}

/** Feed image paths live under the feed's folder ("main/" or "<groupId>/"), one level, no traversal. */
export function feedFolder(groupId: string | null): string {
  return groupId ?? 'main'
}

export function isValidFeedImagePath(groupId: string | null, path: string): boolean {
  const folder = feedFolder(groupId)
  if (!path.startsWith(`${folder}/`)) return false
  const rest = path.slice(folder.length + 1)
  return rest.length > 0 && !rest.includes('/') && !rest.includes('..') && !rest.includes('\\')
}

export const MAX_POST_BODY = 5000
export const MAX_COMMENT_BODY = 2000
export const MAX_POST_IMAGES = 4
export const FEED_PAGE_SIZE = 15
export const COMMENT_PAGE_SIZE = 20
export const REPLY_PAGE_SIZE = 10
export const NOTIFICATION_PAGE_SIZE = 20
export const MAX_PINNED = 5

/** Short single-line excerpt for notifications / reports. */
export function excerpt(text: string | null | undefined, max = 140): string | null {
  if (!text) return null
  const flat = plainMentions(text).replace(/\s+/g, ' ').trim()
  if (!flat) return null
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/**
 * Editing a post's photos: every kept/added path is either already on the
 * post or a fresh upload valid for the post's feed folder; no duplicates,
 * at most MAX_POST_IMAGES.
 */
export function validEditImagePaths(groupId: string | null, existing: readonly string[], next: readonly string[]): boolean {
  if (next.length > MAX_POST_IMAGES) return false
  if (new Set(next).size !== next.length) return false
  const had = new Set(existing)
  return next.every((p) => had.has(p) || isValidFeedImagePath(groupId, p))
}

/** Paths dropped by an edit (safe to delete from storage once the update has succeeded). */
export function removedImagePaths(existing: readonly string[], next: readonly string[]): string[] {
  const keep = new Set(next)
  return existing.filter((p) => !keep.has(p))
}

// ── @mentions ───────────────────────────────────────────────
// Stored in bodies as `@[Display Name](profile-uuid)`. The server validates
// every id against canMentionTarget and rewrites invalid tokens to plain
// `@Display Name` (no link, no notification). A mention grants nothing else.

export const MAX_MENTIONS = 10
const MENTION_RE = /@\[([^\]\n]{1,80})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi

export interface MentionToken {
  name: string
  id: string
  start: number
  end: number
}

export function parseMentions(body: string): MentionToken[] {
  const out: MentionToken[] = []
  for (const m of body.matchAll(MENTION_RE)) {
    out.push({ name: m[1]!, id: m[2]!.toLowerCase(), start: m.index!, end: m.index! + m[0].length })
  }
  return out
}

/** Distinct mentioned ids in order of first appearance. */
export function mentionIds(body: string): string[] {
  return [...new Set(parseMentions(body).map((t) => t.id))]
}

/**
 * Keep tokens whose id is allowed (first MAX_MENTIONS distinct ids); rewrite
 * the rest to plain `@Name`. Returns the new body and the kept ids.
 */
export function rewriteMentions(body: string, allowed: ReadonlySet<string>, max = MAX_MENTIONS): { body: string; ids: string[] } {
  const kept: string[] = []
  const out = body.replace(MENTION_RE, (_all, name: string, rawId: string) => {
    const id = rawId.toLowerCase()
    if (allowed.has(id) && (kept.includes(id) || kept.length < max)) {
      if (!kept.includes(id)) kept.push(id)
      return `@[${name}](${id})`
    }
    return `@${name}`
  })
  return { body: out, ids: kept }
}

/** Plain-text view of a body (notifications, excerpts): tokens become `@Name`. */
export function plainMentions(body: string): string {
  return body.replace(MENTION_RE, (_all, name: string) => `@${name}`)
}

export interface MentionTarget {
  id: string
  isAdmin: boolean
  isActiveMember: boolean
}

export interface MentionContext {
  /** a block exists either way between viewer and target */
  blocked: boolean
  /** accepted/completed introduction between their members rows */
  introduced: boolean
  /** post author or a (visible) commenter on this post */
  inThread: boolean
  /** group feed: target is an active participant of the post's group */
  inGroup: boolean
}

/**
 * Members may tag: introduced members, the Club team, the post's author and
 * its commenters, and (group feeds) the group's participants. Admins / owner
 * may tag anyone active. Never self, never across a block, never inactive people.
 */
export function canMentionTarget(v: PolicyViewer, t: MentionTarget, ctx: MentionContext): boolean {
  if (t.id === v.id || ctx.blocked) return false
  if (!isActiveUser(v)) return false
  if (!(t.isAdmin || t.isActiveMember)) return false
  if (v.isAdmin || v.isOwner) return true
  return t.isAdmin || ctx.introduced || ctx.inThread || ctx.inGroup
}

/** Ids newly mentioned by an edit (only these get notified). */
export function newMentions(before: readonly string[], after: readonly string[]): string[] {
  const had = new Set(before)
  return after.filter((id) => !had.has(id))
}

/**
 * Merge comment/reply notification targets with mentions for one event:
 * one notification per person, 'mention' wins; never the actor.
 */
export function mergeMentionTargets(
  targets: { recipientId: string; kind: FeedNotificationKind | 'mention' }[],
  mentioned: readonly string[],
  actorId: string,
): { recipientId: string; kind: FeedNotificationKind | 'mention' }[] {
  const out = new Map<string, FeedNotificationKind | 'mention'>()
  for (const id of mentioned) if (id !== actorId) out.set(id, 'mention')
  for (const t of targets) if (t.recipientId !== actorId && !out.has(t.recipientId)) out.set(t.recipientId, t.kind)
  return [...out].map(([recipientId, kind]) => ({ recipientId, kind }))
}
