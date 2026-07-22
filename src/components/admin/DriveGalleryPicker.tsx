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

import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/lib/hooks/use-toast'
import { Loader2, ImageIcon, Film, Check, Folder, HardDrive, ChevronRight, Home } from 'lucide-react'

interface DriveMedia {
  id: string
  name: string
  kind: 'image' | 'video'
  mimeType: string
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
}: {
  open: boolean
  onClose: () => void
  onSelect: (url: string) => void
}) {
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [media, setMedia] = useState<DriveMedia[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)
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
      setMedia(json.media ?? [])
    } catch (e) {
      setError((e as Error).message)
      setFolders([])
      setMedia([])
    } finally {
      setLoading(false)
    }
  }, [])

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

  async function choose(file: DriveMedia) {
    setImportingId(file.id)
    try {
      const res = await fetch('/api/admin/google/drive/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: file.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')
      onSelect(json.url)
      toast({ title: 'Added from Drive', description: file.name })
      onClose()
    } catch (e) {
      toast({ title: 'Could not import', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setImportingId(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Google Drive media library" size="lg">
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
        <div className="text-sm text-text-dim py-10 text-center">This folder is empty.</div>
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
              {media.map((f) => (
                <button
                  key={f.id}
                  onClick={() => choose(f)}
                  disabled={importingId !== null}
                  className="group relative aspect-square rounded-[var(--radius-md)] border border-border overflow-hidden bg-surface hover:border-gold transition-colors"
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
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1">
                    <span className="flex items-center gap-1 text-[11px] text-white truncate">
                      {f.kind === 'image' ? <ImageIcon size={11} /> : <Film size={11} />}
                      {f.name}
                    </span>
                  </div>
                  {importingId === f.id && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                  <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gold text-black">
                      <Check size={13} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end pt-4">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
