'use client'

import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import {
  Upload,
  X,
  Loader2,
  Link as LinkIcon,
  ImageIcon,
  Film,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StorageBucket } from './ImageUpload'

// Universal media picker for hero/CMS surfaces.
//
// Two states:
//   EMPTY — admin picks Image vs Video (segmented toggle), then chooses
//           Upload vs External URL (tabs). One media at a time.
//   SET   — preview only, plus Replace + Remove actions. The upload
//           UI is hidden so admin can't accidentally try to add a
//           second image; to put in a different one, they Remove first
//           (or click Replace which opens the file picker directly).
//
// A separate poster URL is exposed when mediaType === 'video' so video
// heroes have a fallback frame before they autoplay.

type MediaType = 'image' | 'video'
type Source = 'upload' | 'link'

interface MediaPickerProps {
  /** Current image/video URL. */
  value: string
  onChange: (url: string) => void
  /** What this media is — toggles validation + preview rendering. */
  mediaType: MediaType
  onMediaTypeChange: (type: MediaType) => void
  /** Optional poster URL for video. */
  posterUrl?: string
  onPosterUrlChange?: (url: string) => void
  /** Supabase Storage bucket for uploads. */
  bucket: StorageBucket
  folder?: string
  label?: string
  hint?: string
  maxMB?: number
  /** Hide the image/video toggle when a context only accepts one type. */
  lockedToType?: MediaType
}

