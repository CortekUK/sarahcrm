// People the viewer may start a DM with (GET /people — admins: all active
// members + admins; members: introduced members + admins). Cursor-paged.

import { useInfiniteQuery } from '@tanstack/react-query'
import { chatClient } from '@/lib/http/chat-client'
import { useChat } from '../ChatProvider'
import type { ChatPerson } from '../contract'
import { chatKeys } from '../keys'
import type { PeoplePage } from '../contract'

function toPage(data: PeoplePage | ChatPerson[]): PeoplePage {
  return Array.isArray(data) ? { people: data, nextCursor: null } : data
}

export function usePeople(q: string, opts: { enabled?: boolean; excludeDm?: boolean } = {}) {
  const { ready } = useChat()
  return useInfiniteQuery({
    queryKey: [...chatKeys.people(q), opts.excludeDm ? 'no-dm' : 'all'],
    enabled: ready && (opts.enabled ?? true),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) =>
      toPage(
        (
          await chatClient.get<PeoplePage | ChatPerson[]>('/people', {
            signal,
            params: { q: q || undefined, cursor: pageParam ?? undefined, excludeDm: opts.excludeDm ? 1 : undefined },
          })
        ).data,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  })
}
