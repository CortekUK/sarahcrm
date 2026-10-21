'use client'

// Shared Member Feed surface — the Club feed (groupId null) on
// /portal/feed + /dashboard/feed, and a group's Posts tab inside Messages.
// A centred column (max ~680px): sticky "Share an update…" composer, pinned
// posts, then the newest-first infinite list (15/page, loaded from a bottom
// sentinel). `?post=<id>` opens that post in a detail modal with its
// comments (notification deep links). Colours follow the active theme via
// `.chat-theme`; everything that depends on auth/time renders after mount
// (ChatProvider's `enabled`), so there's no hydration mismatch. Degrades to
// the same calm notices as Messages when the chat server is unreachable.

import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Newspaper, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/providers/AuthProvider'
import { useChat } from '@/lib/chat/ChatProvider'
import { chatKeys } from '@/lib/chat/keys'
import { useCreatePost, useFeed, usePost } from '@/lib/feed/hooks'
import { useFeedRoom } from '@/lib/feed/FeedRealtime'
import { postKey } from '@/lib/feed/cache'
import { chatEnabled, getApiErrorMessage, isChatAuthError } from '@/lib/http/chat-client'
import { cn } from '@/lib/utils'
import { PostCard } from './PostCard'
import { PostComposer } from './PostComposer'

export interface FeedViewProps {
  /** null = main Club feed */
  groupId: string | null
  /** group feeds: viewer is a participant (main feed: ignored) */
  isParticipant?: boolean
  /** group feeds: archived → read only */
  archived?: boolean
  /** scroll inside this view (group Posts tab) instead of the window */
  embedded?: boolean
  /** sticky offset for the composer when the window scrolls (portal 72px header…) */
  stickyClassName?: string
  /** rendered above the composer inside the column */
  header?: ReactNode
  className?: string
}

function Notice({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-muted text-gold ring-1 ring-gold/15">{icon}</span>
      <span className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">{title}</span>
      <span className="mt-1.5 max-w-sm text-sm leading-relaxed text-text-muted">{body}</span>
      {action}
    </div>
  )
}

function PostSkeleton() {
  return (
    <div className="animate-pulse rounded-[var(--radius-xl)] border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-surface-2" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/3 rounded bg-surface-2" />
          <div className="h-2.5 w-1/4 rounded bg-surface-2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-surface-2" />
        <div className="h-3 w-5/6 rounded bg-surface-2" />
        <div className="h-3 w-2/3 rounded bg-surface-2" />
      </div>
    </div>
  )
}

