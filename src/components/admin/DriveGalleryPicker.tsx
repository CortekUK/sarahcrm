'use client'

// Navigable Google Drive media picker. Opens at the Drive roots (shared drives
// + top-level folders), lets the admin drill into folders (with breadcrumbs),
// and on selecting an image/video copies it into the Supabase `gallery` bucket
// (via /api/admin/google/drive/import) and returns a stable PUBLIC url.
// Read-only on Drive.
//
// Usage:
//   const [open, setOpen] = useState(false)
//   <DriveGalleryPicker open={open} onClose={() => setOpen(false)}
//       onSelect={(url) => setImageUrl(url)} />
//
// Each tile shows the file size; files over MEDIA_IMPORT_MAX_BYTES are refused
// up-front. The import streams NDJSON progress back, shown as a real progress
// bar. Closing the picker (or Cancel) aborts the copy server-side.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/lib/hooks/use-toast'
import {
  Loader2,
  ImageIcon,
  Film,
  Check,
  Folder,
  HardDrive,
  ChevronRight,
  Home,
  AlertCircle,
} from 'lucide-react'
import {
  MEDIA_IMPORT_MAX_BYTES,
  MEDIA_TOO_LARGE_MESSAGE,
  formatBytes,
} from '@/lib/media/limits'

interface DriveMedia {
  id: string
  name: string
  kind: 'image' | 'video'
  mimeType: string
  sizeBytes?: number
}
interface ImportState {
  id: string
  name: string
  loaded: number
  total: number
}
interface DriveFolder {
  id: string
  name: string
  isSharedDrive?: boolean
}
interface Crumb {
  id: string | null // null = root
  name: string
}

