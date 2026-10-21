'use client'

// Inline comments under a post: the newest 20 load first (older pages behind
// "View older comments" at the top), each top-level comment can carry ONE
// level of replies collapsed behind "View N replies" (10 per page, oldest
// first), and a composer sits at the bottom. Optimistic comments show
// "Posting…" and stay with Retry / Discard if they fail. Moderators see
// hidden comments greyed with a "Hidden" label.

import { useEffect, useRef, useState } from 'react'
import { CornerDownRight, EyeOff, Eye, Flag, Loader2, MoreHorizontal, SendHorizontal, Trash2 } from 'lucide-react'
import { ChatAvatar } from '@/components/ui/chat'
import { RichText } from './RichText'
import { useMentionInput } from './MentionPicker'
import {
  MAX_COMMENT_BODY,
  useAddComment,
  useComments,
  useDeleteComment,
  useDiscardComment,
  useModerateComment,
  useReplies,
} from '@/lib/feed/hooks'
import { commentKey } from '@/lib/feed/cache'
import type { LocalFeedComment, LocalFeedPost } from '@/lib/feed/types'
import { getApiErrorMessage } from '@/lib/http/chat-client'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import { ConfirmModal } from '@/views/chat/ConfirmModal'
import { PopoverMenu, type MenuItem } from '@/views/chat/PopoverMenu'
import { feedTime, fullTime, personName, plural } from './format'
import { FeedReportModal } from './FeedModals'

interface Ctx {
  meId: string | null
  moderator: boolean
  canComment: boolean
}

// ── Composer ─────────────────────────────────────────────────────────