export function MediaPicker({
  value,
  onChange,
  mediaType,
  onMediaTypeChange,
  posterUrl,
  onPosterUrlChange,
  bucket,
  folder = '',
  label,
  hint,
  maxMB = 50,
  lockedToType,
}: MediaPickerProps) {
  const [source, setSource] = useState<Source>('upload')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null)
      const limitBytes = maxMB * 1024 * 1024
      if (file.size > limitBytes) {
        setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB — max ${maxMB} MB).`)
        return
      }
      const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase()
      const safe = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .slice(0, 40)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const random = Math.random().toString(36).slice(2, 8)
      const path = `${folder ? folder.replace(/\/$/, '') + '/' : ''}${stamp}-${random}-${safe}.${ext}`

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
          setError(uploadErr.message)
          return
        }
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        onChange(data.publicUrl)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [bucket, folder, maxMB, onChange],
  )

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const accept = mediaType === 'image' ? 'image/*' : 'video/*'
  const effectiveType = lockedToType ?? mediaType
  const hasValue = !!value

  // Shared file-input element — rendered once at the root so both the
  // empty-state dropzone and the Replace button point at the same picker.
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={accept}
      onChange={onPick}
      className="hidden"
      disabled={uploading}
    />
  )

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide">
          {label}
        </label>
      )}

      {/* ─── SET state — preview + actions only, no upload UI ────── */}
      {hasValue ? (
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 overflow-hidden">
          <div className="relative aspect-[16/9] bg-graphite">
            {/* `key={value}` forces React to unmount the old media element
               and mount a fresh one whenever the URL changes. Without
               this, next/image (and to a lesser extent <video>) can keep
               showing the previous frame after Replace until the
               surrounding form re-renders for some other reason — which
               is why "Replace" felt like it required a Save to show. */}
            {effectiveType === 'image' ? (
              <Image
                key={value}
                src={value}
                alt="Preview"
                fill
                sizes="(max-width: 768px) 100vw, 600px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <video
                key={value}
                src={value}
                poster={posterUrl || undefined}
                controls
                preload="metadata"
                className="w-full h-full object-cover"
              />
            )}
            {/* Type badge — small chip telling admin which media type is set */}
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] rounded-full bg-ink/80 backdrop-blur text-ivory-soft border border-graphite-line">
              {effectiveType === 'image' ? (
                <ImageIcon size={10} strokeWidth={1.8} />
              ) : (
                <Film size={10} strokeWidth={1.8} />
              )}
              {effectiveType}
            </span>
          </div>

          {/* Source URL + actions row */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
            <span className="text-[11px] text-text-muted flex-1 truncate font-mono">
              {value}
            </span>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-dim hover:text-gold transition-colors p-1.5 -m-1.5"
              aria-label="Open in new tab"
              title="Open in new tab"
            >
              <ExternalLink size={12} />
            </a>
          </div>

          {/* Replace / Remove dual-button bar — the only way to change
             the media once one's set. Upload UI is hidden until Remove. */}
          <div className="flex border-t border-border">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium uppercase tracking-[0.18em] text-text hover:bg-surface transition-colors border-r border-border disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <RefreshCw size={12} strokeWidth={1.6} />
                  Replace
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={uploading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium uppercase tracking-[0.18em] text-accent-warm hover:bg-surface transition-colors disabled:opacity-50"
            >
              <X size={12} strokeWidth={2} />
              Remove
            </button>
          </div>
        </div>
      ) : (
        /* ─── EMPTY state — type + source pickers + dropzone ──────── */
        <>
          {/* Media-type segmented control — hidden when caller forces one type */}
          {!lockedToType && (
            <div className="inline-flex bg-surface-2 border border-border rounded-[var(--radius-md)] p-0.5">
              <TypeTab
                label="Image"
                icon={<ImageIcon size={13} strokeWidth={1.6} />}
                active={mediaType === 'image'}
                onClick={() => onMediaTypeChange('image')}
              />
              <TypeTab
                label="Video"
                icon={<Film size={13} strokeWidth={1.6} />}
                active={mediaType === 'video'}
                onClick={() => onMediaTypeChange('video')}
              />
            </div>
          )}

          {/* Source tabs — Upload vs Link */}
          <div className="flex border-b border-border">
            <SourceTab
              label="Upload"
              icon={<Upload size={12} strokeWidth={1.7} />}
              active={source === 'upload'}
              onClick={() => setSource('upload')}
            />
            <SourceTab
              label="External URL"
              icon={<LinkIcon size={12} strokeWidth={1.7} />}
              active={source === 'link'}
              onClick={() => setSource('link')}
            />
          </div>

          {/* Source panel */}
          {source === 'upload' ? (
            <div
              className={cn(
                'rounded-[var(--radius-md)] border-2 border-dashed transition-colors',
                error
                  ? 'border-accent-warm/40 bg-[rgba(196,105,74,0.04)]'
                  : 'border-border bg-surface-2',
              )}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full px-5 py-8 flex flex-col items-center justify-center gap-2 text-text-dim hover:text-text-muted transition-colors"
              >
                {uploading ? (
                  <>
                    <Loader2 size={24} className="animate-spin text-gold" />
                    <span className="text-sm font-medium text-text">Uploading…</span>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-surface-3 text-text-muted flex items-center justify-center mb-1">
                      {effectiveType === 'image' ? (
                        <ImageIcon size={20} strokeWidth={1.5} />
                      ) : (
                        <Film size={20} strokeWidth={1.5} />
                      )}
                    </div>
                    <span className="text-sm font-medium text-text">
                      Click to upload {effectiveType === 'image' ? 'an image' : 'a video'}
                    </span>
                    <span className="text-[11px] text-text-dim">
                      {effectiveType === 'image'
                        ? 'PNG, JPG, WebP — up to 8 MB'
                        : 'MP4 / WebM — up to 50 MB'}
                    </span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <LinkIcon
                  size={13}
                  strokeWidth={1.6}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
                />
                <input
                  type="url"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={
                    effectiveType === 'image'
                      ? 'https://example.com/photo.jpg'
                      : 'https://example.com/video.mp4'
                  }
                  className="w-full pl-9 pr-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-dim focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]"
                />
              </div>
              <p className="text-[11px] text-text-dim">
                Paste a direct media URL — Cloudinary, S3, Mux, or any CDN. The browser fetches it
                as-is.
              </p>
            </div>
          )}
        </>
      )}

      {/* Video poster — a still frame to show before the video autoplays.
         Only surfaced for video media because images don't need one.
         Always visible (whether or not the main video is set) so the
         admin can stage the poster before uploading the video. */}
      {effectiveType === 'video' && onPosterUrlChange && (
        <div className="pt-3 mt-2 border-t border-border/60 space-y-2">
          <label className="block text-[10px] font-medium text-text-muted uppercase tracking-[0.2em]">
            Video poster (optional)
          </label>
          <div className="relative">
            <LinkIcon
              size={13}
              strokeWidth={1.6}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
            />
            <input
              type="url"
              value={posterUrl ?? ''}
              onChange={(e) => onPosterUrlChange(e.target.value)}
              placeholder="https://example.com/poster.jpg"
              className="w-full pl-9 pr-3.5 py-2 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]"
            />
          </div>
          <p className="text-[11px] text-text-dim">
            Shown while the video buffers / on mobile if autoplay is blocked. A frame grabbed from
            the video itself works best.
          </p>
        </div>
      )}

      {hint && !error && <p className="text-[11px] text-text-dim">{hint}</p>}
      {error && (
        <p className="text-[11px] text-accent-warm flex items-center gap-1">
          <AlertCircle size={11} />
          {error}
        </p>
      )}

      {fileInput}
    </div>
  )
}

function TypeTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] rounded-[var(--radius-sm)] transition-colors',
        active
          ? 'bg-surface text-gold shadow-[var(--shadow-sm)]'
          : 'text-text-muted hover:text-text',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function SourceTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-colors',
        active ? 'text-gold' : 'text-text-muted hover:text-text',
      )}
    >
      {icon}
      {label}
      {active && (
        <span className="absolute bottom-[-1px] left-2 right-2 h-0.5 bg-gold rounded-full" />
      )}
    </button>
  )
}
