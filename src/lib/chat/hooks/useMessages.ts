// A conversation's messages — useInfiniteQuery, 30 per page, newest first from
// the server. Page 0 is the newest; fetchNextPage() loads OLDER history (the
// thread calls it from a top-of-scroll sentinel). `messages` is flattened
// oldest → newest for rendering. Never fetches the whole history.

import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { chatClient } from '@/lib/http/chat-client'
import { useChat } from '../ChatProvider'
import { chatKeys } from '../keys'
import { flattenMessages } from '../merge'
import type { LocalChatMessage, LocalMessagePage } from '../types'

export const MESSAGES_PAGE_SIZE = 30

export function useMessages(conversationId: string | null) {
  const { ready } = useChat()
  const query = useInfiniteQuery({
    queryKey: chatKeys.messages(conversationId ?? ''),
    enabled: ready && !!conversationId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) =>
      (
        await chatClient.get<LocalMessagePage>(`/conversations/${conversationId}/messages`, {
          signal,
          params: { limit: MESSAGES_PAGE_SIZE, cursor: pageParam ?? undefined },
        })
      ).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // The socket patches this cache live; a refetch would re-request every
    // loaded page, so keep it fresh indefinitely (reconnect back-fills).
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })

  const messages = useMemo<LocalChatMessage[]>(() => flattenMessages(query.data?.pages), [query.data])

  return { ...query, messages }
}
