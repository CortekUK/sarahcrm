'use client'

// Message composer in the shadcn Input Group shape: [attach] [autosizing
// textarea] [send] inside one bordered, gold-focus field, with a photo tray
// above when files are picked. Enter sends, Shift+Enter makes a newline (IME
// composition is respected); pasting an image attaches it. When the thread is
// read-only / blocked / archived, a locked bar with the reason replaces it.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ImagePlus, Lock, SendHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_HEIGHT_PX = 160

export interface ComposerSubmit {
  body: string
  files: File[]
}

export function Composer({
  onSend,
  onTyping,
  disabled,
  disabledReason,
  disabledAction,
  placeholder = 'Write a message…',
  allowAttachments = true,
  maxFiles = 6,
  validateFile,
  onError,
  autoFocus,
  maxLength = 4000,
  accept = 'image/jpeg,image/png,image/webp,image/gif,image/heic',
  className,
}: {
  /** Return (or resolve) `false` to put the draft back (e.g. the send couldn't start). */
  onSend: (input: ComposerSubmit) => void | boolean | Promise<void | boolean>
  onTyping?: () => void
  disabled?: boolean
  disabledReason?: ReactNode
  disabledAction?: ReactNode
  placeholder?: string
  allowAttachments?: boolean
  maxFiles?: number
  validateFile?: (file: File) => string | null
  onError?: (message: string) => void
  autoFocus?: boolean
  /** server cap on body length */
  maxLength?: number
  accept?: string
  className?: string
}) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<{ file: File; url: string }[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef(files)
  filesRef.current = files

  // Publish the docked composer's live height as --chat-composer-h so floating
  // launchers (admin HelpAssistant) can sit above it instead of covering Send.
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const ro = new ResizeObserver(() => root.style.setProperty('--chat-composer-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--chat-composer-h')
    }
  }, [disabled])

  // Free preview URLs when the composer goes away.
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), [])

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_HEIGHT_PX)}px`
  }, [text])

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list)
    const accepted: { file: File; url: string }[] = []
    for (const f of incoming) {
      const problem = validateFile?.(f) ?? null
      if (problem) {
        onError?.(problem)
        continue
      }
      if (filesRef.current.length + accepted.length >= maxFiles) {
        onError?.(`You can attach up to ${maxFiles} photos.`)
        break
      }
      accepted.push({ file: f, url: URL.createObjectURL(f) })
    }
    if (accepted.length) setFiles((prev) => [...prev, ...accepted])
  }

  function removeFile(i: number) {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[i].url)
      return prev.filter((_, j) => j !== i)
    })
  }

  function submit() {
    const body = text.trim()
    if (!body && files.length === 0) return
    const picked = files.map((f) => f.file)
    // The sender owns the files now; previews are re-created from them.
    files.forEach((f) => URL.revokeObjectURL(f.url))
    setText('')
    setFiles([])
    taRef.current?.focus()
    void Promise.resolve(onSend({ body, files: picked })).then((ok) => {
      if (ok !== false) return
      setText(body)
      setFiles(picked.map((file) => ({ file, url: URL.createObjectURL(file) })))
    })
  }

  if (disabled) {
    return (
      <div
        ref={rootRef}
        className={cn(
          'shrink-0 border-t border-border bg-[var(--chat-header-bg,var(--color-surface))] px-4 pt-3 sm:px-6',
          'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-surface-2 px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-xs leading-relaxed text-text-muted">
            <Lock size={14} className="shrink-0 text-gold" />
            {disabledReason ?? 'You can’t send messages here.'}
          </span>
          {disabledAction}
        </div>
      </div>
    )
  }

  const canSend = text.trim().length > 0 || files.length > 0

  return (
    <div
      ref={rootRef}
      className={cn(
        'shrink-0 border-t border-border bg-[var(--chat-header-bg,var(--color-surface))] px-3 pt-2.5 sm:px-5',
        // Clear the home indicator / browser chrome on phones.
        'pb-[max(0.625rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      <div
        className={cn(
          'rounded-[var(--radius-xl)] border border-border bg-[var(--chat-thread-bg,var(--color-surface))] transition-[border-color,box-shadow] duration-200',
          'focus-within:border-gold focus-within:shadow-[0_0_0_3px_var(--color-gold-muted)]',
        )}
      >
        {files.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-2.5 pt-2.5">
            {files.map((f, i) => (
              <div key={f.url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob preview */}
                <img src={f.url} alt={f.file.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label={`Remove ${f.file.name}`}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(44,40,37,0.65)] text-white hover:bg-[rgba(44,40,37,0.85)]"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1 px-1.5 py-1.5">
          {allowAttachments && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Attach photo"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-dim transition-colors hover:bg-surface-2 hover:text-gold"
              >
                <ImagePlus size={18} strokeWidth={1.7} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={accept}
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </>
          )}
          <textarea
            ref={taRef}
            value={text}
            rows={1}
            maxLength={maxLength}
            autoFocus={autoFocus}
            placeholder={placeholder}
            aria-label="Message"
            onChange={(e) => {
              setText(e.target.value)
              onTyping?.()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            onPaste={(e) => {
              if (!allowAttachments) return
              const pasted = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
              if (pasted.length) {
                e.preventDefault()
                addFiles(pasted)
              }
            }}
            className="min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-text outline-none placeholder:text-text-dim font-[family-name:var(--font-body)]"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send message"
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-150',
              canSend
                ? 'bg-gold text-white shadow-sm hover:bg-gold-dark'
                : 'bg-surface-2 text-text-dim cursor-not-allowed',
            )}
          >
            <SendHorizontal size={16} />
          </button>
        </div>
      </div>
      <p className="mt-1.5 hidden px-2 text-[10.5px] text-text-dim sm:block">
        Enter to send · Shift + Enter for a new line
      </p>
    </div>
  )
}
