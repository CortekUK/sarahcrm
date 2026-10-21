'use client'

// One post in the feed: author (avatar with initials fallback, name,
// role · company, relative time, "Edited"), Pinned / Hidden labels, the
// clamped linkified body, a 1–4 photo grid, like (optimistic) + comment
// counts, and the inline comments section. The ⋮ menu offers edit/delete to
// the author, report to everyone else, and pin/hide/remove to moderators.
// Optimistic posts show upload progress, then Retry / Discard on failure.

import { useState } from 'react'
import {
  AlertCircle,
  Eye,
  EyeOff,
  Flag,
  Heart,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react'
import { ChatAvatar } from '@/components/ui/chat'
import { Button } from '@/components/ui/Button'
import { useDeletePost, useLikePost, useModeratePost } from '@/lib/feed/hooks'
import type { LocalFeedPost } from '@/lib/feed/types'
import { getApiErrorMessage } from '@/lib/http/chat-client'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import { ConfirmModal } from '@/views/chat/ConfirmModal'
import { PopoverMenu, type MenuItem } from '@/views/chat/PopoverMenu'
import { CommentsSection } from './Comments'
import { EditPostModal, FeedReportModal } from './FeedModals'
import { feedTime, fullTime, personLine, personName, plural } from './format'
import { PostBody } from './PostBody'
import { PostImages } from './PostImages'

export interface PostCardProps {
  post: LocalFeedPost
  meId: string | null
  me: { name: string; avatar?: string | null }
  moderator: boolean
  /** may like + comment here */
  canInteract: boolean
  onRetry?: (p: LocalFeedPost) => void
  onDiscard?: (p: LocalFeedPost) => void
  /** open the comments straight away (detail modal) */
  defaultCommentsOpen?: boolean
  /** render without the card chrome (inside a modal) */
  bare?: boolean
  highlight?: boolean
}

export function PostCard({
  post,
  meId,
  me,
  moderator,
  canInteract,
  onRetry,
  onDiscard,
  defaultCommentsOpen,
  bare,
  highlight,
}: PostCardProps) {
  const like = useLikePost()
  const moderate = useModeratePost()
  const del = useDeletePost()
  const [commentsOpen, setCommentsOpen] = useState(!!defaultCommentsOpen)
  const [focusComposer, setFocusComposer] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'remove' | null>(null)
  const [reporting, setReporting] = useState(false)

  const local = post.id.startsWith('local:')
  const mine = !!post.authorId && post.authorId === meId
  const hidden = !!post.hiddenAt
  const pinned = !!post.pinnedAt
  const sending = post._status === 'sending'
  const failed = post._status === 'failed'

  function runModerate(patch: { pinned?: boolean; hidden?: boolean }, done: string) {
    moderate.mutate(
      { id: post.id, ...patch },
      {
        onSuccess: () => toast({ title: done }),
        onError: (e) => toast({ title: 'Couldn’t update the post', description: getApiErrorMessage(e), variant: 'destructive' }),
      },
    )
  }

  const menu: MenuItem[] = []
  if (!local) {
    if (mine) {
      menu.push({ key: 'edit', label: 'Edit post', icon: Pencil, onSelect: () => setEditing(true) })
      menu.push({ key: 'delete', label: 'Delete post', icon: Trash2, danger: true, onSelect: () => setConfirm('delete') })
    }
    if (moderator) {
      menu.push({
        key: 'pin',
        label: pinned ? 'Unpin' : 'Pin to top',
        icon: pinned ? PinOff : Pin,
        onSelect: () => runModerate({ pinned: !pinned }, pinned ? 'Post unpinned' : 'Post pinned to the top'),
      })
      menu.push({
        key: 'hide',
        label: hidden ? 'Unhide post' : 'Hide post',
        icon: hidden ? Eye : EyeOff,
        onSelect: () => runModerate({ hidden: !hidden }, hidden ? 'Post visible to members again' : 'Post hidden from members'),
      })
      if (!mine) menu.push({ key: 'remove', label: 'Remove post', icon: Trash2, danger: true, onSelect: () => setConfirm('remove') })
    }
    if (!mine) menu.push({ key: 'report', label: 'Report post', icon: Flag, onSelect: () => setReporting(true) })
  }

  const showComments = commentsOpen && !local
  const toggleLike = (liked: boolean) =>
    like.mutate(
      { id: post.id, liked },
      { onError: (e) => toast({ title: 'Couldn’t like that', description: getApiErrorMessage(e), variant: 'destructive' }) },
    )
  const line = personLine(post.author)

  return (
    <article
      id={`post-${post.id}`}
      className={cn(
        'min-w-0',
        !bare && 'rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-sm)]',
        !bare && 'px-4 pb-1 pt-4 sm:px-5',
        hidden && 'border-dashed',
        highlight && 'ring-2 ring-gold/50',
      )}
    >
      {/* Author row */}
      <header className="flex min-w-0 items-start gap-3">
        <ChatAvatar name={personName(post.author)} src={post.author?.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[15px] font-semibold text-text">{personName(post.author)}</span>
            {pinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-muted px-2 py-0.5 font-[family-name:var(--font-label)] text-[9.5px] font-medium uppercase tracking-[0.14em] text-gold ring-1 ring-gold/20">
                <Pin size={10} /> Pinned
              </span>
            )}
            {hidden && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 font-[family-name:var(--font-label)] text-[9.5px] font-medium uppercase tracking-[0.14em] text-text-muted">
                <EyeOff size={10} /> Hidden
              </span>
            )}
          </div>
          <p className="truncate text-xs text-text-dim">
            {line}
            {line && ' · '}
            {sending ? (
              'Sharing…'
            ) : (
              <time dateTime={post.createdAt} title={fullTime(post.createdAt)}>
                {feedTime(post.createdAt)}
              </time>
            )}
            {post.editedAt && ' · Edited'}
          </p>
        </div>
        {menu.length > 0 && (
          <PopoverMenu label="Post options" items={menu} trigger={<MoreHorizontal size={18} />} triggerClassName="h-10 w-10 -mr-2 -mt-1" className="shrink-0" />
        )}
      </header>

      {hidden && (
        <p className="mt-2 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-xs text-text-muted">
          {moderator ? 'Hidden from members — only the Club team and the author can see it.' : 'The Club team has hidden this post. Only you can see it.'}
        </p>
      )}

      {/* Body + photos */}
      <div className={cn('min-w-0', hidden && 'opacity-70')}>
        <PostBody text={post.body} mentions={post.mentions} className="mt-2.5" />
        {post.images.length > 0 && (
          <PostImages
            images={post.images}
            progress={post._progress}
            failed={failed}
            // Edge-to-edge inside the card (cancels the card's side padding).
            className={cn('mt-3', !bare && '-mx-4 sm:-mx-5')}
            onDoubleTap={!local && canInteract ? () => !post.likedByMe && toggleLike(true) : undefined}
          />
        )}
      </div>

      {failed && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-accent-warm/[0.08] px-3 py-2 text-sm text-accent-warm">
          <AlertCircle size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">{post._error ?? 'Your post wasn’t shared.'}</span>
          <Button size="sm" variant="secondary" onClick={() => onRetry?.(post)}>
            Retry
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDiscard?.(post)}>
            Discard
          </Button>
        </div>
      )}

      {/* Counts */}
      {!local && (post.likeCount > 0 || post.commentCount > 0) && (
        <div className="mt-2.5 flex items-center justify-between text-xs text-text-dim">
          <span className="inline-flex items-center gap-1">
            {post.likeCount > 0 && (
              <>
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#C8443A] text-white">
                  <Heart size={9} fill="currentColor" strokeWidth={0} />
                </span>
                {post.likeCount}
              </>
            )}
          </span>
          {post.commentCount > 0 && (
            <button type="button" onClick={() => setCommentsOpen((v) => !v)} className="inline-flex min-h-8 items-center hover:text-text hover:underline">
              {plural(post.commentCount, 'comment')}
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      {!local && (
        <div className="mt-1.5 grid grid-cols-2 gap-1 border-t border-border pt-0.5">
          <button
            type="button"
            disabled={!canInteract}
            aria-pressed={post.likedByMe}
            onClick={() => toggleLike(!post.likedByMe)}
            className={cn(
              'flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] text-sm font-medium transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
              post.likedByMe ? 'text-[#C8443A]' : 'text-text-muted hover:bg-surface-2 hover:text-text',
            )}
          >
            <Heart size={17} strokeWidth={1.8} fill={post.likedByMe ? 'currentColor' : 'none'} />
            Like
          </button>
          <button
            type="button"
            onClick={() => {
              setCommentsOpen(true)
              setFocusComposer(true)
            }}
            className="flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <MessageSquare size={17} strokeWidth={1.8} />
            Comment
          </button>
        </div>
      )}
      {sending && (
        <div className="flex items-center gap-2 py-2 text-xs text-text-dim">
          <Loader2 size={12} className="animate-spin" /> Sharing your post…
        </div>
      )}

      {showComments && (
        <div className="pb-3">
          <CommentsSection
            post={post}
            meId={meId}
            me={me}
            moderator={moderator}
            canComment={canInteract}
            autoFocus={focusComposer}
          />
        </div>
      )}

      <EditPostModal post={editing ? post : null} onClose={() => setEditing(false)} />
      <FeedReportModal target={reporting ? { postId: post.id } : null} onClose={() => setReporting(false)} />
      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        loading={del.isPending}
        danger
        title={confirm === 'remove' ? 'Remove this post?' : 'Delete your post?'}
        description={
          confirm === 'remove'
            ? `It will be removed for everyone, with its comments. ${personName(post.author).split(' ')[0]} isn’t notified.`
            : 'It will be removed for everyone, with its comments and likes.'
        }
        confirmLabel={confirm === 'remove' ? 'Remove' : 'Delete'}
        onConfirm={() =>
          del.mutate(post.id, {
            onSuccess: () => {
              setConfirm(null)
              toast({ title: confirm === 'remove' ? 'Post removed' : 'Post deleted' })
            },
            onError: (e) => toast({ title: 'Couldn’t delete', description: getApiErrorMessage(e), variant: 'destructive' }),
          })
        }
      />
    </article>
  )
}
