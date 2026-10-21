'use client'

// Renders a thread's messages (oldest → newest) with the chat kit: date
// separators, system notes as Markers, runs of consecutive messages from one
// sender grouped (avatar + name once, squared inner corners, time on the last
// bubble), photo grids with upload progress, optimistic "Sending…" / failed
// "Retry" states, and "Seen" under my latest DM message once the other person
// has read past it.

import { useMemo, useState } from 'react'
import { AlertCircle, Flag, MoreHorizontal, Trash2 } from 'lucide-react'
import { ChatAvatar } from '@/components/ui/chat'
import {
  AttachmentGrid,
  AttachmentLightbox,
  Bubble,
  BubbleContent,
  DateMarker,
  Linkified,
  Marker,
  MarkerContent,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
  clockTime,
  sameDay,
  type AttachmentItem,
  type BubblePosition,
} from '@/components/ui/chat'
import type { ChatPerson, ConversationDetail } from '@/lib/chat/contract'
import { useReceipt } from '@/lib/chat/stores'
import { messageKey } from '@/lib/chat/merge'
import type { LocalChatMessage } from '@/lib/chat/types'
import { cn } from '@/lib/utils'
import { PopoverMenu, type MenuItem } from './PopoverMenu'

const GROUP_GAP_MS = 5 * 60_000

type Block =
  | { type: 'date'; key: string; date: string }
  | { type: 'system'; key: string; message: LocalChatMessage }
  | { type: 'group'; key: string; senderId: string | null; messages: LocalChatMessage[] }

function buildBlocks(messages: LocalChatMessage[]): Block[] {
  const blocks: Block[] = []
  let prev: LocalChatMessage | null = null
  for (const m of messages) {
    if (!prev || !sameDay(prev.createdAt, m.createdAt)) {
      blocks.push({ type: 'date', key: `d-${messageKey(m)}`, date: m.createdAt })
    }
    if (m.kind === 'system') {
      blocks.push({ type: 'system', key: `s-${messageKey(m)}`, message: m })
    } else {
      const last = blocks[blocks.length - 1]
      const joinable =
        last?.type === 'group' &&
        last.senderId === m.senderId &&
        new Date(m.createdAt).getTime() -
          new Date(last.messages[last.messages.length - 1].createdAt).getTime() <
          GROUP_GAP_MS
      if (joinable) last.messages.push(m)
      else blocks.push({ type: 'group', key: `g-${messageKey(m)}`, senderId: m.senderId, messages: [m] })
    }
    prev = m
  }
  return blocks
}

function positionOf(i: number, n: number): BubblePosition {
  if (n === 1) return 'single'
  if (i === 0) return 'first'
  if (i === n - 1) return 'last'
  return 'middle'
}

