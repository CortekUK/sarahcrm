'use client'

// Right pane of Messages: header (title, participants / company, actions
// menu), the paged message scroller (older pages load at the top, scroll
// position preserved), typing indicator, and the composer — or a locked bar
// explaining why the viewer can't write (closed event chat, blocked DM,
// archived, overseer view, not joined). Group threads get a Chat | Posts
// switch (`?tab=posts`, param name configurable): Posts renders the Member
// Feed scoped to that group (the main group's Posts = the Club feed).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import {
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Eye,
  Flag,
  Loader2,
  LogOut,
  MessageCircle,
  MoreVertical,
  Newspaper,
  RefreshCw,
  ShieldOff,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  Composer,
  ConversationAvatar,
  Marker,
  MarkerContent,
  MessageScroller,
  TypingIndicator,
} from '@/components/ui/chat'
import { useChat } from '@/lib/chat/ChatProvider'
import type { ChatPerson, ConversationDetail } from '@/lib/chat/contract'
import {
  MAX_ATTACHMENTS,
  useBlock,
  useCreateDm,
  useConversation,
  useDeleteMessage,
  useJoinConversation,
  useLeaveConversation,
  useMarkRead,
  useMessages,
  useMute,
  useSendMessage,
  useTyping,
  validateAttachment,
} from '@/lib/chat/hooks'
import { useTypingNames } from '@/lib/chat/stores'
import { messageKey } from '@/lib/chat/merge'
import { chatKeys } from '@/lib/chat/keys'
import type { LocalChatMessage, LocalMessagePage } from '@/lib/chat/types'
import { getApiErrorMessage, isChatAuthError } from '@/lib/http/chat-client'
import { toast } from '@/lib/hooks/use-toast'
import { ConfirmModal } from './ConfirmModal'
import { ParticipantsModal } from './ParticipantsModal'
import { PopoverMenu, type MenuItem } from './PopoverMenu'
import { ReportModal } from './ReportModal'
import { ThreadMessages } from './ThreadMessages'
import { FeedView } from '@/views/feed/FeedView'
import { cn } from '@/lib/utils'
import { conversationSubtitle, displayTitle, lockedReason } from './shared'

type Confirm = 'block' | 'unblock' | 'leave' | null

