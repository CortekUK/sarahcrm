// Conversation list (cursor-paged, 20 per page) and single-conversation detail.

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { chatClient } from '@/lib/http/chat-client'
import { useChat } from '../ChatProvider'
import type { ConversationDetail, ConversationPage } from '../contract'
import { chatKeys } from '../keys'
import type { ConversationListParams } from '../types'

export function useConversations(params: ConversationListParams = {}) {
  const { ready } = useChat()
  const scope = params.scope ?? 'mine'
  return useInfiniteQuery({
    queryKey: chatKeys.conversations(params),
    enabled: ready,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) =>
      (
        await chatClient.get<ConversationPage>('/conversations', {
          signal,
          params: {
            scope,
            limit: 20,
            q: params.q || undefined,
            kind: params.kind || undefined,
            cursor: pageParam ?? undefined,
          },
        })
      ).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Socket events keep lists fresh; don't refetch on every mount.
    staleTime: 5 * 60_000,
  })
}

export function useConversation(id: string | null) {
  const { ready } = useChat()
  return useQuery({
    queryKey: chatKeys.conversation(id ?? ''),
    enabled: ready && !!id,
    queryFn: async ({ signal }) =>
      (await chatClient.get<ConversationDetail>(`/conversations/${id}`, { signal })).data,
    staleTime: 60_000,
    retry: 1,
  })
}