export function ThreadMessages({
  conversation,
  messages,
  meId,
  canModerate,
  canWrite,
  onRetry,
  onDiscard,
  onDelete,
  onReport,
}: {
  conversation: ConversationDetail
  messages: LocalChatMessage[]
  meId: string | null
  /** owner: may delete anyone's message */
  canModerate?: boolean
  canWrite: boolean
  onRetry: (m: LocalChatMessage) => void
  onDiscard: (m: LocalChatMessage) => void
  onDelete: (m: LocalChatMessage) => void
  onReport: (m: LocalChatMessage) => void
}) {
  const blocks = useMemo(() => buildBlocks(messages), [messages])
  const people = useMemo(() => {
    const map: Record<string, ChatPerson> = {}
    for (const p of conversation.participants) map[p.id] = p
    if (conversation.otherPerson) map[conversation.otherPerson.id] = conversation.otherPerson
    return map
  }, [conversation.participants, conversation.otherPerson])
  const isDm = conversation.kind === 'dm'

  // "Seen" — only meaningful in DMs, on my newest delivered message.
  const otherId = isDm ? conversation.otherPerson?.id ?? null : null
  // Initial value from the detail, then live `read` events (whichever is later).
  const liveReadAt = useReceipt(conversation.id, otherId)
  const initialReadAt = conversation.otherLastReadAt
  const otherReadAt =
    liveReadAt && initialReadAt ? (liveReadAt > initialReadAt ? liveReadAt : initialReadAt) : liveReadAt ?? initialReadAt
  const myLatest = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.senderId === meId && m.kind !== 'system' && !m._status) return m
    }
    return null
  }, [messages, meId])
  const lastMessage = messages[messages.length - 1]
  const seenId =
    isDm && myLatest && otherReadAt && otherReadAt >= myLatest.createdAt && lastMessage?.id === myLatest.id
      ? myLatest.id
      : null

  const [lightbox, setLightbox] = useState<{ images: AttachmentItem[]; index: number } | null>(null)

  return (
    <>
      {blocks.map((b) => {
        if (b.type === 'date') return <DateMarker key={b.key} date={b.date} />
        if (b.type === 'system') {
          return (
            <Marker key={b.key}>
              <MarkerContent>{b.message.body}</MarkerContent>
            </Marker>
          )
        }
        const mine = b.senderId === meId
        const sender = b.senderId ? people[b.senderId] : null
        const senderName = sender?.name ?? 'Former member'
        const showIdentity = !mine && !isDm
        return (
          <MessageGroup key={b.key} className="py-1">
            {b.messages.map((m, i) => {
              const n = b.messages.length
              const last = i === n - 1
              const deleted = !!m.deletedAt
              const failed = m._status === 'failed'
              const sending = m._status === 'sending'
              const images = m.attachments.filter((a) => a.mime.startsWith('image/'))
              const actions: MenuItem[] = []
              if (!deleted && !m._status) {
                if ((mine || canModerate) && canWrite) {
                  actions.push({ key: 'delete', label: 'Delete message', icon: Trash2, danger: true, onSelect: () => onDelete(m) })
                }
                if (!mine && canWrite) {
                  actions.push({ key: 'report', label: 'Report message', icon: Flag, onSelect: () => onReport(m) })
                }
              }
              return (
                <Message key={messageKey(m)} align={mine ? 'end' : 'start'} className="group/row">
                  {showIdentity && (
                    <MessageAvatar spacer={!last} offsetFooter={last}>
                      <ChatAvatar name={senderName} src={sender?.avatarUrl} size="sm" />
                    </MessageAvatar>
                  )}
                  <MessageContent>
                    {showIdentity && i === 0 && (
                      <MessageHeader>
                        {senderName}
                        {sender?.isAdmin && <span className="ml-1.5 text-gold">· The Club</span>}
                      </MessageHeader>
                    )}
                    <div className={cn('flex max-w-full min-w-0 items-center gap-1', mine ? 'flex-row-reverse' : 'flex-row')}>
                      {deleted ? (
                        <Bubble variant="muted" position={positionOf(i, n)}>
                          <BubbleContent className="italic text-text-dim">This message was deleted</BubbleContent>
                        </Bubble>
                      ) : (
                        <Bubble
                          variant={failed ? 'destructive' : undefined}
                          position={positionOf(i, n)}
                          className={cn(
                            sending && 'opacity-80',
                            // Photo messages size to the image (≤ 260px); the caption wraps at that width.
                            images.length > 0 && 'w-[260px] min-w-0 max-w-full',
                          )}
                        >
                          {m.attachments.length > 0 && (
                            <AttachmentGrid
                              items={m.attachments}
                              progress={m._progress}
                              failed={failed}
                              onOpen={
                                m._status
                                  ? undefined
                                  : (index) => setLightbox({ images, index })
                              }
                            />
                          )}
                          {m.body && (
                            <BubbleContent className={cn(m.attachments.length > 0 && 'pt-1')}>
                              <Linkified text={m.body} />
                            </BubbleContent>
                          )}
                        </Bubble>
                      )}
                      {actions.length > 0 && (
                        <PopoverMenu
                          label="Message actions"
                          items={actions}
                          align={mine ? 'end' : 'start'}
                          trigger={<MoreHorizontal size={15} />}
                          className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100"
                          triggerClassName="h-7 w-7"
                        />
                      )}
                    </div>
                    {failed ? (
                      <MessageFooter className="text-accent-warm">
                        <AlertCircle size={12} />
                        <span>{m._error || 'Not sent'}</span>
                        <button type="button" onClick={() => onRetry(m)} className="font-medium underline underline-offset-2">
                          Retry
                        </button>
                        <button type="button" onClick={() => onDiscard(m)} className="text-text-dim underline underline-offset-2">
                          Discard
                        </button>
                      </MessageFooter>
                    ) : sending && last ? (
                      <MessageFooter>Sending…</MessageFooter>
                    ) : last ? (
                      <MessageFooter>
                        <span>{clockTime(m.createdAt)}</span>
                        {m.editedAt && !deleted && <span>· edited</span>}
                        {seenId === m.id && <span className="text-gold-dark">· Seen</span>}
                      </MessageFooter>
                    ) : null}
                  </MessageContent>
                </Message>
              )
            })}
          </MessageGroup>
        )
      })}
      <AttachmentLightbox
        images={lightbox?.images ?? []}
        index={lightbox?.index ?? null}
        onClose={() => setLightbox(null)}
      />
    </>
  )
}

