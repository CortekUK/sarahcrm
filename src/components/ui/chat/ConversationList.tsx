'use client'

// Conversation list rows: avatar (person, or a kind tile for groups / event
// chats / the main club group), title, last-message preview, relative time
// and the red unread badge. Purely presentational — the view feeds it data.

import { type ReactNode } from 'react'
import { BellOff, CalendarDays, Crown, Users } from 'lucide-react'
import { ChatAvatar } from './ChatAvatar'
import { cn } from '@/lib/utils'
import { relativeTime } from './format'
import { UnreadBadge } from './UnreadBadge'

export type ConversationListKind = 'dm' | 'group' | 'event'

export function ConversationList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul role="list" className={cn('divide-y divide-border/60', className)}>
      {children}
    </ul>
  )
}

export function ConversationAvatar({
  kind,
  title,
  avatarUrl,
  isMain,
  size = 'md',
}: {
  kind: ConversationListKind
  title: string
  avatarUrl?: string | null
  isMain?: boolean
  size?: 'sm' | 'md'
}) {
  if (kind === 'dm' || avatarUrl) return <ChatAvatar name={title} src={avatarUrl} size={size} />
  const Icon = isMain ? Crown : kind === 'event' ? CalendarDays : Users
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gold-muted text-gold ring-1 ring-gold/20',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
      )}
      aria-hidden
    >
      <Icon size={size === 'sm' ? 14 : 17} strokeWidth={1.6} />
    </span>
  )
}

export function ConversationListItem({
  kind,
  title,
  avatarUrl,
  isMain,
  preview,
  time,
  unread = 0,
  active,
  onSelect,
  meta,
  typing,
  muted,
}: {
  kind: ConversationListKind
  title: string
  avatarUrl?: string | null
  isMain?: boolean
  preview?: ReactNode
  time?: string | null
  unread?: number
  active?: boolean
  onSelect?: () => void
  /** small trailing tag, e.g. "Closed" / "Archived" */
  meta?: ReactNode
  typing?: boolean
  /** muted by the viewer: bell-off icon, grey unread count */
  muted?: boolean
}) {
  const hasUnread = unread > 0
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors',
          active ? 'border-gold bg-gold-muted' : 'border-transparent hover:bg-surface-2',
        )}
      >
        <ConversationAvatar kind={kind} title={title} avatarUrl={avatarUrl} isMain={isMain} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={cn('truncate text-sm text-text', hasUnread ? 'font-semibold' : 'font-medium')}>
              {title}
            </span>
            <span className={cn('shrink-0 text-[11px] tabular-nums', hasUnread ? 'text-gold-dark font-medium' : 'text-text-dim')}>
              {relativeTime(time)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate text-xs',
                typing ? 'italic text-gold' : hasUnread ? 'text-text-muted' : 'text-text-dim',
              )}
            >
              {typing ? 'typing…' : preview || ' '}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {meta}
              {muted && <BellOff size={12} className="text-text-dim" aria-label="Muted" />}
              <UnreadBadge count={unread} muted={muted} />
            </span>
          </span>
        </span>
      </button>
    </li>
  )
}

export function ConversationListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden className="animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <span className="h-10 w-10 shrink-0 rounded-full bg-surface-3" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-2/5 rounded bg-surface-3" />
            <span className="block h-2.5 w-4/5 rounded bg-surface-2" />
          </span>
        </li>
      ))}
    </ul>
  )
}
