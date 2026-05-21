'use client'

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import { Upload, X, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Buckets created in Supabase Storage. Each public folder is dedicated to
// one website-content domain so admins can find their assets in the
// Supabase dashboard without sifting through a single bucket of mixed files.
export type StorageBucket = 'heroes' | 'gallery' | 'logos' | 'content' | 'documents'

interface ImageUploadProps {
  /** Current image URL — preview is shown when present. */
  value: string | null | undefined
  onChange: (url: string | null) => void
  /** Which Supabase Storage bucket to upload to. */
  bucket: StorageBucket
  /** Optional path prefix inside the bucket (e.g. `partners/`). */
  folder?: string
  /** Aspect ratio for the preview frame (CSS `aspect-ratio` value). */
  aspect?: string
  /** Display label. */
  label?: string
  /** Helper text below the input. */
  hint?: string
  /** Hard max file size in MB (default 8). Larger files are rejected. */
  maxMB?: number
  /** Validation error from outer form (form library messages, etc.). */
  error?: string
  /** Disable interaction. */
  disabled?: boolean
  /** Restrict accepted mime types. Defaults to images. */
  accept?: string
  className?: string
}

export function ImageUpload({
  value,
  onChange,
  bucket,
  folder = '',
  aspect = '16 / 10',
  label,
  hint,
  maxMB = 8,
  error,
  disabled,
  accept = 'image/*',
  className,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [internalError, setInternalError] = useState<string | null>(null)

  const handleUpload = useCallback(
    async (file: File) => {
      setInternalError(null)
      const limitBytes = maxMB * 1024 * 1024
      if (file.size > limitBytes) {
        setInternalError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB — max ${maxMB} MB).`)
        return
      }

      // Build a sortable, collision-resistant path. The timestamp prefix
      // sorts most-recent uploads to the top in the Supabase UI; the random
      // suffix prevents accidental overwrites when the same filename is
      // re-uploaded back-to-back.
      const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase()
      const safeName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .slice(0, 40)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const random = Math.random().toString(36).slice(2, 8)
      const path = `${folder ? folder.replace(/\/$/, '') + '/' : ''}${stamp}-${random}-${safeName}.${ext}`

      setUploading(true)
      try {
        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || undefined,
          })
        if (uploadErr) {
          setInternalError(uploadErr.message || 'Upload failed')
          return
        }
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        onChange(data.publicUrl)
      } catch (err) {
        setInternalError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [bucket, folder, maxMB, onChange],
  )

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleUpload(file)
      if (inputRef.current) inputRef.current.value = ''
    },
    [handleUpload],
  )

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      if (disabled) return
      const file = e.dataTransfer.files?.[0]
      if (file) handleUpload(file)
    },
    [handleUpload, disabled],
  )

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!disabled) setDragOver(true)
  }, [disabled])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  const displayedError = error ?? internalError
  const hasImage = !!value

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
          'group relative overflow-hidden rounded-[var(--radius-md)] border-2 border-dashed transition-all',
          dragOver
            ? 'border-gold bg-gold/5'
            : displayedError
              ? 'border-accent-warm/40 bg-[rgba(196,105,74,0.04)]'
              : hasImage
                ? 'border-border bg-surface-2'
                : 'border-border bg-surface-2 hover:border-gold/40',
          disabled && 'opacity-60 pointer-events-none',
        )}
        style={{ aspectRatio: aspect }}
      >
        {hasImage ? (
          <>
            <Image
              src={value!}
              alt="Upload preview"
              fill
              sizes="(max-width: 768px) 100vw, 400px"
              className="object-cover"
              unoptimized
            />
            {/* Hover overlay with replace + remove actions */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 text-xs font-medium rounded bg-white text-text hover:bg-white/90 transition-colors flex items-center gap-1.5"
              >
                <Upload className="w-3 h-3" />
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={uploading}
                className="px-3 py-1.5 text-xs font-medium rounded bg-accent-warm/90 text-white hover:bg-accent-warm transition-colors flex items-center gap-1.5"
              >
                <X className="w-3 h-3" />
                Remove
              </button>
            </div>
            {uploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Uploading…
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-dim hover:text-text-muted transition-colors p-4 text-center"
          >
            {uploading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-gold" />
                <span className="text-sm font-medium text-text">Uploading…</span>
              </>
            ) : (
              <>
                <div
                  className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center mb-1 transition-colors',
                    dragOver ? 'bg-gold/15 text-gold' : 'bg-surface-3 text-text-muted',
                  )}
                >
                  <ImageIcon className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <span className="text-sm font-medium text-text">
                  {dragOver ? 'Drop to upload' : 'Drop an image or click to browse'}
                </span>
                <span className="text-[11px] text-text-dim">
                  PNG, JPG, WebP — up to {maxMB} MB
                </span>
              </>
            )}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onPick}
          className="hidden"
          disabled={disabled || uploading}
        />
      </div>

      {hint && !displayedError && (
        <p className="text-[11px] text-text-dim mt-1.5">{hint}</p>
      )}
      {displayedError && (
        <p className="text-[11px] text-accent-warm mt-1.5 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {displayedError}
        </p>
      )}
    </div>
  )
}
