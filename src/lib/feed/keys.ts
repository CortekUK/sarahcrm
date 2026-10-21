// TanStack Query keys for the Member Feed + in-app notifications. Everything
// lives under ['feed'] so sign-out drops it in one call and socket handlers
// can patch every cached feed through the ['feed','list'] prefix.

export const feedKeys = {
  all: ['feed'] as const,
  lists: () => ['feed', 'list'] as const,
  /** null = main Club feed */
  list: (groupId: string | null) => ['feed', 'list', groupId ?? 'main'] as const,
  post: (id: string) => ['feed', 'post', id] as const,
  comments: (postId: string) => ['feed', 'comments', postId] as const,
  replies: (commentId: string) => ['feed', 'replies', commentId] as const,
  notifications: () => ['feed', 'notifications'] as const,
}
