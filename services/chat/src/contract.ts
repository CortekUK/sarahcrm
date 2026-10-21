// Wire contract shared with the Next app (src/lib/chat/contract.ts).
// Railway's root-directory isolation means we can't import across the repo,
// so this is a deliberate copy of docs/CHAT-ARCHITECTURE.md — keep identical.

export type ConversationKind = 'dm' | 'group' | 'event'

export interface ChatPerson {
  id: string
  name: string
  avatarUrl: string | null
  company: string | null
  jobTitle: string | null
  isAdmin: boolean
}

export interface ChatAttachment {
  path: string
  url: string
  name: string
  mime: string
  size: number
  width?: number
  height?: number
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string | null
  kind: 'text' | 'system'
  body: string | null
  attachments: ChatAttachment[]
  clientId: string | null
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
}

export interface ConversationSummary {
  id: string
  kind: ConversationKind
  title: string
  avatarUrl: string | null
  isMain: boolean
  isJoinable: boolean
  eventId: string | null
  closesAt: string | null
  archivedAt: string | null
  readOnly: boolean
  lastMessage: ChatMessage | null
  lastMessageAt: string | null
  unread: number
  participantCount: number
  otherPerson: ChatPerson | null /* dm only */
  isParticipant: boolean
  /** viewer muted it: still counted per conversation, excluded from badge totals */
  muted: boolean
}

export interface ConversationDetail extends ConversationSummary {
  description: string | null
  participants: (ChatPerson & { role: 'owner' | 'admin' | 'member' })[]
  myLastReadAt: string | null
  /** dm only: the other participant's last_read_at ("Seen"); null for overseers / non-dm */
  otherLastReadAt: string | null
  /** dm only: the viewer has blocked the other person */
  blockedByMe: boolean
  /** dm only: the other person has blocked the viewer */
  blockedMe: boolean
}

export interface MessagePage {
  messages: ChatMessage[] // NEWEST FIRST
  nextCursor: string | null
}

export interface ConversationPage {
  conversations: ConversationSummary[]
  nextCursor: string | null
}

export interface Viewer {
  id: string
  isOwner: boolean
  isAdmin: boolean
  canOversee: boolean
}

// ── Clarifications not spelled out in the doc (shapes the service returns) ──

export interface PeoplePage {
  people: ChatPerson[]
  nextCursor: string | null
}

export interface ChatReport {
  id: string
  conversationId: string
  conversationTitle: string
  messageId: string | null
  message: ChatMessage | null
  reporterId: string | null
  reporter: ChatPerson | null
  reason: string
  status: 'open' | 'reviewed' | 'dismissed'
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  /** feed report: the reported post (or the post a reported comment is on) */
  postId: string | null
  /** feed report: the reported comment */
  commentId: string | null
  /** feed report: group feed the post is in (null = main feed) */
  feedGroupId: string | null
  /** feed report: the reported post/comment body, shown to reviewers even if removed */
  feedBody: string | null
}

export interface ReportPage {
  reports: ChatReport[]
  nextCursor: string | null
}

export interface StaffAccessEntry {
  profileId: string
  grantedBy: string | null
  createdAt: string
  person: ChatPerson | null
}

export interface UploadTicket {
  path: string
  signedUrl: string
  token: string
}

export interface UnreadSnapshot {
  /** badge total — EXCLUDES muted conversations */
  total: number
  /** per conversation — includes muted ones */
  byConversation: Record<string, number>
  /** ids of conversations the viewer has muted */
  muted: string[]
}

/** GET /people/:id — a person the viewer may DM, plus their existing DM if it has messages. */
export interface PersonLookup {
  person: ChatPerson
  conversationId: string | null
}

