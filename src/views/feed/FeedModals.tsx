'use client'

// Feed dialogs: edit my post (text + photos; own sheet/dialog) and report a
// post or comment to the Club team on the house Modal (lands in admin →
// Messages → Reports).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { MAX_POST_BODY, MAX_POST_IMAGES, uploadFeedImage, useEditPost, useReportFeed, validateFeedImage } from '@/lib/feed/hooks'
import { readImageSize } from '@/lib/chat/hooks/useUploadAttachment'
import type { FeedImage } from '@/lib/chat/contract'
import { cn } from '@/lib/utils'
import { PhotoPreview } from './PostComposer'
import { useMentionInput } from './MentionPicker'
import type { LocalFeedPost } from '@/lib/feed/types'
import { getApiErrorMessage } from '@/lib/http/chat-client'
import { toast } from '@/lib/hooks/use-toast'

type EditItem =
  | { kind: 'existing'; key: string; image: FeedImage }
  | { kind: 'new'; key: string; file: File; url: string; ratio: number | null; progress?: number }

const ratioOf = (w?: number, h?: number) => (w && h ? w / h : null)

/**
 * Edit my post: text (auto-growing like the composer) AND photos — existing
 * ones as removable thumbs, add more up to 4 (validated, dimensions captured,
 * upload progress). Save stays disabled until something changed. A centred
 * dialog on sm+, a full-screen sheet on phones. The saved post replaces the
 * cached one (socket `feed:post:updated` covers everyone else).
 */
