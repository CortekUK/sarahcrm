'use client'

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import { Upload, X, Loader2, AlertCircle, ImagePlus, ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StorageBucket } from './ImageUpload'

interface MultiImageUploadProps {
  /** Ordered list of image URLs already uploaded. */
  value: string[]
  onChange: (urls: string[]) => void
  bucket: StorageBucket
  folder?: string
  label?: string
  hint?: string
  /** Max file size in MB per image (default 8). */
  maxMB?: number
  /** Hard cap on total images (default 24). */
  maxCount?: number
  disabled?: boolean
  accept?: string
  className?: string
}

// Multi-image counterpart to ImageUpload. The `value` is an ordered
// string[] of public URLs; admin can:
//   • drop / pick several files at once (uploaded in parallel, appended)
//   • remove any tile (X corner)
//   • shuffle the order with the ◀ / ▶ arrows on hover
// Storage layout matches ImageUpload (timestamp-prefixed paths inside
// `<folder>/`). Used for `events.gallery_urls`, future gallery_photos
// drag-and-drop bulk import, etc.
export function MultiImageUpload({
  value,
  onChange,
  bucket,
  folder = '',
  label,
  hint,
  maxMB = 8,
  maxCount = 24,
  disabled,
  accept = 'image/*',
  className,
}: MultiImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      const limitBytes = maxMB * 1024 * 1024
      if (file.size > limitBytes) {
        throw new Error(
          `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — max ${maxMB} MB per image.`,
        )
      }
      const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase()
      const safeName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .slice(0, 40)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const random = Math.random().toString(36).slice(2, 8)
      const path = `${folder ? folder.replace(/\/$/, '') + '/' : ''}${stamp}-${random}-${safeName}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      return data.publicUrl
    },
    [bucket, folder, maxMB],
  )

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null)
      const arr = Array.from(files)
      const room = Math.max(0, maxCount - value.length)
      if (room === 0) {
        setError(`Maximum ${maxCount} images reached — remove one first.`)
        return
      }
      const slice = arr.slice(0, room)
      if (arr.length > room) {
        setError(
          `Only ${room} more image${room === 1 ? '' : 's'} can be added — the rest were skipped.`,
        )
      }
      setUploading(true)
      try {
        const uploaded = await Promise.all(slice.map((f) => uploadFile(f)))
        const urls = uploaded.filter((u): u is string => Boolean(u))
        onChange([...value, ...urls])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [maxCount, onChange, uploadFile, value],
  )

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length) handleFiles(files)
      if (inputRef.current) inputRef.current.value = ''
    },
    [handleFiles],
  )

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      if (disabled) return
      const files = e.dataTransfer.files
      if (files && files.length) handleFiles(files)
    },
    [disabled, handleFiles],
  )

  const onDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      if (!disabled) setDragOver(true)
    },
    [disabled],
  )

  const onDragLeave = useCallback(() => setDragOver(false), [])

  function removeAt(idx: number) {
    const next = value.filter((_, i) => i !== idx)
    onChange(next)
  }

  function moveAt(idx: number, delta: -1 | 1) {
    const target = idx + delta
    if (target < 0 || target >= value.length) return
    const next = [...value]
    const [removed] = next.splice(idx, 1)
    next.splice(target, 0, removed)
    onChange(next)
  }

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
          {label}
        </label>
      )}

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          'rounded-[var(--radius-md)] border-2 border-dashed p-3 transition-colors',
          dragOver
            ? 'border-gold bg-gold/5'
            : 'border-border bg-surface-2',
          disabled && 'opacity-60 pointer-events-none',
        )}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {value.map((url, i) => (
            <div
              key={url + i}
              className="group relative aspect-[4/3] overflow-hidden rounded bg-surface border border-border"
            >
              <Image
                src={url}
                alt=""
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover"
                unoptimized
              />
              {/* Index badge — admin can match a tile to its order */}
              <span className="absolute top-1.5 left-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-ink/75 backdrop-blur text-[10px] font-medium text-bronze-light tabular-nums">
                {i + 1}
              </span>
              {/* Hover overlay — remove + reorder */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/55 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => moveAt(i, -1)}
                  disabled={i === 0}
                  className="w-7 h-7 rounded-full bg-surface/95 text-text hover:bg-surface flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Move left"
                >
                  <ArrowLeft size={13} strokeWidth={1.6} />
                </button>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="w-7 h-7 rounded-full bg-accent-warm text-white hover:opacity-90 flex items-center justify-center transition-opacity"
                  aria-label="Remove image"
                >
                  <X size={13} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => moveAt(i, 1)}
                  disabled={i === value.length - 1}
                  className="w-7 h-7 rounded-full bg-surface/95 text-text hover:bg-surface flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Move right"
                >
                  <ArrowRight size={13} strokeWidth={1.6} />
                </button>
              </div>
            </div>
          ))}

          {/* Add tile — same aspect as thumbnails so the grid stays even */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading || value.length >= maxCount}
            className={cn(
              'aspect-[4/3] rounded border border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors',
              uploading || value.length >= maxCount
                ? 'border-border bg-surface text-text-dim cursor-not-allowed'
                : 'border-border bg-surface text-text-muted hover:border-gold/50 hover:text-gold',
            )}
          >
            {uploading ? (
              <>
                <Loader2 size={18} className="animate-spin text-gold" />
                <span className="text-[11px] font-medium text-text-muted">Uploading…</span>
              </>
            ) : value.length >= maxCount ? (
              <span className="text-[11px] text-text-dim px-3 text-center leading-tight">
                {maxCount}-image limit
              </span>
            ) : (
              <>
                <ImagePlus size={20} strokeWidth={1.4} />
                <span className="text-[11px] font-medium">
                  {value.length === 0 ? 'Add photos' : 'Add more'}
                </span>
              </>
            )}
          </button>
        </div>

        {value.length === 0 && !uploading && (
          <p className="mt-3 text-[11px] text-text-dim text-center flex items-center justify-center gap-1.5">
            <Upload size={11} />
            Drop multiple images here or click the tile above to browse
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={onPick}
          className="hidden"
          disabled={disabled || uploading}
        />
      </div>

      {hint && !error && (
        <p className="text-[11px] text-text-dim mt-1.5">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-accent-warm mt-1.5 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  )
}
