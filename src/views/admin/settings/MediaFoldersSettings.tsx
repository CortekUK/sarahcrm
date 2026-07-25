'use client'

import { useEffect, useState } from 'react'
import { toast } from '@/lib/hooks/use-toast'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Folder, ChevronLeft, Plus, X } from 'lucide-react'

interface AllowedFolder {
  id: string
  name: string
}
interface AdminOption {
  id: string
  name: string
  email: string | null
}
interface FoldersState {
  ownerProfileId: string | null
  isOwner: boolean
  allowedFolders: AllowedFolder[]
  admins: AdminOption[]
}

interface DriveFolder {
  id: string
  name: string
}
interface Crumb {
  id: string | null
  name: string
}

const UNSET = 'unset'

export function MediaFoldersSettings() {
  const [state, setState] = useState<FoldersState | null>(null)
  const [loading, setLoading] = useState(true)

  // Owner assignment
  const [pick, setPick] = useState<string>(UNSET)
  const [settingOwner, setSettingOwner] = useState(false)

  // Folder browser + editable allow-list (owner only)
  const [allowed, setAllowed] = useState<AllowedFolder[]>([])
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: 'All media' }])
  const [browseFolders, setBrowseFolders] = useState<DriveFolder[]>([])
  const [browsing, setBrowsing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function loadConfig() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/google/drive/folders')
      const json = (await res.json()) as { ok?: boolean } & Partial<FoldersState>
      if (json.ok) {
        const next: FoldersState = {
          ownerProfileId: json.ownerProfileId ?? null,
          isOwner: json.isOwner ?? false,
          allowedFolders: json.allowedFolders ?? [],
          admins: json.admins ?? [],
        }
        setState(next)
        setAllowed(next.allowedFolders)
      }
    } catch {
      /* leave null → panel shows nothing actionable */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConfig()
  }, [])

  // Browse the Drive (owner sees everything) for the folder at the current crumb.
  async function browseTo(folderId: string | null) {
    setBrowsing(true)
    try {
      const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
      const res = await fetch(`/api/admin/google/drive/list${qs}`)
      const json = (await res.json()) as { ok?: boolean; folders?: DriveFolder[]; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to browse Drive')
      setBrowseFolders(json.folders ?? [])
    } catch (err) {
      toast({
        title: 'Could not browse Drive',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
      setBrowseFolders([])
    } finally {
      setBrowsing(false)
    }
  }

  // Kick off browsing once we know the caller is the owner.
  useEffect(() => {
    if (state?.isOwner) void browseTo(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.isOwner])

  function openFolder(f: DriveFolder) {
    setCrumbs((prev) => [...prev, { id: f.id, name: f.name }])
    void browseTo(f.id)
  }
  function goToCrumb(index: number) {
    const target = crumbs[index]
    setCrumbs((prev) => prev.slice(0, index + 1))
    void browseTo(target.id)
  }

  function addFolder(f: DriveFolder) {
    setAllowed((prev) => (prev.some((a) => a.id === f.id) ? prev : [...prev, { id: f.id, name: f.name }]))
  }
  function removeFolder(id: string) {
    setAllowed((prev) => prev.filter((a) => a.id !== id))
  }

  async function handleSetOwner() {
    if (pick === UNSET) return
    setSettingOwner(true)
    try {
      const res = await fetch('/api/admin/google/drive/folders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerProfileId: pick }),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to set owner')
      toast({ title: 'Media owner set' })
      await loadConfig()
    } catch (err) {
      toast({
        title: 'Could not set media owner',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSettingOwner(false)
    }
  }

  async function handleSaveFolders() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/google/drive/folders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedFolders: allowed }),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error || 'Save failed')
      toast({ title: 'Approved folders saved' })
      await loadConfig()
    } catch (err) {
      toast({
        title: 'Could not save folders',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const ownerName =
    state?.admins.find((a) => a.id === state.ownerProfileId)?.name ?? 'another admin'

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Media Folders</CardTitle>
        <p className="text-sm text-text-muted mt-1">
          The media owner sees and manages every Drive folder. Other admins are restricted to the
          folders the owner approves here. Until any folder is approved, everyone can browse all
          media (today&apos;s behaviour) so nobody is locked out.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : !state ? (
          <p className="text-sm text-text-dim">Media access settings are unavailable.</p>
        ) : !state.ownerProfileId ? (
          // No owner yet → assignment picker.
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="w-full sm:w-72">
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-2">
                Media owner
              </p>
              <SelectMenu
                ariaLabel="Media owner"
                value={pick}
                onValueChange={setPick}
                options={[
                  { value: UNSET, label: 'Select an admin…' },
                  ...state.admins.map((a) => ({ value: a.id, label: a.name })),
                ]}
              />
            </div>
            <Button onClick={handleSetOwner} loading={settingOwner} disabled={pick === UNSET}>
              Set media owner
            </Button>
          </div>
        ) : !state.isOwner ? (
          // Owner set, caller is not the owner → read-only note.
          <p className="text-sm text-text">
            Media folders are managed by <span className="font-medium">{ownerName}</span>. You can
            browse the approved folders in the media picker.
          </p>
        ) : (
          // Owner view → folder browser + editable allow-list.
          <div className="space-y-6">
            {/* Current allow-list as removable chips */}
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-2">
                Approved folders {allowed.length === 0 && '(none — everyone browses all)'}
              </p>
              {allowed.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {allowed.map((f) => (
                    <span
                      key={f.id}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs bg-surface-2 text-text border border-border"
                    >
                      <Folder size={12} className="text-text-dim" />
                      {f.name}
                      <button
                        type="button"
                        onClick={() => removeFolder(f.id)}
                        aria-label={`Remove ${f.name}`}
                        className="rounded-full p-0.5 text-text-dim hover:text-text hover:bg-surface-3"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Folder browser */}
            <div className="border border-border rounded-[var(--radius-md)] bg-surface overflow-hidden">
              {/* Breadcrumbs */}
              <div className="flex items-center gap-1 flex-wrap px-3 py-2 border-b border-border text-xs text-text-muted">
                {crumbs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => goToCrumb(crumbs.length - 2)}
                    className="inline-flex items-center gap-0.5 mr-1 text-text-dim hover:text-text"
                    aria-label="Back"
                  >
                    <ChevronLeft size={14} />
                  </button>
                )}
                {crumbs.map((c, i) => (
                  <span key={`${c.id ?? 'root'}-${i}`} className="inline-flex items-center gap-1">
                    {i > 0 && <span className="text-text-dim">/</span>}
                    <button
                      type="button"
                      onClick={() => goToCrumb(i)}
                      className={i === crumbs.length - 1 ? 'text-text' : 'hover:text-text'}
                    >
                      {c.name}
                    </button>
                  </span>
                ))}
              </div>

              {/* Folder list */}
              <div className="max-h-72 overflow-y-auto divide-y divide-border">
                {browsing ? (
                  <p className="px-3 py-4 text-sm text-text-dim">Loading folders…</p>
                ) : browseFolders.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-text-dim">No subfolders here.</p>
                ) : (
                  browseFolders.map((f) => {
                    const added = allowed.some((a) => a.id === f.id)
                    return (
                      <div key={f.id} className="flex items-center gap-3 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openFolder(f)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left text-sm text-text hover:text-accent"
                        >
                          <Folder size={16} className="text-text-dim shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </button>
                        <Button
                          size="sm"
                          variant={added ? 'secondary' : 'primary'}
                          icon={added ? <X size={14} /> : <Plus size={14} />}
                          onClick={() => (added ? removeFolder(f.id) : addFolder(f))}
                        >
                          {added ? 'Remove' : 'Approve'}
                        </Button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveFolders} loading={saving}>
                Save approved folders
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