export function EditPostModal({ post, onClose }: { post: LocalFeedPost | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [body, setBody] = useState('')
  const [items, setItems] = useState<EditItem[]>([])
  const [saving, setSaving] = useState(false)
  const edit = useEditPost()
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const open = !!post
  const mention = useMentionInput({ taRef, text: body, setText: setBody, postId: post?.id ?? null })
  const { load: loadMentions } = mention

  useEffect(() => setMounted(true), [])

  // Fresh state each time it opens — keyed by id so live updates to the post
  // (likes, comments) don't wipe an edit in progress.
  const postId = post?.id ?? null
  useEffect(() => {
    if (!post) return
    // Stored tokens → `@Name` text + remembered picks (lossless round-trip).
    setBody(loadMentions(post.body))
    setItems(post.images.map((image) => ({ kind: 'existing', key: image.path, image })))
    setSaving(false)
  }, [postId]) // eslint-disable-line react-hooks/exhaustive-deps

  const release = useCallback(() => {
    itemsRef.current.forEach((it) => it.kind === 'new' && URL.revokeObjectURL(it.url))
  }, [])
  useEffect(() => release, [release])

  const close = useCallback(() => {
    if (saving) return
    release()
    setItems([])
    onClose()
  }, [saving, release, onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, close])

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 360)}px`
  }, [body, open])

  if (!post || !mounted) return null

  const trimmed = mention.toBody(body.trim())
  const pathsNow = items.map((it) => (it.kind === 'existing' ? it.image.path : it.key))
  const imagesChanged = pathsNow.length !== post.images.length || pathsNow.some((p, i) => p !== post.images[i]?.path)
  const changed = trimmed !== post.body.trim() || imagesChanged
  const canSave = changed && (trimmed.length > 0 || items.length > 0) && !saving

  function addFiles(list: FileList | File[]) {
    const accepted: EditItem[] = []
    for (const f of Array.from(list)) {
      const problem = validateFeedImage(f)
      if (problem) {
        toast({ title: 'Can’t add that photo', description: problem, variant: 'destructive' })
        continue
      }
      if (itemsRef.current.length + accepted.length >= MAX_POST_IMAGES) {
        toast({ title: `Up to ${MAX_POST_IMAGES} photos per post`, variant: 'destructive' })
        break
      }
      accepted.push({ kind: 'new', key: `new:${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`, file: f, url: URL.createObjectURL(f), ratio: null })
    }
    if (!accepted.length) return
    setItems((prev) => [...prev, ...accepted])
    for (const a of accepted) {
      if (a.kind !== 'new') continue
      void readImageSize(a.file).then(({ width, height }) => {
        const r = ratioOf(width, height)
        if (r) setItems((prev) => prev.map((x) => (x.key === a.key && x.kind === 'new' ? { ...x, ratio: r } : x)))
      })
    }
  }

  function remove(i: number) {
    setItems((prev) => {
      const it = prev[i]
      if (it?.kind === 'new') URL.revokeObjectURL(it.url)
      return prev.filter((_, j) => j !== i)
    })
  }

  async function save() {
    if (!post || !canSave) return
    setSaving(true)
    try {
      let images: Omit<FeedImage, 'url'>[] | undefined
      if (imagesChanged) {
        images = await Promise.all(
          items.map(async (it) => {
            if (it.kind === 'existing') {
              const { url: _url, ...stored } = it.image
              return stored
            }
            return uploadFeedImage(post.groupId, it.file, (f) =>
              setItems((prev) => prev.map((x) => (x.key === it.key && x.kind === 'new' ? { ...x, progress: f } : x))),
            )
          }),
        )
      }
      await edit.mutateAsync({ id: post.id, body: trimmed, images })
      toast({ title: 'Post updated' })
      setSaving(false)
      release()
      setItems([])
      onClose()
    } catch (e) {
      setSaving(false)
      setItems((prev) => prev.map((x) => (x.kind === 'new' ? { ...x, progress: undefined } : x)))
      toast({ title: 'Couldn’t save', description: getApiErrorMessage(e), variant: 'destructive' })
    }
  }

  const left = MAX_POST_BODY - body.length

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(14,12,10,0.55)]" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit post"
        className={cn(
          'chat-theme flex flex-col overflow-hidden shadow-[var(--shadow-xl)]',
          // phones: full-screen sheet; sm+: centred dialog
          'fixed inset-0 sm:static sm:max-h-[85dvh] sm:w-[min(560px,calc(100vw-2rem))] sm:rounded-[var(--radius-xl)] sm:border sm:border-border',
        )}
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">Edit post</h2>
          <button type="button" onClick={close} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-text-dim hover:bg-surface-2 hover:text-text">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <div className="relative">
          <textarea
            ref={taRef}
            value={body}
            rows={1}
            maxLength={MAX_POST_BODY}
            aria-label="Post text"
            placeholder="Write something…"
            onChange={(e) => setBody(e.target.value)}
            onClick={mention.refresh}
            onKeyUp={(e) => (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') && mention.refresh()}
            onKeyDown={(e) => {
              if (mention.onKeyDown(e)) return
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void save()
              }
            }}
            className="block w-full resize-none bg-transparent py-1 text-[15px] leading-6 text-text outline-none placeholder:text-text-dim"
          />
          {mention.popover}
          </div>
          <PhotoPreview
            className="mt-3"
            bleedClassName="-mx-4 px-4 sm:-mx-5 sm:px-5"
            items={items.map((it) =>
              it.kind === 'existing'
                ? { key: it.key, url: it.image.url, ratio: ratioOf(it.image.width, it.image.height) }
                : { key: it.key, url: it.url, ratio: it.ratio, progress: it.progress },
            )}
            onRemove={saving ? undefined : remove}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 border-t border-border px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={saving || items.length >= MAX_POST_IMAGES}
            aria-label="Add photos"
            className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-gold disabled:opacity-40"
          >
            <ImagePlus size={19} strokeWidth={1.7} />
          </button>
          {items.length > 0 && (
            <span className="text-xs tabular-nums text-text-dim">
              {items.length}/{MAX_POST_IMAGES}
            </span>
          )}
          {left < 300 && <span className={cn('ml-1 text-xs tabular-nums', left < 50 ? 'text-accent-warm' : 'text-text-dim')}>{left}</span>}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={close} disabled={saving} className="min-h-10">
            Cancel
          </Button>
          <Button size="sm" loading={saving} disabled={!canSave} onClick={save} className="min-h-10 px-5">
            Save
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function FeedReportModal({
  target,
  onClose,
}: {
  target: { postId?: string; commentId?: string } | null
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const report = useReportFeed()

  async function submit() {
    if (!target || !reason.trim()) return
    try {
      await report.mutateAsync({ ...target, reason: reason.trim() })
      toast({ title: 'Report sent', description: 'Thank you — the Club team will review it in confidence.' })
      setReason('')
      onClose()
    } catch (e) {
      toast({ title: 'Could not send report', description: getApiErrorMessage(e), variant: 'destructive' })
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} title={target?.commentId ? 'Report comment' : 'Report post'} size="md">
      <p className="mb-3 text-sm text-text-muted">
        Tell us what’s wrong. Only the Club team sees reports — the author isn’t told who reported it.
      </p>
      <Textarea
        label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. spam, sales pitch, inappropriate content…"
        rows={4}
      />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" loading={report.isPending} disabled={!reason.trim()} onClick={submit}>
          Send report
        </Button>
      </div>
    </Modal>
  )
}