export function DriveGalleryPicker({
  open,
  onClose,
  onSelect,
  accept,
}: {
  open: boolean
  onClose: () => void
  onSelect: (url: string) => void
  /** Only show this kind of file (e.g. 'image' where a video can't be used). */
  accept?: 'image' | 'video'
}) {
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [media, setMedia] = useState<DriveMedia[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState<ImportState | null>(null)
  const [refused, setRefused] = useState<string | null>(null) // file id refused as too large
  const abortRef = useRef<AbortController | null>(null)
  const importingId = importing?.id ?? null
  const [trail, setTrail] = useState<Crumb[]>([{ id: null, name: 'Drive' }])

  const current = trail[trail.length - 1]

  const browse = useCallback(async (folderId: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
      const res = await fetch(`/api/admin/google/drive/list${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to browse Drive')
      setFolders(json.folders ?? [])
      setMedia(((json.media ?? []) as DriveMedia[]).filter((f) => !accept || f.kind === accept))
    } catch (e) {
      setError((e as Error).message)
      setFolders([])
      setMedia([])
    } finally {
      setLoading(false)
    }
  }, [accept])

  // (Re)start at the root each time the picker opens.
  useEffect(() => {
    if (!open) return
    setTrail([{ id: null, name: 'Drive' }])
    browse(null)
  }, [open, browse])

  function openFolder(f: DriveFolder) {
    setTrail((t) => [...t, { id: f.id, name: f.name }])
    browse(f.id)
  }

  function goTo(index: number) {
    const target = trail[index]
    setTrail((t) => t.slice(0, index + 1))
    browse(target.id)
  }

  function isTooLarge(file: DriveMedia) {
    return file.sizeBytes != null && file.sizeBytes > MEDIA_IMPORT_MAX_BYTES
  }

  async function choose(file: DriveMedia) {
    if (importingId) return
    if (isTooLarge(file)) {
      setRefused(file.id)
      toast({ title: 'Too large to import', description: MEDIA_TOO_LARGE_MESSAGE, variant: 'destructive' })
      return
    }
    setRefused(null)
    const controller = new AbortController()
    abortRef.current = controller
    setImporting({ id: file.id, name: file.name, loaded: 0, total: file.sizeBytes ?? 0 })
    try {
      const res = await fetch('/api/admin/google/drive/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify({ file_id: file.id }),
        signal: controller.signal,
      })
      const isStream = (res.headers.get('content-type') ?? '').includes('application/x-ndjson')
      let url: string | null = null
      if (!res.ok || !isStream || !res.body) {
        // Early refusal (401/403/413…) or a plain JSON reply.
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 413) setRefused(file.id)
          throw new Error(json.error || 'Import failed')
        }
        url = json.url ?? null
      } else {
        url = await readImportStream(res.body, (loaded, total) =>
          setImporting((s) => (s && s.id === file.id ? { ...s, loaded, total: total || s.total } : s)),
        )
      }
      if (!url) throw new Error('Import failed')
      onSelect(url)
      toast({ title: 'Added from Drive', description: file.name })
      onClose()
    } catch (e) {
      if (controller.signal.aborted) {
        toast({ title: 'Import cancelled', description: file.name })
      } else {
        toast({ title: 'Could not import', description: (e as Error).message, variant: 'destructive' })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setImporting(null)
    }
  }

  function cancelImport() {
    abortRef.current?.abort()
  }

  // Closing while a copy is running cancels it (the server removes the partial file).
  function handleClose() {
    cancelImport()
    onClose()
  }

  // Abort an in-flight import if the picker unmounts.
  useEffect(() => () => abortRef.current?.abort(), [])

  const pct =
    importing && importing.total > 0
      ? Math.min(100, Math.round((importing.loaded / importing.total) * 100))
      : null

  return (
    <Modal open={open} onClose={handleClose} title="Google Drive media library" size="lg">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 flex-wrap text-sm mb-3">
        {trail.map((c, i) => (
          <span key={`${c.id ?? 'root'}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={13} className="text-text-dim" />}
            <button
              onClick={() => goTo(i)}
              className={
                i === trail.length - 1
                  ? 'text-text font-medium inline-flex items-center gap-1'
                  : 'text-text-muted hover:text-gold inline-flex items-center gap-1'
              }
            >
              {i === 0 && <Home size={13} />}
              {c.name}
            </button>
          </span>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="text-sm text-accent-warm py-6 text-center">{error}</div>
      ) : folders.length === 0 && media.length === 0 ? (
        <div className="text-sm text-text-dim py-10 text-center">
          {accept ? `No ${accept === 'image' ? 'images' : 'videos'} in this folder.` : 'This folder is empty.'}
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto p-1 space-y-4">
          {/* Folders */}
          {folders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => openFolder(f)}
                  className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface hover:border-gold px-3 py-2.5 text-left transition-colors"
                >
                  {f.isSharedDrive ? (
                    <HardDrive size={16} className="text-gold shrink-0" />
                  ) : (
                    <Folder size={16} className="text-gold shrink-0" />
                  )}
                  <span className="text-sm text-text truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Media */}
          {media.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {media.map((f) => {
                const tooLarge = isTooLarge(f)
                const showRefusal = tooLarge && refused === f.id
                return (
                <button
                  key={f.id}
                  onClick={() => choose(f)}
                  disabled={importingId !== null}
                  title={tooLarge ? MEDIA_TOO_LARGE_MESSAGE : f.name}
                  className={
                    'group relative aspect-square rounded-[var(--radius-md)] border overflow-hidden bg-surface transition-colors disabled:cursor-not-allowed ' +
                    (tooLarge ? 'border-accent-warm/50' : 'border-border hover:border-gold')
                  }
                >
                  {f.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/admin/google/drive/file/${f.id}`}
                      alt={f.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-dim">
                      <Film size={28} />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 flex items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[11px] text-white truncate min-w-0 flex-1">
                      {f.kind === 'image' ? (
                        <ImageIcon size={11} className="shrink-0" />
                      ) : (
                        <Film size={11} className="shrink-0" />
                      )}
                      <span className="truncate">{f.name}</span>
                    </span>
                    {f.sizeBytes != null && (
                      <span className="shrink-0 text-[10px] text-white/80 tabular-nums">
                        {formatBytes(f.sizeBytes)}
                      </span>
                    )}
                  </div>
                  {tooLarge && !showRefusal && (
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-accent-warm px-2 py-0.5 text-[10px] font-medium text-white">
                      <AlertCircle size={10} /> Too large
                    </span>
                  )}
                  {showRefusal && (
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-1.5 p-3 text-center">
                      <AlertCircle size={18} className="text-accent-warm" />
                      <span className="text-[11px] leading-snug text-white">{MEDIA_TOO_LARGE_MESSAGE}</span>
                    </div>
                  )}
                  {importingId === f.id && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 px-3">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                      {pct != null && (
                        <>
                          <span className="text-xs font-medium text-white tabular-nums">{pct}%</span>
                          <div className="w-full h-1.5 rounded-full bg-white/25 overflow-hidden">
                            <div
                              className="h-full bg-gold transition-[width] duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {!tooLarge && importingId === null && (
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gold text-black">
                        <Check size={13} />
                      </span>
                    </div>
                  )}
                </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {importing && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-text truncate min-w-0">
              Copying from Google Drive…{' '}
              {pct != null ? (
                <span className="tabular-nums text-text-muted">
                  {pct}% ({formatBytes(importing.loaded)} of {formatBytes(importing.total)})
                </span>
              ) : null}
            </span>
            <Button variant="ghost" size="sm" onClick={cancelImport}>
              Cancel
            </Button>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            {pct != null ? (
              <div
                className="h-full bg-gold transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            ) : (
              <div className="h-full w-1/3 bg-gold/70 animate-pulse" />
            )}
          </div>
          <p className="text-[11px] text-text-dim truncate">
            {importing.name} · Closing this window cancels the copy.
          </p>
        </div>
      )}

      <div className="flex justify-end pt-4">
        <Button variant="ghost" onClick={handleClose}>
          {importing ? 'Cancel & close' : 'Close'}
        </Button>
      </div>
    </Modal>
  )
}

// Reads the import route's NDJSON stream; resolves with the public URL.
async function readImportStream(
  body: ReadableStream<Uint8Array>,
  onProgress: (loaded: number, total: number) => void,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffered += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, nl).trim()
      buffered = buffered.slice(nl + 1)
      if (!line) continue
      const msg = JSON.parse(line) as {
        type: 'progress' | 'done' | 'error'
        loaded?: number
        total?: number
        url?: string
        error?: string
      }
      if (msg.type === 'progress') onProgress(msg.loaded ?? 0, msg.total ?? 0)
      else if (msg.type === 'done' && msg.url) return msg.url
      else if (msg.type === 'error') throw new Error(msg.error || 'Import failed')
    }
    if (done) break
  }
  throw new Error('Import ended unexpectedly')
}
