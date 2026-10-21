'use client'

// Admin → Feed. The Club feed by default, or any group's Posts feed via the
// pills (?group=<conversationId>). Admins see hidden posts too (greyed with a
// "Hidden" label) and get pin / hide / remove on every post and hide /
// delete on comments. Reports land in Messages → Reports. Notification links
// for group posts point here (?group=…&post=…) so admins who aren't in the
// group can still open them.

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Newspaper, Users } from 'lucide-react'
import { useChat } from '@/lib/chat/ChatProvider'
import { useConversations } from '@/lib/chat/hooks'
import { cn } from '@/lib/utils'
import { FeedView } from '@/views/feed/FeedView'

export function FeedAdminPage() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { viewer } = useChat()
  const groups = useConversations({ scope: viewer?.canOversee ? 'all' : 'mine', kind: 'group' })
  const list = useMemo(
    () => (groups.data?.pages.flatMap((p) => p.conversations) ?? []).filter((c) => !c.isMain),
    [groups.data],
  )
  const groupId = params.get('group')
  const current = groupId ? list.find((c) => c.id === groupId) : undefined

  const pick = useCallback(
    (id: string | null) => {
      const q = new URLSearchParams(params.toString())
      q.delete('post')
      if (id) q.set('group', id)
      else q.delete('group')
      const qs = q.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )

  const pill = (active: boolean) =>
    cn(
      'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors',
      active ? 'bg-gold-muted text-text ring-1 ring-gold/25' : 'text-text-muted hover:bg-surface-2 hover:text-text',
    )

  return (
    <FeedView
      key={groupId ?? 'main'}
      groupId={groupId}
      isParticipant={current?.isParticipant ?? false}
      archived={!!current?.archivedAt}
      // Own scroll surface filling the viewport (like Messages): the admin
      // <main> clips overflow-x, which would stop a window-scroll sticky.
      embedded
      className="h-[calc(100dvh-3.5rem)] lg:h-dvh"
      stickyClassName="top-0"
      header={
        <div className="mb-3 min-w-0 px-1">
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">Feed</h1>
          <p className="mt-1 text-sm text-text-muted">
            {current ? `Posts in ${current.title}.` : 'The Club-wide feed.'} You can pin, hide or remove any post.
          </p>
          <div role="tablist" className="-mx-1 mt-3 flex min-w-0 items-center gap-1 overflow-x-auto pb-1">
            <button type="button" role="tab" aria-selected={!groupId} onClick={() => pick(null)} className={pill(!groupId)}>
              <Newspaper size={13} /> Club feed
            </button>
            {list.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={groupId === c.id}
                onClick={() => pick(c.id)}
                className={cn(pill(groupId === c.id), 'max-w-[220px]')}
              >
                <Users size={13} className="shrink-0" />
                <span className="truncate">{c.title}</span>
              </button>
            ))}
            {groups.hasNextPage && (
              <button type="button" onClick={() => void groups.fetchNextPage()} className={pill(false)}>
                More groups…
              </button>
            )}
          </div>
        </div>
      }
    />
  )
}
