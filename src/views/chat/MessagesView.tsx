'use client'

// Shared Messages surface for the member portal (/portal/messages) and the
// admin (/dashboard/messages): a full-height, WhatsApp-Web style app surface —
// list column + thread, thin divider, no card. One pane on mobile (list ↔
// thread with a back button). URL state: `?c=<conversationId>` for an open
// chat, `?to=<profileId>` for a draft DM (nothing is created until the first
// message is sent). Other params (e.g. the admin tab) are preserved.
//
// Colours follow the active theme via `.chat-theme` (globals.css). Owner-only
// tools are injected by the admin page (`extraMenuItems` / list slots);
// members never get them. Degrades to a calm notice when the chat server is
// unreachable or chat isn't configured.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { Loader2, MessageCircle, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/providers/AuthProvider'
import { useChat } from '@/lib/chat/ChatProvider'
import { chatKeys } from '@/lib/chat/keys'
import { usePerson } from '@/lib/chat/hooks'
import type { ChatPerson, ConversationDetail, PeoplePage } from '@/lib/chat/contract'
import type { ConversationScope } from '@/lib/chat/types'
import { chatEnabled, getApiErrorMessage, isChatAuthError } from '@/lib/http/chat-client'
import { cn } from '@/lib/utils'
import { ConversationPane } from './ConversationPane'
import { DraftThreadPane, ThreadPane } from './ThreadPane'
import type { MenuItem } from './PopoverMenu'

export interface MessagesViewProps {
  scope?: ConversationScope
  className?: string
  listTitle?: string
  /** list "Start a conversation" people under the chats (off for "All chats") */
  allowContacts?: boolean
  listHeaderActions?: ReactNode
  /** rendered at the very top of the list column (admin tabs) */
  listTop?: ReactNode
  listBanner?: ReactNode
  extraMenuItems?: (c: ConversationDetail) => MenuItem[]
  /** URL param for a group thread's Chat | Posts switch ('tab' in the portal; admin uses 'view') */
  threadTabParam?: string
}

function Notice({ icon, title, body, action, className }: { icon: ReactNode; title: string; body: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('chat-theme flex h-full items-center justify-center px-6', className)}>
      <div className="flex max-w-sm flex-col items-center text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-muted text-gold ring-1 ring-gold/15">
          {icon}
        </span>
        <span className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">{title}</span>
        <span className="mt-1.5 text-sm leading-relaxed text-text-muted">{body}</span>
        {action}
      </div>
    </div>
  )
}

