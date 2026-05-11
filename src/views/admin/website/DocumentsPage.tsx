'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Plus, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { slugify } from '@/lib/utils'
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

export function DocumentsPage() {
  const [items, setItems] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Document | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
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

  useEffect(() => { fetchItems() }, [])

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
    const { data } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
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
    if (!window.confirm('Delete this document?')) return
    await supabase.from('documents').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
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
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">Documents</h1>
          <p className="text-sm text-text-muted mt-1">{items.length} document{items.length !== 1 ? 's' : ''}</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => { setEditingItem(null); setModalOpen(true) }}>
          Add Document
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center"><p className="text-sm text-text-dim">No documents yet</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Title</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell className="text-text-muted">{item.slug}</TableCell>
                    <TableCell>
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-gold hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={12} />
                        Open
                      </a>
                    </TableCell>
                    <TableCell className="text-text-muted">{item.page_slug || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? 'active' : 'draft'} dot>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingItem(item); setModalOpen(true) }} className="p-1.5 text-text-dim hover:text-text transition-colors">
                          <Pencil size={14} strokeWidth={1.5} />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 text-text-dim hover:text-accent-warm transition-colors">
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingItem(null) }} title={editingItem ? 'Edit Document' : 'Add Document'} size="lg">
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Title" error={form.formState.errors.title?.message} {...form.register('title')} />
            <Input label="Slug" error={form.formState.errors.slug?.message} {...form.register('slug')} />
          </div>
          <Input label="File URL" placeholder="https://" error={form.formState.errors.file_url?.message} {...form.register('file_url')} />
          <Input label="Page Slug" placeholder="Optional page association" {...form.register('page_slug')} />
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded border-border text-gold accent-gold" {...form.register('is_active')} />
            <span className="text-sm text-text">Active</span>
          </label>
          <div className="flex justify-between pt-2">
            <div>
              {editingItem && (
                <Button type="button" variant="danger" onClick={() => { handleDelete(editingItem.id); setModalOpen(false); setEditingItem(null) }}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={() => { setModalOpen(false); setEditingItem(null) }}>Cancel</Button>
              <Button type="submit" loading={saving}>{editingItem ? 'Save Changes' : 'Add Document'}</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
