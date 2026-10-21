'use client'

// Photo + file attachments after shadcn's June-2026 Attachment: an image grid
// inside the bubble (1 / 2 / 3 / 4+ layouts, "+N" on the last tile), upload
// progress overlays for optimistic sends, a file card for non-images, and a
// lightbox (house Modal) with prev/next.

import { useEffect, useState } from 'react'
import { AlertCircle, ChevronLeft, ChevronRight, ExternalLink, FileText } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { formatBytes } from './format'

export interface AttachmentItem {
  url: string
  name: string
  mime: string
  size: number
  width?: number
  height?: number
}

export const isImage = (a: { mime: string }) => a.mime.startsWith('image/')

function ProgressOverlay({ value, failed }: { value?: number; failed?: boolean }) {
  if (failed) {
    return (
      <span className="absolute inset-0 flex items-center justify-center bg-[rgba(44,40,37,0.45)] text-white">
        <AlertCircle size={20} />
      </span>
    )
  }
  if (value === undefined || value >= 1) return null
  const pct = Math.round(value * 100)
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgba(44,40,37,0.4)] text-white">
      <span className="text-xs font-medium tabular-nums">{pct}%</span>
      <span className="h-1 w-2/3 overflow-hidden rounded-full bg-white/30">
        <span className="block h-full rounded-full bg-white transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </span>
    </span>
  )
}

export function AttachmentImage({
  item,
  onOpen,
  progress,
  failed,
  className,
  overlay,
}: {
  item: AttachmentItem
  onOpen?: () => void
  progress?: number
  failed?: boolean
  className?: string
  overlay?: string
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className={cn(
        'group/att relative block overflow-hidden bg-surface-3 focus-visible:outline-2 focus-visible:outline-gold',
        onOpen && 'cursor-zoom-in',
        className,
      )}
      aria-label={`Open photo ${item.name}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed / blob URLs */}
      <img
        src={item.url}
        alt={item.name}
        loading="lazy"
        width={item.width}
        height={item.height}
        className="h-full w-full object-cover transition-transform duration-300 group-hover/att:scale-[1.02]"
      />
      <ProgressOverlay value={progress} failed={failed} />
      {overlay && (
        <span className="absolute inset-0 flex items-center justify-center bg-[rgba(44,40,37,0.5)] font-[family-name:var(--font-heading)] text-xl text-white">
          {overlay}
        </span>
      )}
    </button>
  )
}

export function AttachmentFile({ item, className }: { item: AttachmentItem; className?: string }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-gold/40',
        className,
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-gold-muted text-gold">
        <FileText size={16} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-text">{item.name}</span>
        <span className="block text-[11px] text-text-dim">{formatBytes(item.size)}</span>
      </span>
    </a>
  )
}

/** Image grid for a message. `progress[i]` (0..1) shows an upload overlay. */
export function AttachmentGrid({
  items,
  progress,
  failed,
  onOpen,
  className,
}: {
  items: AttachmentItem[]
  progress?: number[]
  failed?: boolean
  onOpen?: (index: number) => void
  className?: string
}) {
  const images = items.filter(isImage)
  const files = items.filter((a) => !isImage(a))
  if (items.length === 0) return null
  const shown = images.slice(0, 4)
  const extra = images.length - shown.length
  const idx = (a: AttachmentItem) => items.indexOf(a)

  return (
    <div className={cn('flex flex-col gap-1 p-1', className)}>
      {shown.length === 1 && (
        <AttachmentImage
          item={shown[0]}
          onOpen={onOpen && (() => onOpen(0))}
          progress={progress?.[idx(shown[0])]}
          failed={failed}
          className="max-h-80 w-full rounded-[calc(var(--radius-lg)-4px)]"
        />
      )}
      {shown.length > 1 && (
        <div className="grid w-full grid-cols-2 gap-1">
          {shown.map((a, i) => (
            <AttachmentImage
              key={`${a.url}-${i}`}
              item={a}
              onOpen={onOpen && (() => onOpen(i))}
              progress={progress?.[idx(a)]}
              failed={failed}
              overlay={i === 3 && extra > 0 ? `+${extra}` : undefined}
              className={cn(
                'aspect-square rounded-[calc(var(--radius-lg)-6px)]',
                shown.length === 3 && i === 0 && 'col-span-2 aspect-[2/1]',
              )}
            />
          ))}
        </div>
      )}
      {files.map((f, i) => (
        <AttachmentFile key={`${f.url}-${i}`} item={f} />
      ))}
    </div>
  )
}

/** Full-size viewer for a message's photos. */
export function AttachmentLightbox({
  images,
  index,
  onClose,
}: {
  images: AttachmentItem[]
  index: number | null
  onClose: () => void
}) {
  const [i, setI] = useState(index ?? 0)
  useEffect(() => {
    if (index !== null) setI(index)
  }, [index])
  const open = index !== null && images.length > 0
  const current = images[Math.min(i, images.length - 1)]

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, images.length - 1))
      if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, images.length])

  return (
    <Modal open={open} onClose={onClose} size="xl" title={current?.name ?? 'Photo'}>
      {current && (
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs */}
            <img src={current.url} alt={current.name} className="max-h-[70vh] max-w-full rounded-[var(--radius-md)] object-contain" />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  disabled={i === 0}
                  onClick={() => setI((v) => Math.max(v - 1, 0))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-text shadow-md disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  disabled={i === images.length - 1}
                  onClick={() => setI((v) => Math.min(v + 1, images.length - 1))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-text shadow-md disabled:opacity-30"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
          </div>
          <div className="flex w-full items-center justify-between text-xs text-text-dim">
            <span className="tabular-nums">
              {images.length > 1 ? `${i + 1} of ${images.length} · ` : ''}
              {formatBytes(current.size)}
            </span>
            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-text-muted hover:text-gold"
            >
              Open original <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}
    </Modal>
  )
}
