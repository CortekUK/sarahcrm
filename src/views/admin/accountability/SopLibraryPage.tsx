'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Modal } from '@/components/ui/Modal'
import { StatCard } from '@/components/ui/StatCard'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { RichTextEditor, RichTextRenderer } from '@/components/sops/RichText'
import { toast } from '@/lib/hooks/use-toast'
import { formatDateTime } from '@/lib/utils'
import { Loader2, BookOpen, Plus, Pencil, Trash2, Eye, Search } from 'lucide-react'
import {
  STATUS_META,
  groupByCategory,
  sanitizeSopHtml,
  toPlainText,
  type SopRow,
  type SopStatus,
} from '@/lib/sops'

interface FormState {
  id: string | null
  title: string
  category: string
  body: string
  status: SopStatus
}

const EMPTY_FORM: FormState = {
  id: null,
  title: '',
  category: 'General',
  body: '',
  status: 'draft',
}

// Admin SOP Library — admins author Standard Operating Procedures as rich text
// ("knowledge that doesn't walk out the door"). Each SOP has a title, a
// free-text category (with suggestions), and a rich-text body, plus a
// draft/published status. Admins create/edit, publish/unpublish, and delete.
// Staff read only published SOPs at /team (see StaffSopPanel).
export function SopLibraryPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [sops, setSops] = useState<SopRow[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [newCategoryMode, setNewCategoryMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<SopRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SopRow | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('sops')
      .select('*')
      .order('updated_at', { ascending: false })
    setSops((data as SopRow[]) ?? [])
    setLoading(false)
  }

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const s of sops) set.add(s.category?.trim() || 'General')
    return [...set].sort()
  }, [sops])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sops.filter((s) => {
      if (categoryFilter !== 'all' && (s.category?.trim() || 'General') !== categoryFilter)
        return false
      if (!q) return true
      return (
        s.title.toLowerCase().includes(q) ||
        (s.category ?? '').toLowerCase().includes(q) ||
        toPlainText(s.body).toLowerCase().includes(q)
      )
    })
  }, [sops, search, categoryFilter])

  const grouped = useMemo(() => groupByCategory(filtered), [filtered])

  const publishedCount = sops.filter((s) => s.status === 'published').length
  const draftCount = sops.filter((s) => s.status === 'draft').length

  function openCreate() {
    // If categories exist, start with the dropdown (nothing preselected);
    // otherwise there's nothing to pick, so go straight to new-category entry.
    setForm({ ...EMPTY_FORM, category: '' })
    setNewCategoryMode(categories.length === 0)
    setModalOpen(true)
  }

  function openEdit(s: SopRow) {
    const cat = s.category?.trim() || 'General'
    setForm({
      id: s.id,
      title: s.title,
      category: cat,
      body: s.body ?? '',
      status: (s.status as SopStatus) ?? 'draft',
    })
    // If the saved category isn't in the known list, treat it as a custom entry.
    setNewCategoryMode(!categories.includes(cat))
    setModalOpen(true)
  }

  async function save(nextStatus?: SopStatus) {
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' })
      return
    }
    setSaving(true)
    const status = nextStatus ?? form.status
    // Sanitize the body before storing (defence in depth — it is sanitized
    // again on every render).
    const payload = {
      title: form.title.trim(),
      category: form.category.trim() || 'General',
      body: sanitizeSopHtml(form.body),
      status,
      updated_by: profile?.id ?? null,
    }
    try {
      if (form.id) {
        const { error } = await supabase.from('sops').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('sops')
          .insert({ ...payload, created_by: profile?.id ?? null })
        if (error) throw error
      }
      toast({
        title: form.id ? 'SOP updated' : 'SOP created',
        description: status === 'published' ? 'Published — staff can now read it.' : 'Saved as draft.',
      })
      setModalOpen(false)
      await load()
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function togglePublish(s: SopRow) {
    const next = s.status === 'published' ? 'draft' : 'published'
    const { error } = await supabase
      .from('sops')
      .update({ status: next, updated_by: profile?.id ?? null })
      .eq('id', s.id)
    if (error) {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: next === 'published' ? 'SOP published' : 'SOP unpublished' })
    await load()
  }

  async function doDelete() {
    if (!confirmDelete) return
    const { error } = await supabase.from('sops').delete().eq('id', confirmDelete.id)
    setConfirmDelete(null)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'SOP deleted' })
    await load()
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading SOP library…
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="SOP Library"
        description="Standard Operating Procedures — knowledge that doesn't walk out the door. Author rich-text SOPs by category; staff read the published ones from their workspace."
        actions={<Button icon={<Plus size={15} />} onClick={openCreate}>Add SOP</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Total SOPs" value={sops.length} />
        <StatCard label="Published" value={publishedCount} />
        <StatCard label="Drafts" value={draftCount} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="min-w-[220px] flex-1">
          <Input
            placeholder="Search SOPs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            suffix={<Search size={15} className="text-text-dim" />}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
            All
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}>
              {c}
            </FilterChip>
          ))}
        </div>
      </div>

      {sops.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <AdminEmptyState
              icon={BookOpen}
              title="No SOPs yet"
              description="Create your first Standard Operating Procedure. Save it as a draft while you refine it, then publish so staff can read it."
            />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-sm text-text-muted">No SOPs match your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <div key={category}>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-2">
                {category} · {items.length}
              </p>
              <Card>
                <CardContent className="p-0 divide-y divide-border">
                  {items.map((s) => {
                    const meta = STATUS_META[(s.status as SopStatus) ?? 'draft']
                    return (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-text truncate">{s.title}</p>
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                          </div>
                          <p className="text-xs text-text-dim mt-1">
                            Updated {formatDateTime(s.updated_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Eye size={14} />}
                            onClick={() => setPreview(s)}
                          >
                            Preview
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Pencil size={14} />}
                            onClick={() => openEdit(s)}
                          >
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => togglePublish(s)}>
                            {s.status === 'published' ? 'Unpublish' : 'Publish'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 size={14} />}
                            onClick={() => setConfirmDelete(s)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'Edit SOP' : 'Add SOP'}
        size="xl"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g. New Member Onboarding"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <div className="space-y-2">
            <SelectMenu
              label="Category"
              placeholder="Select a category"
              value={newCategoryMode ? '__new__' : form.category}
              onValueChange={(v) => {
                if (v === '__new__') {
                  setNewCategoryMode(true)
                  setForm((f) => ({ ...f, category: '' }))
                } else {
                  setNewCategoryMode(false)
                  setForm((f) => ({ ...f, category: v }))
                }
              }}
              options={[
                ...categories.map((c) => ({ value: c, label: c })),
                { value: '__new__', label: '＋ New category' },
              ]}
            />
            {newCategoryMode && (
              <Input
                placeholder="New category name"
                value={form.category}
                autoFocus
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            )}
          </div>
          <div>
            <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
              Body
            </label>
            <RichTextEditor
              value={form.body}
              onChange={(html) => setForm((f) => ({ ...f, body: html }))}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Badge variant={STATUS_META[form.status].variant}>
              {form.status === 'published' ? 'Currently published' : 'Currently a draft'}
            </Badge>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                loading={saving}
                onClick={() => save('draft')}
              >
                Save draft
              </Button>
              <Button loading={saving} onClick={() => save('published')}>
                {form.status === 'published' ? 'Save & keep published' : 'Publish'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Preview modal */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.title ?? 'SOP'}
        size="lg"
      >
        {preview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="info">{preview.category?.trim() || 'General'}</Badge>
              <Badge variant={STATUS_META[(preview.status as SopStatus) ?? 'draft'].variant}>
                {STATUS_META[(preview.status as SopStatus) ?? 'draft'].label}
              </Badge>
            </div>
            <RichTextRenderer html={preview.body} />
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete SOP"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Delete <span className="font-medium text-text">{confirmDelete?.title}</span>? This
            cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 size={14} />} onClick={doDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-full px-3 py-1 text-xs font-medium bg-gold text-white'
          : 'rounded-full px-3 py-1 text-xs font-medium bg-surface-2 text-text-muted hover:text-text transition-colors'
      }
    >
      {children}
    </button>
  )
}