export function ThreadPane({
  conversationId,
  onBack,
  overseer,
  extraMenuItems,
  basePath,
  tabParam = 'tab',
}: {
  conversationId: string
  onBack: () => void
  /** "All chats" tab — reading as an overseer */
  overseer?: boolean
  extraMenuItems?: (c: ConversationDetail) => MenuItem[]
  basePath: string
  /** URL param holding the group thread's Chat | Posts choice */
  tabParam?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { viewer, setActiveConversation, muted: mutedSet } = useChat()
  const mute = useMute()
  const detail = useConversation(conversationId)
  const c = detail.data
  const thread = useMessages(conversationId)
  const { messages } = thread
  const { send, retry, discard } = useSendMessage(conversationId)
  const deleteMessage = useDeleteMessage()
  const join = useJoinConversation()
  const leave = useLeaveConversation()
  const block = useBlock()

  const [showParticipants, setShowParticipants] = useState(false)
  const [reportTarget, setReportTarget] = useState<{ conversationId: string; messageId?: string } | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [deleteTarget, setDeleteTarget] = useState<LocalChatMessage | null>(null)

  // Group threads: Chat | Posts (Posts = this group's feed).
  const view: 'chat' | 'posts' = c?.kind === 'group' && params.get(tabParam) === 'posts' ? 'posts' : 'chat'
  const setView = useCallback(
    (next: 'chat' | 'posts') => {
      const q = new URLSearchParams(params.toString())
      if (next === 'posts') q.set(tabParam, 'posts')
      else q.delete(tabParam)
      q.delete('post')
      const qs = q.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, pathname, router, tabParam],
  )

  // Join the socket room for this thread while its chat is showing (on Posts
  // the feed room is joined instead, and new messages count as unread).
  useEffect(() => {
    if (view !== 'chat') return
    setActiveConversation(conversationId)
    return () => setActiveConversation(null)
  }, [conversationId, setActiveConversation, view])

  const isParticipant = !!c?.isParticipant
  const locked = c ? lockedReason(c, { overseer: overseer || (!!viewer?.canOversee && !c.isParticipant) }) : null
  const canWrite = !!c && !locked

  const newest = messages[messages.length - 1]
  useMarkRead(conversationId, newest?.id, { enabled: isParticipant && view === 'chat' })
  const typing = useTyping(conversationId, { enabled: canWrite && view === 'chat' })
  const typingNames = useTypingNames(conversationId, viewer?.id)

  const onLoadOlder = useCallback(() => {
    if (thread.hasNextPage && !thread.isFetchingNextPage) void thread.fetchNextPage()
  }, [thread])

  const menu = useMemo<MenuItem[]>(() => {
    if (!c) return []
    const items: MenuItem[] = []
    if (c.kind !== 'dm') {
      items.push({ key: 'people', label: 'View participants', icon: Users, onSelect: () => setShowParticipants(true) })
    }
    if (isParticipant) {
      const isMuted = mutedSet.has(c.id) || c.muted
      items.push({
        key: 'mute',
        label: isMuted ? 'Unmute' : 'Mute',
        icon: isMuted ? Bell : BellOff,
        onSelect: () =>
          mute.mutate(
            { id: c.id, muted: !isMuted },
            { onError: (e) => toast({ title: 'Couldn’t update', description: getApiErrorMessage(e), variant: 'destructive' }) },
          ),
      })
      items.push({
        key: 'report',
        label: 'Report conversation',
        icon: Flag,
        onSelect: () => setReportTarget({ conversationId: c.id }),
      })
    }
    if (c.kind === 'dm' && c.otherPerson && isParticipant && !c.otherPerson.isAdmin) {
      // Unblock only undoes MY block; if they blocked me there's nothing to undo here.
      items.push(
        c.blockedByMe
          ? { key: 'unblock', label: `Unblock ${c.otherPerson.name.split(' ')[0]}`, icon: ShieldOff, onSelect: () => setConfirm('unblock') }
          : { key: 'block', label: `Block ${c.otherPerson.name.split(' ')[0]}`, icon: Ban, danger: true, onSelect: () => setConfirm('block') },
      )
    }
    if (c.kind === 'group' && !c.isMain && isParticipant) {
      items.push({ key: 'leave', label: 'Leave group', icon: LogOut, danger: true, onSelect: () => setConfirm('leave') })
    }
    return [...(extraMenuItems?.(c) ?? []), ...items]
  }, [c, isParticipant, extraMenuItems, mutedSet, mute])

  async function runConfirm() {
    if (!c) return
    try {
      if (confirm === 'block' || confirm === 'unblock') {
        await block.mutateAsync({ profileId: c.otherPerson!.id, block: confirm === 'block' })
        toast({ title: confirm === 'block' ? 'Blocked' : 'Unblocked' })
      } else if (confirm === 'leave') {
        await leave.mutateAsync(c.id)
        toast({ title: `You left ${c.title}` })
        router.replace(basePath)
      }
      setConfirm(null)
    } catch (e) {
      toast({ title: 'Something went wrong', description: getApiErrorMessage(e), variant: 'destructive' })
    }
  }

  async function runDelete() {
    if (!deleteTarget) return
    try {
      await deleteMessage.mutateAsync({ conversationId, messageId: deleteTarget.id })
      setDeleteTarget(null)
    } catch (e) {
      toast({ title: 'Couldn’t delete', description: getApiErrorMessage(e), variant: 'destructive' })
    }
  }

  // ── States ───────────────────────────────────────────────────────────
  if (detail.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-text-dim">
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }
  if (detail.isError || !c) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-text-muted">
          {isChatAuthError(detail.error)
            ? 'You don’t have access to this conversation.'
            : getApiErrorMessage(detail.error, 'This conversation couldn’t be loaded.')}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
          {!isChatAuthError(detail.error) && (
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => detail.refetch()}>
              Try again
            </Button>
          )}
        </div>
      </div>
    )
  }

  const title = displayTitle(c)
  const viewingAsOverseer = !c.isParticipant && !!viewer?.canOversee

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex min-w-0 shrink-0 items-center gap-3 border-b border-border bg-[var(--chat-header-bg,var(--color-surface))] px-3 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text md:hidden"
        >
          <ArrowLeft size={18} />
        </button>
        <ConversationAvatar
          kind={c.kind}
          title={title}
          avatarUrl={c.kind === 'dm' ? c.otherPerson?.avatarUrl : c.avatarUrl}
          isMain={c.isMain}
        />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => c.kind !== 'dm' && setShowParticipants(true)}
          disabled={c.kind === 'dm'}
        >
          <span className="block truncate font-[family-name:var(--font-heading)] text-base font-semibold text-text">{title}</span>
          <span className="block truncate text-xs text-text-dim">
            {typingNames.length > 0 ? <span className="italic text-gold">typing…</span> : conversationSubtitle(c)}
          </span>
        </button>
        {viewingAsOverseer && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-accent-blue/10 px-2.5 py-1 font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.12em] text-accent-blue sm:inline-flex">
            <Eye size={12} /> Viewing as overseer
          </span>
        )}
        <PopoverMenu label="Conversation options" items={menu} trigger={<MoreVertical size={17} />} className="shrink-0" />
      </div>

      {viewingAsOverseer && (
        <div className="shrink-0 border-b border-border bg-accent-blue/[0.06] px-5 py-2 text-xs text-text-muted sm:hidden">
          Viewing as overseer — read only.
        </div>
      )}

      {c.kind === 'group' && (
        <div className="flex shrink-0 items-center border-b border-border bg-[var(--chat-header-bg,var(--color-surface))] px-3 py-1.5 sm:px-5">
          <div role="tablist" aria-label="Group view" className="inline-flex rounded-full bg-surface-2 p-0.5">
            {(
              [
                { value: 'chat', label: 'Chat', icon: MessageCircle },
                { value: 'posts', label: 'Posts', icon: Newspaper },
              ] as const
            ).map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={view === t.value}
                onClick={() => setView(t.value)}
                className={cn(
                  'inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors',
                  view === t.value ? 'bg-surface text-text shadow-[var(--shadow-sm)] ring-1 ring-gold/20' : 'text-text-muted hover:text-text',
                )}
              >
                <t.icon size={14} className={view === t.value ? 'text-gold' : undefined} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'posts' ? (
        <FeedView
          embedded
          groupId={c.isMain ? null : c.id}
          isParticipant={c.isParticipant}
          archived={!!c.archivedAt}
          className="bg-[var(--chat-thread-bg,var(--color-surface-2))]"
        />
      ) : (
      <>

      {/* Thread */}
      {/* No `key` here: ThreadPane itself is keyed by conversation in
          MessagesView. (Keying both this and the Composer by the same id made
          them duplicate-key siblings — React then kept stale scrollers.) */}
      <MessageScroller
        className="bg-[var(--chat-thread-bg,var(--color-surface-2))] px-3 py-4 sm:px-6"
        contentClassName="gap-0.5"
        newestKey={newest ? messageKey(newest) : null}
        oldestKey={messages[0] ? messageKey(messages[0]) : null}
        newestIsMine={!!newest && newest.senderId === viewer?.id}
        hasOlder={!!thread.hasNextPage}
        loadingOlder={thread.isFetchingNextPage}
        onLoadOlder={onLoadOlder}
        header={
          !thread.hasNextPage && thread.isSuccess && messages.length > 0 ? (
            <Marker variant="separator" className="mb-2">
              <MarkerContent className="text-[11px] text-text-dim">Start of conversation</MarkerContent>
            </Marker>
          ) : null
        }
        footer={<TypingIndicator names={typingNames} className="mt-1" />}
      >
        {thread.isLoading ? (
          <div className="flex justify-center py-16 text-text-dim">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : thread.isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-text-muted">{getApiErrorMessage(thread.error, 'Messages couldn’t be loaded.')}</p>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={() => thread.refetch()}>
              Try again
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <ConversationAvatar kind={c.kind} title={title} avatarUrl={c.kind === 'dm' ? c.otherPerson?.avatarUrl : c.avatarUrl} isMain={c.isMain} />
            <span className="mt-3 text-sm font-medium text-text">
              {c.kind === 'dm' ? `Say hello to ${title.split(' ')[0]}` : 'No messages yet'}
            </span>
            <span className="mt-1 max-w-xs text-xs leading-relaxed text-text-muted">
              {canWrite ? 'Messages are private to the people in this conversation.' : locked}
            </span>
          </div>
        ) : (
          <ThreadMessages
            conversation={c}
            messages={messages}
            meId={viewer?.id ?? null}
            canModerate={!!viewer?.isOwner}
            canWrite={isParticipant}
            onRetry={(m) => void retry(m)}
            onDiscard={discard}
            onDelete={setDeleteTarget}
            onReport={(m) => setReportTarget({ conversationId: c.id, messageId: m.id })}
          />
        )}
      </MessageScroller>

      <Composer
        disabled={!canWrite}
        disabledReason={locked}
        disabledAction={
          c.kind === 'dm' && c.blockedByMe && isParticipant ? (
            <Button variant="secondary" size="sm" onClick={() => setConfirm('unblock')}>
              Unblock
            </Button>
          ) : !c.isParticipant && c.isJoinable && !overseer ? (
            <Button
              size="sm"
              loading={join.isPending}
              onClick={() =>
                join.mutate(c.id, {
                  onError: (e) => toast({ title: 'Couldn’t join', description: getApiErrorMessage(e), variant: 'destructive' }),
                })
              }
            >
              Join group
            </Button>
          ) : null
        }
        placeholder={c.kind === 'dm' ? `Message ${title.split(' ')[0]}…` : `Message ${title}…`}
        maxFiles={MAX_ATTACHMENTS}
        validateFile={validateAttachment}
        onError={(msg) => toast({ title: 'Can’t attach that', description: msg, variant: 'destructive' })}
        onTyping={typing.onInput}
        onSend={({ body, files }) => {
          typing.stop()
          void send({ body, files })
        }}
      />
      </>
      )}

      <ParticipantsModal
        conversation={c}
        open={showParticipants}
        onClose={() => setShowParticipants(false)}
        meId={viewer?.id}
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        loading={block.isPending || leave.isPending}
        danger={confirm !== 'unblock'}
        title={
          confirm === 'block'
            ? `Block ${c.otherPerson?.name ?? 'this person'}?`
            : confirm === 'unblock'
              ? `Unblock ${c.otherPerson?.name ?? 'this person'}?`
              : `Leave ${c.title}?`
        }
        description={
          confirm === 'block'
            ? 'Neither of you will be able to message the other. They aren’t told. You can unblock later.'
            : confirm === 'unblock'
              ? 'You’ll both be able to message each other again.'
              : 'You’ll stop receiving messages from this group. The Club team can add you back.'
        }
        confirmLabel={confirm === 'block' ? 'Block' : confirm === 'unblock' ? 'Unblock' : 'Leave group'}
        onConfirm={runConfirm}
      />
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        loading={deleteMessage.isPending}
        danger
        title="Delete this message?"
        description="It will be removed for everyone in the conversation."
        confirmLabel="Delete"
        onConfirm={runDelete}
      />
    </div>
  )
}

