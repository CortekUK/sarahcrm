// Frontend-only feed types: optimistic post/comment state on top of the
// shared contract shapes (src/lib/chat/contract.ts).

import type { FeedComment, FeedCommentPage, FeedPage, FeedPost } from '@/lib/chat/contract'

export interface LocalFeedPost extends FeedPost {
  _status?: 'sending' | 'failed'
  /** upload progress 0..1 per image while sending */
  _progress?: number[]
  /** files kept so a failed post can be retried */
  _files?: File[]
  _error?: string
}

export interface LocalFeedPage extends Omit<FeedPage, 'posts' | 'pinned'> {
  pinned: LocalFeedPost[]
  posts: LocalFeedPost[]
}

export interface LocalFeedComment extends FeedComment {
  _status?: 'sending' | 'failed'
  _error?: string
}

export interface LocalCommentPage extends Omit<FeedCommentPage, 'comments'> {
  comments: LocalFeedComment[]
}

/** Where notification / post links point — differs between portal and admin. */
export interface FeedLinks {
  /** main feed page, e.g. /portal/feed */
  feed: string
  /** link to one post in a group feed */
  groupPost: (groupId: string, postId: string) => string
}
