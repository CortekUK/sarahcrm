// Central TanStack Query keys for chat. Everything lives under ['chat'] so a
// sign-out can drop the whole namespace in one call, and socket handlers can
// patch every cached conversation list via the ['chat','conversations'] prefix.

import type { ConversationListParams } from './types'

export const chatKeys = {
  all: ['chat'] as const,
  me: () => ['chat', 'me'] as const,
  conversationLists: () => ['chat', 'conversations'] as const,
  conversations: (p: ConversationListParams) =>
    ['chat', 'conversations', { scope: p.scope ?? 'mine', q: p.q ?? '', kind: p.kind ?? '' }] as const,
  conversation: (id: string) => ['chat', 'conversation', id] as const,
  messages: (id: string) => ['chat', 'messages', id] as const,
  people: (q: string) => ['chat', 'people', q] as const,
  person: (id: string) => ['chat', 'person', id] as const,
  reports: (status: string) => ['chat', 'reports', status] as const,
  staffAccess: () => ['chat', 'staff-access'] as const,
  staffCandidates: () => ['chat', 'staff-candidates'] as const,
}
