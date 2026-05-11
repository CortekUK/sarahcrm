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
import { Textarea } from '@/components/ui/Textarea'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Database } from '@/types/database'

type Experience = Database['public']['Tables']['curated_experiences']['Row']

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  image_url: z.string().optional(),
  link_url: z.string().optional(),
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof schema>

export function ExperiencesPage() {
  const [items, setItems] = useState<Experience[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Experience | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { title: '', description: '', image_url: '', link_url: '', display_order: 0, is_active: true },
  })

  useEffect(() => { fetchItems() }, [])

  useEffect(() => {
    if (modalOpen) {
      if (editingItem) {
        form.reset({
          title: editingItem.title,
          description: editingItem.description ?? '',
          image_url: editingItem.image_url ?? '',
          link_url: editingItem.link_url ?? '',
          display_order: editingItem.display_order,
          is_active: editingItem.is_active,
        })
      } else {
        form.reset({ title: '', description: '', image_url: '', link_url: '', display_order: items.length, is_active: true })
      }
      setError(null)
    }
  }, [modalOpen, editingItem, form, items.length])

  async function fetchItems() {
    const { data } = await supabase.from('curated_experiences').select('*').order('display_order', { ascending: true })
    if (data) setItems(data)
    setLoading(false)
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    setError(null)

    const payload = {
      title: data.title,
      description: data.description || null,
      image_url: data.image_url || null,
      link_url: data.link_url || null,
      display_order: data.display_order,
      is_active: data.is_active,
    }

    try {
      if (editingItem) {
        const { error: err } = await supabase.from('curated_experiences').update(payload).eq('id', editingItem.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('curated_experiences').insert(payload)
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
    if (!window.confirm('Delete this experience?')) return
    await supabase.from('curated_experiences').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading experiences...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">Curated Experiences</h1>
          <p className="text-sm text-text-muted mt-1">{items.length} experience{items.length !== 1 ? 's' : ''}</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => { setEditingItem(null); setModalOpen(true) }}>
          Add Experience
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center"><p className="text-sm text-text-dim">No experiences yet</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Thumbnail</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.title} className="w-20 h-[45px] object-cover rounded" />
                      ) : (
                        <div className="w-20 h-[45px] bg-surface-2 rounded flex items-center justify-center text-text-dim text-xs">No image</div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell className="text-text-muted max-w-[200px] truncate">{item.description || '—'}</TableCell>
                    <TableCell className="text-text-muted max-w-[150px] truncate">{item.link_url || '—'}</TableCell>
                    <TableCell>{item.display_order}</TableCell>
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

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingItem(null) }} title={editingItem ? 'Edit Experience' : 'Add Experience'} size="lg">
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Title" error={form.formState.errors.title?.message} {...form.register('title')} />
          <Textarea label="Description" rows={3} {...form.register('description')} />
          <Input label="Image URL" placeholder="https://" {...form.register('image_url')} />
          <Input label="Link URL" placeholder="https://" {...form.register('link_url')} />
          <Input label="Display Order" type="number" {...form.register('display_order')} />
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
              <Button type="submit" loading={saving}>{editingItem ? 'Save Changes' : 'Add Experience'}</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
