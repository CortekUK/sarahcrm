// Holds the Socket.IO server so REST handlers and socket handlers broadcast
// through the same helpers. Room names live here too.
import type { Server } from 'socket.io'
import type {
  ConversationUpdatedEvent,
  FeedCommentDeletedEvent,
  FeedCommentEvent,
  FeedLikeEvent,
  FeedPostDeletedEvent,
  FeedPostEvent,
  NotificationNewEvent,
  NotificationSnapshot,
  MessageDeletedEvent,
  MessageNewEvent,
  ReadEvent,
  TypingEvent,
  UnreadSnapshot,
  ViewerUpdatedEvent,
} from './contract.js'

export interface ServerToClient {
  'unread:snapshot': (p: UnreadSnapshot) => void
  'message:new': (p: MessageNewEvent) => void
  'message:deleted': (p: MessageDeletedEvent) => void
  'conversation:updated': (p: ConversationUpdatedEvent) => void
  typing: (p: TypingEvent) => void
  read: (p: ReadEvent) => void
  'viewer:updated': (p: ViewerUpdatedEvent) => void
  // Member Feed
  'feed:post:new': (p: FeedPostEvent) => void
  'feed:post:updated': (p: FeedPostEvent) => void
  'feed:post:deleted': (p: FeedPostDeletedEvent) => void
  'feed:comment:new': (p: FeedCommentEvent) => void
  'feed:comment:updated': (p: FeedCommentEvent) => void
  'feed:comment:deleted': (p: FeedCommentDeletedEvent) => void
  'feed:like': (p: FeedLikeEvent) => void
  'notification:new': (p: NotificationNewEvent) => void
  'notifications:snapshot': (p: NotificationSnapshot) => void
}

export type ChatIo = Server<Record<string, (...args: any[]) => void>, ServerToClient>

export const userRoom = (profileId: string) => `user:${profileId}`
export const convRoom = (conversationId: string) => `conv:${conversationId}`
/** Every socket of a viewer with canOversee — receives overseer-perspective copies of fan-outs. */
export const OVERSEE_ROOM = 'oversee'
/** Feed rooms: `feed:main` (Club feed) and `feed:{groupId}` — joined while the feed view is open. */
export const feedRoom = (groupId: string | null) => `feed:${groupId ?? 'main'}`
/** Every socket of a feed moderator (admin / owner) — receives hidden posts/comments. */
export const FEED_MOD_ROOM = 'feed-mod'

let io: ChatIo | null = null

export function setIo(server: ChatIo) {
  io = server
}

export function getIo(): ChatIo | null {
  return io
}
