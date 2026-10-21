'use client'

// Scroll container for a conversation, after shadcn's June-2026 MessageScroller
// (viewport + content + controls), hand-authored for this kit. Two modes:
//
//  - Legacy (WhatsApp inbox): pass `pin` — re-pins to the bottom when it changes.
//  - Paged thread: pass `newestKey` / `oldestKey` (+ `onLoadOlder`). Then it
//      • opens at the latest message,
//      • loads older history from a top IntersectionObserver sentinel,
//      • keeps the visible row in place when older messages PREPEND
//        (native overflow-anchor is off so we don't double-correct),
//      • follows new messages only when the reader is at the bottom (or it's
//        their own), otherwise shows a "N new messages" pill,
//      • shows a "jump to latest" button while scrolled up,
//      • stays pinned when late-loading images grow the content.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ArrowDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const BOTTOM_SLACK_PX = 80

export interface MessageScrollerProps {
  children: ReactNode
  /** Legacy: re-pin to the bottom whenever this changes (message count / last id). */
  pin?: unknown
  /** Classes for the scrolling viewport (legacy default: padding). */
  className?: string
  /** Classes for the inner content column. */
  contentClassName?: string
  /** Stable key of the newest rendered item (enables paged mode). */
  newestKey?: string | null
  /** Stable key of the oldest rendered item — a change with the same newest = prepend. */
  oldestKey?: string | null
  /** The newest item is the viewer's own — always scroll to it. */
  newestIsMine?: boolean
  hasOlder?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => void
  /** Rendered above the items (e.g. "start of conversation"). */
  header?: ReactNode
  /** Rendered below the items, inside the scroll (e.g. typing indicator). */
  footer?: ReactNode
  ariaLabel?: string
}

export function MessageScroller({
  children,
  pin,
  className,
  contentClassName,
  newestKey,
  oldestKey,
  newestIsMine,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  header,
  footer,
  ariaLabel = 'Messages',
}: MessageScrollerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const paged = newestKey !== undefined

  const atBottom = useRef(true)
  const initialised = useRef(false)
  const prev = useRef<{ oldest: string | null; newest: string | null; height: number; top: number }>({
    oldest: null,
    newest: null,
    height: 0,
    top: 0,
  })
  const [showJump, setShowJump] = useState(false)
  const [newCount, setNewCount] = useState(0)

  const record = useCallback(() => {
    const el = ref.current
    if (!el) return
    prev.current.height = el.scrollHeight
    prev.current.top = el.scrollTop
  }, [])

  const scrollToBottom = useCallback(
    (smooth = false) => {
      const el = ref.current
      if (!el) return
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
      atBottom.current = true
      setShowJump(false)
      setNewCount(0)
      record()
    },
    [record],
  )

  // Legacy pin mode.
  useEffect(() => {
    if (paged) return
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [pin, paged])

  // Paged mode: runs after every render, before paint.
  useLayoutEffect(() => {
    if (!paged) return
    const el = ref.current
    if (!el) return
    const p = prev.current
    const newest = newestKey ?? null
    const oldest = oldestKey ?? null
    if (!initialised.current) {
      if (newest) {
        el.scrollTop = el.scrollHeight
        initialised.current = true
      }
    } else if (newest === p.newest && oldest !== p.oldest && p.height > 0) {
      // Older page prepended — hold the reader's place.
      el.scrollTop = p.top + (el.scrollHeight - p.height)
    } else if (newest !== p.newest && newest) {
      if (atBottom.current || newestIsMine) el.scrollTop = el.scrollHeight
      else setNewCount((n) => n + 1)
    }
    p.newest = newest
    p.oldest = oldest
    p.height = el.scrollHeight
    p.top = el.scrollTop
  })

  // Content growth (images decoding, typing row) — stay pinned if we were.
  useEffect(() => {
    const el = ref.current
    const content = contentRef.current
    if (!el || !content || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight
      record()
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [record])

  // Top sentinel → load older. Re-created after each load so a sentinel that
  // is still in view (short pages) keeps fetching until the viewport fills.
  const loadRef = useRef(onLoadOlder)
  loadRef.current = onLoadOlder
  useEffect(() => {
    if (!paged || !hasOlder || loadingOlder || !loadRef.current) return
    const root = ref.current
    const target = sentinelRef.current
    if (!root || !target || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && initialised.current) loadRef.current?.()
      },
      { root, rootMargin: '240px 0px 0px 0px' },
    )
    io.observe(target)
    return () => io.disconnect()
  }, [paged, hasOlder, loadingOlder, newestKey])

  function onScroll() {
    const el = ref.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    const bottom = dist < BOTTOM_SLACK_PX
    atBottom.current = bottom
    if (paged) {
      setShowJump(!bottom)
      if (bottom) setNewCount(0)
    }
    record()
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        onScroll={onScroll}
        style={{ overflowAnchor: 'none' }}
        className={cn(
          'flex-1 min-h-0 overflow-y-auto px-6 py-5',
          paged && '[scrollbar-width:thin] [scrollbar-color:var(--color-border-hover)_transparent]',
          className,
        )}
      >
        {paged && (
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
        )}
        {header}
        <div
          ref={contentRef}
          role="log"
          aria-label={ariaLabel}
          aria-live="polite"
          className={cn('flex flex-col gap-2', contentClassName)}
        >
          {children}
          {footer}
        </div>
      </div>

      {/* Overlaid (not in flow) so showing it doesn't shift the reader's place. */}
      {paged && loadingOlder && (
        <div
          role="status"
          aria-label="Loading earlier messages"
          className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-gold shadow-sm"
        >
          <Loader2 size={15} className="animate-spin" />
        </div>
      )}
      {paged && newCount > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-gold px-3.5 py-1.5 text-xs font-medium text-white shadow-md transition-colors hover:bg-gold-dark"
        >
          <ArrowDown size={13} />
          {newCount === 1 ? '1 new message' : `${newCount > 99 ? '99+' : newCount} new messages`}
        </button>
      )}
      {paged && showJump && newCount === 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label="Jump to latest message"
          className="absolute bottom-4 right-5 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-md transition-colors hover:text-gold hover:border-gold/40"
        >
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  )
}