export function MessagesView({
  scope = 'mine',
  className,
  listTitle,
  allowContacts = true,
  listHeaderActions,
  listTop,
  listBanner,
  extraMenuItems,
  threadTabParam = 'tab',
}: MessagesViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const qc = useQueryClient()
  const { loading: authLoading } = useAuth()
  const { enabled, ready, meError, connection } = useChat()
  const selectedId = params.get('c')
  const toId = params.get('to')
  const [draft, setDraft] = useState<ChatPerson | null>(null)
  const showContacts = allowContacts && scope === 'mine'

  const go = useCallback(
    (next: { c?: string | null; to?: string | null }) => {
      const q = new URLSearchParams(params.toString())
      q.delete('c')
      q.delete('to')
      // A different thread starts on its Chat view with no post open.
      if (next.c !== selectedId) {
        q.delete(threadTabParam)
        q.delete('post')
      }
      if (next.c) q.set('c', next.c)
      if (next.to) q.set('to', next.to)
      const qs = q.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, pathname, router, selectedId, threadTabParam],
  )

  // The draft person comes from the click, or (after a reload) the people cache.
  let draftPerson: ChatPerson | null = null
  if (toId && showContacts) {
    if (draft?.id === toId) draftPerson = draft
    else {
      for (const [, data] of qc.getQueriesData<InfiniteData<PeoplePage>>({ queryKey: ['chat', 'people'] })) {
        const hit = data?.pages.flatMap((p) => p.people).find((p) => p.id === toId)
        if (hit) {
          draftPerson = hit
          break
        }
      }
    }
  }

  // Not in any loaded list (e.g. after a reload) → GET /people/:id. If they
  // already have a DM with messages, open that instead; a 404 drops the draft.
  const lookup = usePerson(toId, { enabled: showContacts && !!toId && !draftPerson })
  if (!draftPerson && lookup.data && !lookup.data.conversationId) draftPerson = lookup.data.person
  const lookupConversation = lookup.data?.conversationId ?? null
  const lookupFailed = lookup.isError
  useEffect(() => {
    if (lookupConversation) go({ c: lookupConversation })
    else if (lookupFailed) go({})
  }, [lookupConversation, lookupFailed]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!chatEnabled) {
    return (
      <Notice
        className={className}
        icon={<MessageCircle size={22} strokeWidth={1.5} />}
        title="Messages aren’t switched on yet"
        body="Member messaging is coming soon."
      />
    )
  }
  if (authLoading || (enabled && !ready && !meError)) {
    return (
      <div className={cn('chat-theme flex h-full items-center justify-center text-text-dim', className)}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }
  if (!enabled || meError) {
    const auth = !enabled || isChatAuthError(meError)
    return (
      <Notice
        className={className}
        icon={<WifiOff size={22} strokeWidth={1.5} />}
        title={auth ? 'Messages aren’t available' : 'Messages are offline'}
        body={
          auth
            ? 'Messaging is for active members and the Club team.'
            : getApiErrorMessage(meError, 'We couldn’t reach the messaging service. Please try again shortly.')
        }
        action={
          !auth ? (
            <Button variant="secondary" size="sm" className="mt-5" onClick={() => qc.refetchQueries({ queryKey: chatKeys.me() })}>
              Try again
            </Button>
          ) : undefined
        }
      />
    )
  }

  const threadOpen = !!selectedId || !!draftPerson

  return (
    <div className={cn('chat-theme relative flex h-full min-h-0 overflow-hidden', className)}>
      <ConversationPane
        scope={scope}
        selectedId={selectedId}
        selectedPersonId={draftPerson?.id ?? null}
        onSelect={(id) => go({ c: id })}
        onSelectPerson={(p) => {
          setDraft(p)
          go({ to: p.id })
        }}
        showContacts={showContacts}
        title={listTitle}
        headerActions={listHeaderActions}
        top={listTop}
        banner={
          <>
            {listBanner}
            {(connection === 'reconnecting' || connection === 'error') && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border bg-accent-warm/[0.08] px-4 py-2 text-xs text-text-muted">
                <WifiOff size={13} className="text-accent-warm" />
                Reconnecting — new messages will appear when you’re back online.
              </div>
            )}
          </>
        }
        className={cn(
          'w-full border-r border-border md:w-[340px] md:shrink-0 xl:w-[380px]',
          threadOpen ? 'hidden md:flex' : 'flex',
        )}
      />

      <div className={cn('min-w-0 flex-1 flex-col', threadOpen ? 'flex' : 'hidden md:flex')}>
        {selectedId ? (
          <ThreadPane
            key={selectedId}
            conversationId={selectedId}
            onBack={() => go({})}
            overseer={scope === 'all'}
            extraMenuItems={extraMenuItems}
            basePath={pathname}
            tabParam={threadTabParam}
          />
        ) : draftPerson ? (
          <DraftThreadPane
            key={`to-${draftPerson.id}`}
            person={draftPerson}
            onBack={() => go({})}
            onStarted={(id) => {
              setDraft(null)
              go({ c: id })
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-[var(--chat-thread-bg,var(--color-surface-2))] px-6 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-muted text-gold ring-1 ring-gold/15">
              <MessageCircle size={22} strokeWidth={1.5} />
            </span>
            <span className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">Your messages</span>
            <span className="mt-1.5 max-w-sm text-sm leading-relaxed text-text-muted">
              {showContacts
                ? 'Pick a conversation, or anyone under “Start a conversation”, to begin.'
                : 'Pick a conversation on the left.'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
