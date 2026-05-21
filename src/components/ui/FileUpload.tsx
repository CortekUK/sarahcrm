'use client'

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Upload, X, Loader2, AlertCircle, FileText, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StorageBucket } from './ImageUpload'

interface FileUploadProps {
  value: string | null | undefined
  onChange: (url: string | null) => void
  bucket: StorageBucket
  folder?: string
  label?: string
  hint?: string
  maxMB?: number
  error?: string
  disabled?: boolean
  accept?: string
  className?: string
}

// Strip the public URL down to just the filename for display. Storage URLs
// look like https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>.
function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/')
    return parts[parts.length - 1] || url
  } catch {
    return url
  }
}

export function FileUpload({
  value,
  onChange,
  bucket,
  folder = '',
  label,
  hint,
  maxMB = 25,
  error,
  disabled,
  accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip',
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [internalError, setInternalError] = useState<string | null>(null)
  const [lastFilename, setLastFilename] = useState<string | null>(null)

  const handleUpload = useCallback(
    async (file: File) => {
      setInternalError(null)
      const limitBytes = maxMB * 1024 * 1024
      if (file.size > limitBytes) {
        setInternalError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB — max ${maxMB} MB).`)
        return
      }

      const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase()
      const safeName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .slice(0, 60)
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
        setLastFilename(file.name)
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
  const hasFile = !!value
  const displayName = lastFilename ?? (value ? filenameFromUrl(value) : '')

  return (
    <div className={cn('w-full max-w-md', className)}>
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
          'group relative rounded-[var(--radius-md)] border-2 border-dashed transition-all p-4',
          dragOver
            ? 'border-gold bg-gold/5'
            : displayedError
              ? 'border-accent-warm/40 bg-[rgba(196,105,74,0.04)]'
              : hasFile
                ? 'border-border bg-surface-2'
                : 'border-border bg-surface-2 hover:border-gold/40',
          disabled && 'opacity-60 pointer-events-none',
        )}
      >
        {hasFile ? (
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-md bg-gold/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text truncate">{displayName}</p>
              <a
                href={value!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-text-dim hover:text-gold flex items-center gap-1 mt-0.5"
              >
                Open file
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 text-xs font-medium rounded bg-surface border border-border hover:border-gold/40 transition-colors flex items-center gap-1.5"
            >
              <Upload className="w-3 h-3" />
              Replace
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setLastFilename(null)
              }}
              disabled={uploading}
              className="p-1.5 text-text-dim hover:text-accent-warm transition-colors"
              title="Remove"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="w-full flex flex-col items-center justify-center gap-2 py-6 text-text-dim hover:text-text-muted transition-colors text-center"
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
                  <FileText className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <span className="text-sm font-medium text-text">
                  {dragOver ? 'Drop to upload' : 'Drop a file or click to browse'}
                </span>
                <span className="text-[11px] text-text-dim">
                  PDF, DOCX, XLSX — up to {maxMB} MB
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
