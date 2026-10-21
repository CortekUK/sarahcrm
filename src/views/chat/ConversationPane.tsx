'use client'

// Left column of Messages, WhatsApp-Web style: existing conversations (most
// recent first, live unread badges) and — below them, once every conversation
// page has loaded — "Start a conversation": everyone the viewer may message
// (GET /people?excludeDm=1, paged) minus people they already have a DM with.
// One search box filters both server-side (`q`). There is no "New" button:
// picking a person opens a draft thread; the DM is only created on first send.
// Empty DMs (no messages yet) are hidden so the person stays in the contacts
// section instead.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MessageCircle, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  ConversationList,
  ConversationListItem,
  ConversationListSkeleton,
} from '@/components/ui/chat'
import { useChat } from '@/lib/chat/ChatProvider'
import type { ChatPerson, ConversationSummary } from '@/lib/chat/contract'
import { useConversations, usePeople } from '@/lib/chat/hooks'
import { useTypingNames } from '@/lib/chat/stores'
import type { ConversationScope } from '@/lib/chat/types'
import { getApiErrorMessage } from '@/lib/http/chat-client'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { cn } from '@/lib/utils'
import { displayTitle, messagePreview } from './shared'

function Row({
  c,
  active,
  onSelect,
}: {
  c: ConversationSummary
  active: boolean
  onSelect: () => void
}) {
  const { viewer, unread, hasSnapshot, muted } = useChat()
  const typing = useTypingNames(c.id, viewer?.id).length > 0
  const count = c.id in unread ? unread[c.id] : hasSnapshot ? 0 : c.unread
  const closed = c.kind === 'event' && c.readOnly
  return (
    <ConversationListItem
      kind={c.kind}
      title={displayTitle(c)}
      avatarUrl={c.kind === 'dm' ? c.otherPerson?.avatarUrl : c.avatarUrl}
      isMain={c.isMain}
      preview={messagePreview(c.lastMessage, viewer?.id)}
      time={c.lastMessageAt}
      unread={active ? 0 : count}
      active={active}
      typing={typing}
      muted={muted.has(c.id) || c.muted}
      onSelect={onSelect}
      meta={
        c.archivedAt ? (
          <span className="text-[10px] uppercase tracking-[0.12em] text-text-dim">Archived</span>
        ) : closed ? (
          <span className="text-[10px] uppercase tracking-[0.12em] text-text-dim">Closed</span>
        ) : !c.isParticipant ? (
          <span className="text-[10px] uppercase tracking-[0.12em] text-text-dim">Not in</span>
        ) : null
      }
    />
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="sticky top-0 z-[1] border-b border-border/60 bg-[var(--chat-list-bg,var(--color-surface))] px-4 pb-1.5 pt-3 font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.18em] text-text-dim">
      {children}
    </p>
  )
}

function personLine(p: ChatPerson) {
  if (p.isAdmin) return 'The Club team'
  return [p.jobTitle, p.company].filter(Boolean).join(' · ') || 'Member'
}