// Draft DM: a person picked from "Start a conversation" who has no DM with
// the viewer yet. Nothing is created until the first send — then the DM is
// found-or-created, the thread cache seeded (empty, so the optimistic message
// shows instantly), the message sent, and the URL swapped to ?c=<id>.
export function DraftThreadPane({
  person,
  onBack,
  onStarted,
}: {
  person: ChatPerson
  onBack: () => void
  onStarted: (conversationId: string) => void
}) {
  const qc = useQueryClient()
  const createDm = useCreateDm()
  const { sendTo } = useSendMessage(null)
  const first = person.name.split(' ')[0] || person.name
  const line = person.isAdmin ? 'The Club team' : [person.jobTitle, person.company].filter(Boolean).join(' · ') || 'Member'

  async function start({ body, files }: { body: string; files: File[] }): Promise<boolean> {
    try {
      const d = await createDm.mutateAsync(person.id)
      if (!d.lastMessage && !qc.getQueryData(chatKeys.messages(d.id))) {
        qc.setQueryData<InfiniteData<LocalMessagePage, string | null>>(chatKeys.messages(d.id), {
          pages: [{ messages: [], nextCursor: null }],
          pageParams: [null],
        })
      }
      // Kick off the send first (its optimistic insert is synchronous), then navigate.
      void sendTo(d.id, { body, files })
      onStarted(d.id)
      return true
    } catch (e) {
      toast({ title: `Couldn’t message ${first}`, description: getApiErrorMessage(e), variant: 'destructive' })
      return false
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 shrink-0 items-center gap-3 border-b border-border bg-[var(--chat-header-bg,var(--color-surface))] px-3 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text md:hidden"
        >
          <ArrowLeft size={18} />
        </button>
        <ConversationAvatar kind="dm" title={person.name} avatarUrl={person.avatarUrl} />
        <div className="min-w-0 flex-1">
          <span className="block truncate font-[family-name:var(--font-heading)] text-base font-semibold text-text">{person.name}</span>
          <span className="block truncate text-xs text-text-dim">{line}</span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[var(--chat-thread-bg,var(--color-surface-2))] px-6 text-center">
        <ConversationAvatar kind="dm" title={person.name} avatarUrl={person.avatarUrl} />
        <span className="mt-3 text-sm font-medium text-text">Say hello to {first}</span>
        <span className="mt-1 max-w-xs text-xs leading-relaxed text-text-muted">
          Messages are private to the two of you.
        </span>
      </div>
      <Composer
        placeholder={`Message ${first}…`}
        maxFiles={MAX_ATTACHMENTS}
        validateFile={validateAttachment}
        onError={(msg) => toast({ title: 'Can’t attach that', description: msg, variant: 'destructive' })}
        onSend={start}
        autoFocus
      />
    </div>
  )
}