export function FeedView({
  groupId,
  isParticipant = true,
  archived = false,
  embedded,
  stickyClassName = 'top-0',
  header,
  className,
}: FeedViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const qc = useQueryClient()
  const { loading: authLoading } = useAuth()
  const { enabled, ready, meError, viewer, me, connection } = useChat()
  const feed = useFeed(groupId)
  const { create, retry, discard } = useCreatePost(groupId)
  useFeedRoom(groupId, ready)

  const moderator = !!viewer && (viewer.isAdmin || viewer.isOwner)
  // Members reaching /me are active (lapsed ones get 403); overseers who
  // aren't admins read only.
  const activeUser = !!viewer && (viewer.isAdmin || viewer.isOwner || !viewer.canOversee)
  const isGroup = groupId !== null
  const canPost = activeUser && (!isGroup || (!archived && (isParticipant || !!viewer?.isOwner)))
  const canInteract = activeUser && (!isGroup || (!archived && (isParticipant || moderator)))
  const lockedReason = !viewer
    ? null
    : canPost
      ? null
      : !activeUser
        ? 'Viewing as overseer — read only.'
        : archived
          ? 'This group is archived — its posts stay here to read.'
          : 'Only members of this group can post here.'
  const meCard = { name: me?.name ?? 'You', avatar: me?.avatarUrl ?? null }

  // ── Detail modal (?post=) ──────────────────────────────────────────
  const openPostId = params.get('post')
  const detail = usePost(openPostId)
  const closePost = useCallback(() => {
    const q = new URLSearchParams(params.toString())
    q.delete('post')
    const qs = q.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [params, pathname, router])

  // ── Infinite scroll ───────────────────────────────────────────────
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, feed.posts.length])

  const wrap = (children: ReactNode) => (
    <div className={cn('chat-theme min-w-0', embedded ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain' : 'min-h-full', className)}>
      {/* One column (≤ 640px) shared by the header, composer and posts. */}
      <div className="mx-auto w-full max-w-[640px] px-3 pb-16 pt-4 sm:px-4 sm:pt-6" style={{ maxWidth: 640 }}>
        {children}
      </div>
    </div>
  )

  if (!chatEnabled) {
    return wrap(<Notice icon={<Newspaper size={22} strokeWidth={1.5} />} title="The feed isn’t switched on yet" body="Member updates are coming soon." />)
  }
  if (authLoading || !enabled || (!ready && !meError)) {
    // Before mount `enabled` is false on server and client alike → same markup.
    return wrap(
      <div className="flex justify-center py-20 text-text-dim">
        <Loader2 size={20} className="animate-spin" />
      </div>,
    )
  }
  if (meError) {
    const auth = isChatAuthError(meError)
    return wrap(
      <Notice
        icon={<WifiOff size={22} strokeWidth={1.5} />}
        title={auth ? 'The feed isn’t available' : 'The feed is offline'}
        body={
          auth
            ? 'The feed is for active members and the Club team.'
            : getApiErrorMessage(meError, 'We couldn’t reach the Club’s live service. Please try again shortly.')
        }
        action={
          !auth ? (
            <Button variant="secondary" size="sm" className="mt-5" onClick={() => qc.refetchQueries({ queryKey: chatKeys.me() })}>
              Try again
            </Button>
          ) : undefined
        }
      />,
    )
  }

  const { pinned, posts } = feed
  const empty = feed.isSuccess && pinned.length === 0 && posts.length === 0

  return wrap(
    <>
      {header}
      <div className={cn('sticky z-20 -mx-3 px-3 pb-3 pt-1 sm:-mx-4 sm:px-4', stickyClassName)}>
        {/* soft fade so cards scrolling under the composer don't clash */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[var(--chat-thread-bg)]/90 backdrop-blur-sm [mask-image:linear-gradient(to_bottom,black_70%,transparent)]" />
        <PostComposer
          className="relative"
          me={meCard}
          onPost={(input) => void create(input)}
          disabledReason={lockedReason}
          placeholder={isGroup ? 'Share an update with the group…' : 'Share an update…'}
          groupId={groupId}
        />
      </div>

      {(connection === 'reconnecting' || connection === 'error') && (
        <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-md)] bg-accent-warm/[0.08] px-3 py-2 text-xs text-text-muted">
          <WifiOff size={13} className="shrink-0 text-accent-warm" />
          Reconnecting — new posts will appear when you’re back online.
        </div>
      )}

      {feed.isLoading ? (
        <div className="space-y-3">
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </div>
      ) : feed.isError ? (
        <Notice
          icon={<WifiOff size={22} strokeWidth={1.5} />}
          title={isChatAuthError(feed.error) ? 'You can’t see this feed' : 'The feed couldn’t load'}
          body={
            isChatAuthError(feed.error)
              ? 'Group posts are visible to the group’s members.'
              : getApiErrorMessage(feed.error, 'Please try again in a moment.')
          }
          action={
            !isChatAuthError(feed.error) ? (
              <Button variant="secondary" size="sm" className="mt-5" icon={<RefreshCw size={13} />} onClick={() => feed.refetch()}>
                Try again
              </Button>
            ) : undefined
          }
        />
      ) : empty ? (
        <Notice
          icon={<Newspaper size={22} strokeWidth={1.5} />}
          title={isGroup ? 'No posts in this group yet' : 'No posts yet'}
          body={canPost ? 'Be the first to share an update, a win or a photo from an event.' : 'Updates from members will appear here.'}
        />
      ) : (
        <div className="space-y-3">
          {[...pinned, ...posts].map((p) => (
            <PostCard
              key={postKey(p)}
              post={p}
              meId={viewer?.id ?? null}
              me={meCard}
              moderator={moderator}
              canInteract={canInteract}
              onRetry={(x) => void retry(x)}
              onDiscard={discard}
            />
          ))}
          <div ref={sentinel} aria-hidden className="h-px" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-6 text-text-dim">
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}
          {!hasNextPage && posts.length + pinned.length > 3 && (
            <p className="py-6 text-center text-xs text-text-dim">You’re all caught up.</p>
          )}
        </div>
      )}

      <Modal open={!!openPostId} onClose={closePost} title="Post" size="lg">
        {detail.isLoading ? (
          <div className="flex justify-center py-12 text-text-dim">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : detail.data ? (
          <PostCard
            bare
            defaultCommentsOpen
            post={detail.data}
            meId={viewer?.id ?? null}
            me={meCard}
            moderator={moderator}
            canInteract={canInteract && (detail.data.groupId ?? null) === groupId}
          />
        ) : (
          <p className="py-10 text-center text-sm text-text-muted">
            {detail.isError && !isChatAuthError(detail.error) && !(getApiErrorMessage(detail.error, '').includes('not found'))
              ? getApiErrorMessage(detail.error, 'This post couldn’t be loaded.')
              : 'This post is no longer available.'}
          </p>
        )}
      </Modal>
    </>,
  )
}
