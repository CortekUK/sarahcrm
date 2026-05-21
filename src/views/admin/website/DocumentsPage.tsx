'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { FileUpload } from '@/components/ui/FileUpload'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { Plus, Pencil, Trash2, ExternalLink, FileText, Download } from 'lucide-react'
import { slugify, formatDate } from '@/lib/utils'
import type { Database } from '@/types/database'

type Document = Database['public']['Tables']['documents']['Row']

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required'),
  file_url: z.string().url('Valid URL required'),
  page_slug: z.string().optional(),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof schema>

// Show just the filename portion of a storage URL. Public urls look like:
// https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/')
    return parts[parts.length - 1] || url
  } catch {
    return url
  }
}

function extFromUrl(url: string): string {
  const name = filenameFromUrl(url)
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : 'FILE'
}

export function DocumentsPage() {
  const confirm = useConfirm()
  const [items, setItems] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Document | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: { title: '', slug: '', file_url: '', page_slug: '', is_active: true },
  })

  // Auto-generate slug from title
  const title = form.watch('title')
  useEffect(() => {
    if (!editingItem && title) {
      form.setValue('slug', slugify(title), { shouldValidate: true })
    }
  }, [title, editingItem, form])

  useEffect(() => {
    fetchItems()
  }, [])

  useEffect(() => {
    if (modalOpen) {
      if (editingItem) {
        form.reset({
          title: editingItem.title,
          slug: editingItem.slug,
          file_url: editingItem.file_url,
          page_slug: editingItem.page_slug ?? '',
          is_active: editingItem.is_active,
        })
      } else {
        form.reset({ title: '', slug: '', file_url: '', page_slug: '', is_active: true })
      }
      setError(null)
    }
  }, [modalOpen, editingItem, form])

  async function fetchItems() {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setItems(data)
    setLoading(false)
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    setError(null)
    const payload = {
      title: data.title,
      slug: data.slug,
      file_url: data.file_url,
      page_slug: data.page_slug || null,
      is_active: data.is_active,
    }
    try {
      if (editingItem) {
        const { error: err } = await supabase.from('documents').update(payload).eq('id', editingItem.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('documents').insert(payload)
        if (err) throw err
      }
      setModalOpen(false)
      setEditingItem(null)
      fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const item = items.find((i) => i.id === id)
    const ok = await confirm({
      title: 'Delete document?',
      description: item
        ? `"${item.title}" will no longer be downloadable from the public site. This cannot be undone.`
        : 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('documents').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function handleToggleActive(item: Document, next: boolean) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: next } : i)))
    const { error: err } = await supabase
      .from('documents')
      .update({ is_active: next })
      .eq('id', item.id)
    if (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !next } : i)))
      throw err
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading documents...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl">
      <AdminPageHeader
        title="Documents"
        description="Brochures, PDFs, and any file resources members can download. Each upload becomes a public URL you can link to from any page."
        meta={
          <span className="text-xs text-text-dim">
            {items.length} document{items.length !== 1 ? 's' : ''}
            {' · '}
            {items.filter((i) => i.is_active).length} active
          </span>
        }
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={() => {
              setEditingItem(null)
              setModalOpen(true)
            }}
          >
            Add document
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <AdminEmptyState
              icon={FileText}
              title="No documents yet"
              description="Upload brochures, PDFs, or any file resources to share publicly."
              action={
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setEditingItem(null)
                    setModalOpen(true)
                  }}
                >
                  Add first document
                </Button>
              }
            />
          ) : (
            <div>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-b-0 group hover:bg-surface-2/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-md bg-gold/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-text truncate">{item.title}</p>
                      <span className="text-[10px] font-mono uppercase text-text-dim bg-surface-2 px-1.5 py-0.5 rounded">
                        {extFromUrl(item.file_url)}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-dim truncate mt-0.5">
                      <span className="font-mono">/{item.slug}</span>
                      {item.page_slug && (
                        <>
                          {' · '}attached to {item.page_slug}
                        </>
                      )}
                      {' · '}added {formatDate(item.created_at)}
                    </p>
                  </div>
                  <a
                    href={item.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gold hover:text-gold-dark transition-colors px-2"
                    onClick={(e) => e.stopPropagation()}
                    title="Open file in new tab"
                  >
                    <Download size={13} />
                    Open
                    <ExternalLink size={10} />
                  </a>
                  <ActiveToggle
                    active={item.is_active}
                    onChange={(next) => handleToggleActive(item, next)}
                  />
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingItem(item)
                        setModalOpen(true)
                      }}
                      className="p-1.5 text-text-dim hover:text-text rounded hover:bg-surface-2 transition-colors"
                      title="Edit"
                    >
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-text-dim hover:text-accent-warm rounded hover:bg-surface-2 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingItem(null)
        }}
        title={editingItem ? 'Edit document' : 'Add document'}
        size="lg"
      >
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Title"
              error={form.formState.errors.title?.message}
              {...form.register('title')}
            />
            <Input
              label="Slug"
              error={form.formState.errors.slug?.message}
              {...form.register('slug')}
            />
          </div>
          <FileUpload
            label="File"
            value={form.watch('file_url')}
            onChange={(url) =>
              form.setValue('file_url', url ?? '', { shouldValidate: true, shouldDirty: true })
            }
            bucket="documents"
            error={form.formState.errors.file_url?.message}
            hint="Brochures, PDFs, or any file members can download."
          />
          <Input
            label="Page slug (optional)"
            placeholder="e.g. memberships, private-event-services"
            {...form.register('page_slug')}
            hint="Used by the public site to surface this document on a specific page."
          />
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-border text-gold accent-gold"
              {...form.register('is_active')}
            />
            <span className="text-sm text-text">Active</span>
          </label>
          <div className="flex justify-between pt-5 border-t border-border mt-5 -mx-6 px-6">
            <div>
              {editingItem && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    handleDelete(editingItem.id)
                    setModalOpen(false)
                    setEditingItem(null)
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setModalOpen(false)
                  setEditingItem(null)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editingItem ? 'Save changes' : 'Add document'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