// Socket payloads (server → client)
export interface MessageNewEvent {
  message: ChatMessage
  conversation: ConversationSummary
}
export interface MessageDeletedEvent {
  conversationId: string
  messageId: string
}
export interface ConversationUpdatedEvent {
  conversation: ConversationSummary
}
export interface TypingEvent {
  conversationId: string
  profileId: string
  name: string
  isTyping: boolean
}
export interface ReadEvent {
  conversationId: string
  profileId: string
  at: string
}
/** Viewer flags changed (e.g. staff access granted/revoked) — replace the /me viewer. */
export interface ViewerUpdatedEvent {
  viewer: Viewer
}

export type Ack<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

// ── Member Feed (main feed + group feeds) ───────────────────

export interface FeedImage {
  path: string
  url: string
  mime: string
  size: number
  width?: number
  height?: number
}

/**
 * A post. `likedByMe` is per viewer: REST responses fill it, socket copies
 * are shared and always carry `false` — clients keep their own value.
 */
export interface FeedPost {
  id: string
  /** null = main Club feed */
  groupId: string | null
  authorId: string | null
  author: ChatPerson | null
  body: string
  images: FeedImage[]
  clientId: string | null
  pinnedAt: string | null
  /** set = hidden by the Club team; only moderators + the author receive it */
  hiddenAt: string | null
  editedAt: string | null
  createdAt: string
  likeCount: number
  commentCount: number
  likedByMe: boolean
  /** people @mentioned in `body` (tokens `@[Name](profileId)`), resolved for rendering */
  mentions: ChatPerson[]
}

export interface FeedComment {
  id: string
  postId: string
  /** null = top-level comment; replies are one level deep */
  parentId: string | null
  authorId: string | null
  author: ChatPerson | null
  body: string
  clientId: string | null
  hiddenAt: string | null
  createdAt: string
  replyCount: number
  /** people @mentioned in `body`, resolved for rendering */
  mentions: ChatPerson[]
}

/** GET /feed — `pinned` is only filled on the first page (no cursor). Posts NEWEST FIRST. */
export interface FeedPage {
  pinned: FeedPost[]
  posts: FeedPost[]
  nextCursor: string | null
}

/** Top-level comments NEWEST FIRST; replies OLDEST FIRST. */
export interface FeedCommentPage {
  comments: FeedComment[]
  nextCursor: string | null
}

export interface FeedLikeResult {
  liked: boolean
  likeCount: number
}

export type NotificationKind = 'comment' | 'reply' | 'group_post' | 'mention'

export interface MemberNotification {
  id: string
  kind: NotificationKind
  actor: ChatPerson | null
  postId: string | null
  commentId: string | null
  /** group feed the post is in (null = main feed) */
  groupId: string | null
  groupTitle: string | null
  /** short excerpt of the comment (comment/reply) or post (group_post) */
  excerpt: string | null
  /** false when the post was removed or hidden from this viewer */
  available: boolean
  readAt: string | null
  createdAt: string
}

/** GET /feed/mentionable — people the viewer may @mention here (≤ 8, ranked). */
export interface MentionablePage {
  people: ChatPerson[]
}

export interface NotificationPage {
  notifications: MemberNotification[]
  nextCursor: string | null
  unread: number
}

export interface NotificationSnapshot {
  unread: number
}

// Feed socket payloads (server → client). Rooms: feed:main, feed:{groupId}.
export interface FeedPostEvent {
  post: FeedPost
}
export interface FeedPostDeletedEvent {
  postId: string
  groupId: string | null
}
export interface FeedCommentEvent {
  comment: FeedComment
  /** the post's visible comment total after this change */
  commentCount: number
  /** the parent's visible reply total (replies only) */
  replyCount: number | null
}
export interface FeedCommentDeletedEvent {
  postId: string
  commentId: string
  parentId: string | null
  commentCount: number
  replyCount: number | null
}
/** Count only. `liked` is present only on the copy sent to the liker's own sockets. */
export interface FeedLikeEvent {
  postId: string
  groupId: string | null
  likeCount: number
  liked?: boolean
}
export interface NotificationNewEvent {
  notification: MemberNotification
}