export function ConversationPane({
  scope,
  selectedId,
  selectedPersonId,
  onSelect,
  onSelectPerson,
  showContacts,
  title = 'Messages',
  headerActions,
  top,
  banner,
  className,
}: {
  scope: ConversationScope
  selectedId: string | null
  selectedPersonId?: string | null
  onSelect: (id: string) => void
  onSelectPerson?: (person: ChatPerson) => void
  /** list people the viewer can start a DM with under the conversations */
  showContacts?: boolean
  title?: string
  headerActions?: ReactNode
  /** rendered above the title row (e.g. admin tabs) */
  top?: ReactNode
  banner?: ReactNode
  className?: string
}) {
  const [q, setQ] = useState('')
  const debounced = useDebouncedValue(q.trim(), 300)
  const list = useConversations({ scope, q: debounced })
  // Contacts load only after the last conversation page, so they always sit below.
  const contactsOn = !!showContacts && list.isSuccess && !list.hasNextPage
  const people = usePeople(debounced, { enabled: contactsOn, excludeDm: true })

  const conversations = useMemo(
    () =>
      (list.data?.pages.flatMap((p) => p.conversations) ?? []).filter(
        (c) => !(c.kind === 'dm' && !c.lastMessage && c.id !== selectedId),
      ),
    [list.data, selectedId],
  )
  const contacts = useMemo(() => {
    if (!contactsOn) return []
    // Belt and braces with the server's excludeDm: drop anyone already listed.
    const known = new Set(conversations.flatMap((c) => (c.kind === 'dm' && c.otherPerson ? [c.otherPerson.id] : [])))
    return (people.data?.pages.flatMap((p) => p.people) ?? []).filter((p) => !known.has(p.id))
  }, [contactsOn, people.data, conversations])

  // One bottom sentinel: page conversations first, then people.
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const wantMore = list.hasNextPage ? 'conv' : contactsOn && people.hasNextPage ? 'people' : null
  const busy = list.isFetchingNextPage || people.isFetchingNextPage
  const { fetchNextPage: nextConversations } = list
  const { fetchNextPage: nextPeople } = people
  useEffect(() => {
    const root = scrollRef.current
    const target = sentinelRef.current
    if (!root || !target || !wantMore || busy) return
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (wantMore === 'conv') void nextConversations()
        else void nextPeople()
      },
      { root, rootMargin: '0px 0px 240px 0px' },
    )
    io.observe(target)
    return () => io.disconnect()
  }, [wantMore, busy, nextConversations, nextPeople, conversations.length, contacts.length])

  const nothing = list.isSuccess && conversations.length === 0 && (!contactsOn || (people.isSuccess && contacts.length === 0))

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-[var(--chat-list-bg,var(--color-surface))]', className)}>
      <div className="shrink-0 border-b border-border px-4 pb-3 pt-3">
        {top}
        <div className="mb-2.5 flex min-h-9 items-center justify-between gap-2">
          <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">{title}</p>
          {headerActions && <div className="flex items-center gap-1">{headerActions}</div>}
        </div>
        <Input
          placeholder={showContacts ? 'Search chats and people…' : 'Search conversations…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          suffix={<Search size={14} className="text-text-dim" />}
          aria-label="Search"
        />
      </div>
      {banner}

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border-hover)_transparent]"
      >
        {list.isPending ? (
          <ConversationListSkeleton />
        ) : list.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-text-muted">
              {getApiErrorMessage(list.error, 'Messages are unavailable right now.')}
            </p>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => list.refetch()}>
              Try again
            </Button>
          </div>
        ) : nothing ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold-muted text-gold ring-1 ring-gold/15">
              <MessageCircle size={20} strokeWidth={1.5} />
            </span>
            <p className="text-sm font-medium text-text">{debounced ? 'No matches' : 'No conversations yet'}</p>
            <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-text-muted">
              {debounced
                ? 'Try a different name, company or group.'
                : scope === 'all'
                  ? 'Nobody has started a chat yet.'
                  : 'People you’ve been introduced to, and the Club team, will appear here.'}
            </p>
          </div>
        ) : (
          <>
            {conversations.length > 0 && (
              <>
                {contacts.length > 0 && <SectionLabel>Chats</SectionLabel>}
                <ConversationList>
                  {conversations.map((c) => (
                    <Row key={c.id} c={c} active={c.id === selectedId} onSelect={() => onSelect(c.id)} />
                  ))}
                </ConversationList>
              </>
            )}
            {contactsOn && contacts.length > 0 && (
              <>
                <SectionLabel>Start a conversation</SectionLabel>
                <ConversationList>
                  {contacts.map((p) => (
                    <ConversationListItem
                      key={`p-${p.id}`}
                      kind="dm"
                      title={p.name}
                      avatarUrl={p.avatarUrl}
                      preview={personLine(p)}
                      active={p.id === selectedPersonId}
                      onSelect={() => onSelectPerson?.(p)}
                    />
                  ))}
                </ConversationList>
              </>
            )}
            {contactsOn && people.isError && (
              <p className="px-4 py-4 text-center text-xs text-text-dim">
                {getApiErrorMessage(people.error, 'Couldn’t load people.')}
              </p>
            )}
            <div ref={sentinelRef} className="h-px" />
            {(busy || (contactsOn && people.isPending)) && <ConversationListSkeleton rows={2} />}
          </>
        )}
      </div>
    </div>
  )
}