export function CommentComposer({
  postId,
  onSubmit,
  placeholder = 'Write a comment…',
  autoFocus,
  meName,
  meAvatar,
  compact,
}: {
  /** the post being commented on — scopes @mention suggestions */
  postId: string
  onSubmit: (body: string) => void
  placeholder?: string
  autoFocus?: boolean
  meName: string
  meAvatar?: string | null
  compact?: boolean
}) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const mention = useMentionInput({ taRef: ref, text, setText, postId })

  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
  }, [text])

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: false })
  }, [autoFocus])

  function submit() {
    const body = text.trim()
    if (!body) return
    onSubmit(mention.toBody(body))
    setText('')
    mention.reset()
  }

  return (
    <div className="flex min-w-0 items-end gap-2">
      <ChatAvatar name={meName} src={meAvatar} size="sm" className={cn('mb-1', compact && 'h-7 w-7')} />
      <div className="relative flex min-w-0 flex-1 items-end rounded-[var(--radius-xl)] border border-border bg-surface transition-[border-color,box-shadow] focus-within:border-gold focus-within:shadow-[0_0_0_3px_var(--color-gold-muted)]">
        <textarea
          ref={ref}
          value={text}
          rows={1}
          maxLength={MAX_COMMENT_BODY}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setText(e.target.value)}
          onClick={mention.refresh}
          onKeyUp={(e) => (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') && mention.refresh()}
          onKeyDown={(e) => {
            if (mention.onKeyDown(e)) return
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          className="min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3.5 py-2.5 text-sm leading-5 text-text outline-none placeholder:text-text-dim"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          aria-label="Post comment"
          className={cn(
            'm-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
            text.trim() ? 'text-gold hover:bg-gold-muted' : 'cursor-not-allowed text-text-dim',
          )}
        >
          <SendHorizontal size={16} />
        </button>
        {mention.popover}
      </div>
    </div>
  )
}

// ── One comment ──────────────────────────────────────────────────────

function CommentItem({
  comment,
  ctx,
  onReply,
  onRetry,
  isReply,
}: {
  comment: LocalFeedComment
  ctx: Ctx
  onReply?: () => void
  onRetry: (c: LocalFeedComment) => void
  isReply?: boolean
}) {
  const del = useDeleteComment()
  const moderate = useModerateComment()
  const discard = useDiscardComment()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reporting, setReporting] = useState(false)
  const mine = !!comment.authorId && comment.authorId === ctx.meId
  const local = comment.id.startsWith('local:')
  const hidden = !!comment.hiddenAt

  const menu: MenuItem[] = []
  if (!local) {
    if (mine || ctx.moderator) menu.push({ key: 'delete', label: 'Delete comment', icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) })
    if (ctx.moderator) {
      menu.push({
        key: 'hide',
        label: hidden ? 'Unhide comment' : 'Hide comment',
        icon: hidden ? Eye : EyeOff,
        onSelect: () =>
          moderate.mutate(
            { id: comment.id, hidden: !hidden },
            {
              onSuccess: () => toast({ title: hidden ? 'Comment visible again' : 'Comment hidden' }),
              onError: (e) => toast({ title: 'Couldn’t update', description: getApiErrorMessage(e), variant: 'destructive' }),
            },
          ),
      })
    }
    if (!mine) menu.push({ key: 'report', label: 'Report comment', icon: Flag, onSelect: () => setReporting(true) })
  }

  return (
    <div className={cn('flex min-w-0 gap-2', hidden && 'opacity-60')}>
      <ChatAvatar name={personName(comment.author)} src={comment.author?.avatarUrl} size="sm" className={cn('mt-0.5', isReply && 'h-7 w-7')} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-1">
          <div className="min-w-0 max-w-full rounded-[var(--radius-lg)] bg-surface-2 px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
              <span className="truncate text-[13px] font-semibold text-text">{personName(comment.author)}</span>
              {comment.author?.isAdmin && (
                <span className="font-[family-name:var(--font-label)] text-[9.5px] font-medium uppercase tracking-[0.14em] text-gold">Club team</span>
              )}
              {hidden && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                  <EyeOff size={10} /> Hidden
                </span>
              )}
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-text [overflow-wrap:anywhere]">
              <RichText text={comment.body} mentions={comment.mentions} />
            </p>
          </div>
          {menu.length > 0 && (
            <PopoverMenu
              label="Comment options"
              items={menu}
              trigger={<MoreHorizontal size={15} />}
              triggerClassName="h-10 w-10"
              className="shrink-0"
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-1 pl-1 text-xs text-text-dim">
          {comment._status === 'sending' ? (
            <span className="inline-flex min-h-8 items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Posting…
            </span>
          ) : comment._status === 'failed' ? (
            <>
              <span className="inline-flex min-h-10 items-center text-accent-warm">{comment._error ?? 'Not posted.'}</span>
              <button type="button" className="inline-flex min-h-10 items-center px-1.5 font-medium text-gold" onClick={() => onRetry(comment)}>
                Retry
              </button>
              <button type="button" className="inline-flex min-h-10 items-center px-1.5" onClick={() => discard(comment)}>
                Discard
              </button>
            </>
          ) : (
            <>
              <time dateTime={comment.createdAt} title={fullTime(comment.createdAt)} className="inline-flex min-h-10 items-center">
                {feedTime(comment.createdAt)}
              </time>
              {onReply && ctx.canComment && (
                <button type="button" onClick={onReply} className="inline-flex min-h-10 items-center px-2 font-medium text-text-muted hover:text-gold">
                  Reply
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        loading={del.isPending}
        danger
        title="Delete this comment?"
        description={comment.parentId ? 'It will be removed for everyone.' : 'It will be removed for everyone, along with its replies.'}
        confirmLabel="Delete"
        onConfirm={() =>
          del.mutate(
            { id: comment.id, postId: comment.postId, parentId: comment.parentId },
            {
              onSuccess: () => setConfirmDelete(false),
              onError: (e) => toast({ title: 'Couldn’t delete', description: getApiErrorMessage(e), variant: 'destructive' }),
            },
          )
        }
      />
      <FeedReportModal target={reporting ? { commentId: comment.id } : null} onClose={() => setReporting(false)} />
    </div>
  )
}

// ── A top-level comment with its replies ─────────────────────────────

function CommentThread({
  comment,
  ctx,
  me,
  onRetry,
}: {
  comment: LocalFeedComment
  ctx: Ctx
  me: { name: string; avatar?: string | null }
  onRetry: (c: LocalFeedComment) => void
}) {
  const [open, setOpen] = useState(false)
  const [replying, setReplying] = useState(false)
  const add = useAddComment(comment.postId)
  const replies = useReplies(comment.id, open)
  const shown = replies.replies
  const hiddenCount = Math.max(0, comment.replyCount - shown.filter((r) => !r._status && !r.hiddenAt).length)
  const local = comment.id.startsWith('local:')

  return (
    <div className="min-w-0">
      <CommentItem
        comment={comment}
        ctx={ctx}
        onRetry={onRetry}
        onReply={
          local || comment._status
            ? undefined
            : () => {
                setOpen(true)
                setReplying(true)
              }
        }
      />
      <div className="ml-10 min-w-0 space-y-2">
        {!open && comment.replyCount > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-text-muted hover:text-gold"
          >
            <CornerDownRight size={13} /> View {plural(comment.replyCount, 'reply', 'replies')}
          </button>
        )}
        {open && (
          <>
            {shown.map((r) => (
              <CommentItem key={commentKey(r)} comment={r} ctx={ctx} onRetry={onRetry} isReply />
            ))}
            {replies.isLoading && (
              <div className="flex min-h-10 items-center text-text-dim">
                <Loader2 size={14} className="animate-spin" />
              </div>
            )}
            {replies.isError && (
              <button type="button" onClick={() => replies.refetch()} className="inline-flex min-h-10 items-center text-xs text-accent-warm">
                Replies couldn’t load — tap to retry
              </button>
            )}
            {replies.hasNextPage && (
              <button
                type="button"
                disabled={replies.isFetchingNextPage}
                onClick={() => void replies.fetchNextPage()}
                className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-text-muted hover:text-gold"
              >
                {replies.isFetchingNextPage ? <Loader2 size={12} className="animate-spin" /> : <CornerDownRight size={13} />}
                View more replies{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
              </button>
            )}
            {replying && ctx.canComment && (
              <CommentComposer
                postId={comment.postId}
                compact
                autoFocus
                meName={me.name}
                meAvatar={me.avatar}
                placeholder={`Reply to ${personName(comment.author).split(' ')[0]}…`}
                onSubmit={(body) => void add({ body, parentId: comment.id })}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Section ──────────────────────────────────────────────────────────

export function CommentsSection({
  post,
  meId,
  me,
  moderator,
  canComment,
  autoFocus,
}: {
  post: LocalFeedPost
  meId: string | null
  me: { name: string; avatar?: string | null }
  moderator: boolean
  canComment: boolean
  autoFocus?: boolean
}) {
  const q = useComments(post.id, true)
  const add = useAddComment(post.id)
  const ctx: Ctx = { meId, moderator, canComment }
  const retry = (c: LocalFeedComment) => void add({ body: c.body, parentId: c.parentId }, c.clientId ?? undefined)

  return (
    <div className="min-w-0 space-y-3 border-t border-border pt-3">
      {q.hasNextPage && (
        <button
          type="button"
          disabled={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
          className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-text-muted hover:text-gold"
        >
          {q.isFetchingNextPage && <Loader2 size={13} className="animate-spin" />}
          View older comments
        </button>
      )}
      {q.isLoading ? (
        <div className="flex justify-center py-3 text-text-dim">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : q.isError ? (
        <button type="button" onClick={() => q.refetch()} className="min-h-10 text-sm text-accent-warm">
          {getApiErrorMessage(q.error, 'Comments couldn’t load.')} Tap to retry.
        </button>
      ) : q.comments.length === 0 && !canComment ? (
        <p className="py-1 text-sm text-text-dim">No comments yet.</p>
      ) : null}
      {q.comments.map((c) => (
        <CommentThread key={commentKey(c)} comment={c} ctx={ctx} me={me} onRetry={retry} />
      ))}
      {canComment && (
        <CommentComposer
          postId={post.id}
          autoFocus={autoFocus}
          meName={me.name}
          meAvatar={me.avatar}
          onSubmit={(body) => void add({ body, parentId: null })}
        />
      )}
    </div>
  )
}
