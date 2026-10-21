'use client'

// "Share an update…" card at the top of a feed. Collapsed (nothing typed, no
// photos) it's a single-line pill row; focusing it expands in place: the
// textarea auto-grows from one line (no dead space), picked photos preview
// right under the text — one photo full width in the same no-crop frame the
// feed uses, several as a horizontal strip of square thumbs with × — and a
// compact action row: photo button (+ muted "n/4"), Cancel only when there's
// something to cancel, Post on the right. Cmd/Ctrl+Enter posts. Sending is
// optimistic (useCreatePost), so the card resets at once.

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Lock, X } from 'lucide-react'
import { ChatAvatar } from '@/components/ui/chat'
import { Button } from '@/components/ui/Button'
import { readImageSize } from '@/lib/chat/hooks/useUploadAttachment'
import { MAX_POST_BODY, MAX_POST_IMAGES, validateFeedImage, type PostInput } from '@/lib/feed/hooks'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import { clampRatio, FramedImage } from './PostImages'
import { useMentionInput } from './MentionPicker'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic'
const MAX_TEXT_HEIGHT = 320

interface Picked {
  file: File
  url: string
  ratio: number | null
}

export function PostComposer({
  me,
  onPost,
  disabledReason,
  placeholder = 'Share an update…',
  groupId = null,
  className,
}: {
  me: { name: string; avatar?: string | null }
  /** feed being posted to (null = Club feed) — scopes @mention suggestions */
  groupId?: string | null
  onPost: (input: PostInput) => void
  /** set = the viewer can't post here; shows a locked line instead */
  disabledReason?: string | null
  placeholder?: string
  className?: string
}) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Picked[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef(files)
  filesRef.current = files

  const mention = useMentionInput({ taRef, text, setText, groupId })
  const hasContent = text.trim().length > 0 || files.length > 0
  const expanded = focused || hasContent

  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), [])

  // Auto-grow from a single line.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    if (!expanded) {
      ta.style.height = ''
      return
    }
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_TEXT_HEIGHT)}px`
  }, [text, expanded])

  function addFiles(list: FileList | File[]) {
    const accepted: Picked[] = []
    for (const f of Array.from(list)) {
      const problem = validateFeedImage(f)
      if (problem) {
        toast({ title: 'Can’t add that photo', description: problem, variant: 'destructive' })
        continue
      }
      if (filesRef.current.length + accepted.length >= MAX_POST_IMAGES) {
        toast({ title: `Up to ${MAX_POST_IMAGES} photos per post`, variant: 'destructive' })
        break
      }
      accepted.push({ file: f, url: URL.createObjectURL(f), ratio: null })
    }
    if (!accepted.length) return
    setFiles((prev) => [...prev, ...accepted])
    // Size the single-photo preview frame without waiting for layout.
    for (const p of accepted) {
      void readImageSize(p.file).then(({ width, height }) => {
        if (width && height) setFiles((prev) => prev.map((x) => (x.url === p.url ? { ...x, ratio: width / height } : x)))
      })
    }
  }

  function removeFile(i: number) {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[i].url)
      return prev.filter((_, j) => j !== i)
    })
  }

  function reset() {
    files.forEach((f) => URL.revokeObjectURL(f.url))
    setFiles([])
    setText('')
    mention.reset()
    setFocused(false)
    taRef.current?.blur()
  }

  function submit() {
    const body = mention.toBody(text.trim())
    if (!body && !files.length) return
    const picked = files.map((f) => f.file)
    files.forEach((f) => URL.revokeObjectURL(f.url))
    setFiles([])
    setText('')
    mention.reset()
    setFocused(false)
    taRef.current?.blur()
    onPost({ body, files: picked })
  }

  const card = 'rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-sm)]'

  if (disabledReason) {
    return (
      <div className={cn(card, 'flex items-center gap-2.5 px-4 py-3 text-sm text-text-muted', className)}>
        <Lock size={15} className="shrink-0 text-gold" />
        <span className="min-w-0">{disabledReason}</span>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className={cn(card, 'px-3 py-2.5 sm:px-4', className)}
      // Collapse when focus leaves the card with nothing in it.
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="flex min-w-0 items-start gap-2.5">
        <ChatAvatar name={me.name} src={me.avatar} size="md" className="mt-0.5" />
        <div className="relative min-w-0 flex-1">
        <textarea
          ref={taRef}
          value={text}
          rows={1}
          maxLength={MAX_POST_BODY}
          placeholder={placeholder}
          aria-label="Post text"
          onFocus={() => setFocused(true)}
          onChange={(e) => setText(e.target.value)}
          onClick={mention.refresh}
          onKeyUp={(e) => (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') && mention.refresh()}
          onKeyDown={(e) => {
            if (mention.onKeyDown(e)) return
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
            if (e.key === 'Escape' && !hasContent) taRef.current?.blur()
          }}
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
            if (pasted.length) {
              e.preventDefault()
              addFiles(pasted)
            }
          }}
          className={cn(
            'block w-full min-w-0 resize-none text-[15px] leading-6 text-text outline-none placeholder:text-text-dim',
            expanded
              ? 'bg-transparent px-0.5 py-2'
              : 'h-11 overflow-hidden whitespace-nowrap rounded-full border border-border bg-surface-2 px-4 py-2.5 transition-colors hover:border-border-hover',
          )}
        />
          {mention.popover}
        </div>
        {!expanded && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Add photos"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-gold"
          >
            <ImagePlus size={20} strokeWidth={1.7} />
          </button>
        )}
      </div>

      {expanded && (
        <>
          <PhotoPreview
            className="mt-2"
            items={files.map((f) => ({ key: f.url, url: f.url, ratio: f.ratio }))}
            onRemove={removeFile}
            bleedClassName="-mx-3 px-3 sm:-mx-4 sm:px-4"
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={files.length >= MAX_POST_IMAGES}
              aria-label="Add photos"
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-gold disabled:opacity-40"
            >
              <ImagePlus size={19} strokeWidth={1.7} />
            </button>
            {files.length > 0 && (
              <span className="text-xs tabular-nums text-text-dim">
                {files.length}/{MAX_POST_IMAGES}
              </span>
            )}
            {MAX_POST_BODY - text.length < 300 && (
              <span className={cn('ml-1 text-xs tabular-nums', MAX_POST_BODY - text.length < 50 ? 'text-accent-warm' : 'text-text-dim')}>
                {MAX_POST_BODY - text.length}
              </span>
            )}
            <span className="flex-1" />
            {hasContent && (
              <Button variant="ghost" size="sm" onClick={reset} className="min-h-10">
                Cancel
              </Button>
            )}
            <Button size="sm" disabled={!hasContent} onClick={submit} className="min-h-10 px-5">
              Post
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export interface PreviewItem {
  key: string
  url: string
  ratio: number | null
  /** 0..1 while uploading */
  progress?: number
}

/**
 * Picked / attached photos under the text: one = full-width no-crop frame at
 * its display ratio; several = horizontal strip of square thumbs. × removes.
 * Shared by the composer and the edit dialog.
 */
export function PhotoPreview({
  items,
  onRemove,
  className,
  bleedClassName,
}: {
  items: PreviewItem[]
  onRemove?: (index: number) => void
  className?: string
  /** negative-margin + padding so the strip can scroll to the card edge */
  bleedClassName?: string
}) {
  if (!items.length) return null
  if (items.length === 1) {
    const it = items[0]
    const frame = clampRatio(it.ratio ?? 0.8)
    return (
      <div className={cn('relative overflow-hidden rounded-[var(--radius-md)]', className)} style={{ aspectRatio: String(frame) }}>
        <FramedImage src={it.url} ratio={it.ratio} frameRatio={frame} />
        <Progress value={it.progress} />
        {onRemove && <RemoveButton onClick={() => onRemove(0)} />}
      </div>
    )
  }
  return (
    <div className={cn('flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]', bleedClassName, className)}>
      {items.map((it, i) => (
        <div key={it.key} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-surface-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob / signed preview */}
          <img src={it.url} alt="" className="h-full w-full object-cover" />
          <Progress value={it.progress} />
          {onRemove && <RemoveButton onClick={() => onRemove(i)} small />}
        </div>
      ))}
    </div>
  )
}

function Progress({ value }: { value?: number }) {
  if (value === undefined || value >= 1) return null
  const pct = Math.round(value * 100)
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/45 text-white">
      <span className="text-xs font-medium tabular-nums">{pct}%</span>
      <span className="h-1 w-1/2 overflow-hidden rounded-full bg-white/30">
        <span className="block h-full rounded-full bg-white transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </span>
    </span>
  )
}

function RemoveButton({ onClick, small }: { onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove photo"
      className={cn(
        'absolute right-1.5 top-1.5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80',
        small ? 'h-7 w-7' : 'h-9 w-9',
      )}
    >
      <X size={small ? 13 : 16} />
    </button>
  )
}
