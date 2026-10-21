'use client'

// In-app notifications bell (portal header + admin sidebar / top bar): a Bell
// with the red unread badge (UnreadBadge, 1…9+) that opens a panel listing
// notifications newest first — 20 per page, more on scroll — with "Mark all
// read". Clicking one marks it read and deep-links to the post (main feed:
// `<feed>?post=<id>`, group feeds via `links.groupPost`). Renders nothing
// until chat is enabled (after mount), like ChatNavIcon, so SSR markup and
// the first client render always match. Below 640px the panel is a
// full-width sheet under the header.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AtSign, Bell, CheckCheck, Loader2, MessageSquare, Newspaper, Reply } from 'lucide-react'
import { ChatAvatar, UnreadBadge } from '@/components/ui/chat'
import { useChat } from '@/lib/chat/ChatProvider'
import type { MemberNotification } from '@/lib/chat/contract'
import { useFeedRealtime } from '@/lib/feed/FeedRealtime'
import { useMarkNotificationsRead, useNotifications } from '@/lib/feed/hooks'
import type { FeedLinks } from '@/lib/feed/types'
import { getApiErrorMessage, isChatAuthError } from '@/lib/http/chat-client'
import { cn } from '@/lib/utils'
import { feedTime } from './format'

function describe(n: MemberNotification): string {
  switch (n.kind) {
    case 'comment':
      return 'commented on your post'
    case 'reply':
      return 'replied to your comment'
    case 'group_post':
      return n.groupTitle ? `posted in ${n.groupTitle}` : 'posted in your group'
    case 'mention':
      return n.commentId ? 'mentioned you in a comment' : 'mentioned you in a post'
  }
}

const KindIcon = ({ kind }: { kind: MemberNotification['kind'] }) => {
  const Icon = kind === 'reply' ? Reply : kind === 'comment' ? MessageSquare : kind === 'mention' ? AtSign : Newspaper
  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-white ring-2 ring-surface">
      <Icon size={10} strokeWidth={2.2} />
    </span>
  )
}

export function NotificationsBell({
  links,
  className,
  iconClassName,
  size = 18,
  align = 'end',
}: {
  links: FeedLinks
  className?: string
  iconClassName?: string
  size?: number
  /** which edge of the trigger the desktop panel lines up with */
  align?: 'start' | 'end'
}) {
  const router = useRouter()
  const { enabled, ready } = useChat()
  const { unreadNotifications } = useFeedRealtime()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLLIElement>(null)
  const q = useNotifications(open)
  const markRead = useMarkNotificationsRead()

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q
  useEffect(() => {
    const el = sentinel.current
    if (!open || !el || !hasNextPage || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && !isFetchingNextPage && void fetchNextPage(),
      { root: listRef.current, rootMargin: '200px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage, q.notifications.length])

  if (!enabled || !ready) return null

  function go(n: MemberNotification) {
    if (!n.readAt) markRead.mutate([n.id])
    setOpen(false)
    if (!n.postId) return
    router.push(n.groupId ? links.groupPost(n.groupId, n.postId) : `${links.feed}?post=${n.postId}`)
  }

  const label = unreadNotifications > 0 ? `Notifications, ${unreadNotifications} unread` : 'Notifications'

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn('relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors', iconClassName)}
      >
        <Bell size={size} strokeWidth={1.6} />
        <UnreadBadge count={unreadNotifications} className="absolute right-0.5 top-0.5 h-4 min-w-4 px-1 text-[9px]" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            'chat-theme z-[60] flex flex-col overflow-hidden border border-border bg-surface shadow-[var(--shadow-lg)]',
            // phones: full-width sheet under the header; sm+: anchored panel
            'fixed inset-x-2 top-[64px] max-h-[min(75dvh,560px)] rounded-[var(--radius-lg)]',
            'sm:absolute sm:inset-x-auto sm:top-[calc(100%+8px)] sm:w-[380px]',
            align === 'end' ? 'sm:right-0' : 'sm:left-0',
          )}
          // .chat-theme (unlayered) paints the thread colour; keep the panel on the surface tone.
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <span className="font-[family-name:var(--font-heading)] text-base font-semibold text-text">Notifications</span>
            <button
              type="button"
              disabled={unreadNotifications === 0 || markRead.isPending}
              onClick={() => markRead.mutate(null)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-gold transition-colors hover:bg-gold-muted disabled:cursor-default disabled:text-text-dim disabled:hover:bg-transparent"
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {q.isLoading ? (
              <div className="flex justify-center py-10 text-text-dim">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : q.isError ? (
              <p className="px-4 py-10 text-center text-sm text-text-muted">
                {isChatAuthError(q.error) ? 'Notifications aren’t available.' : getApiErrorMessage(q.error, 'Notifications are offline right now.')}
              </p>
            ) : q.notifications.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gold-muted text-gold">
                  <Bell size={18} strokeWidth={1.5} />
                </span>
                <span className="text-sm font-medium text-text">You’re all caught up</span>
                <span className="mt-1 text-xs leading-relaxed text-text-muted">
                  Comments on your posts, replies to you and new posts in your groups show up here.
                </span>
              </div>
            ) : (
              <ul className="py-1">
                {q.notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => go(n)}
                      className={cn(
                        'flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2',
                        !n.readAt && 'bg-gold-muted/40',
                      )}
                    >
                      <span className="relative shrink-0">
                        <ChatAvatar name={n.actor?.name ?? 'Member'} src={n.actor?.avatarUrl} size="md" />
                        <KindIcon kind={n.kind} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug text-text">
                          <span className="font-semibold">{n.actor?.name ?? 'Someone'}</span> {describe(n)}
                        </span>
                        {n.available ? (
                          n.excerpt && <span className="mt-0.5 line-clamp-2 block text-xs text-text-muted [overflow-wrap:anywhere]">“{n.excerpt}”</span>
                        ) : (
                          <span className="mt-0.5 block text-xs italic text-text-dim">This post is no longer available.</span>
                        )}
                        <span className={cn('mt-1 block text-[11px]', n.readAt ? 'text-text-dim' : 'font-medium text-gold')}>{feedTime(n.createdAt)}</span>
                      </span>
                      {!n.readAt && <span aria-label="Unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#C8443A]" />}
                    </button>
                  </li>
                ))}
                <li ref={sentinel} aria-hidden className="h-px" />
                {isFetchingNextPage && (
                  <li className="flex justify-center py-3 text-text-dim">
                    <Loader2 size={14} className="animate-spin" />
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
