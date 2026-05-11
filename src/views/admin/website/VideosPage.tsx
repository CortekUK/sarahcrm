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
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Database } from '@/types/database'

type Video = Database['public']['Tables']['video_gallery']['Row']

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  youtube_url: z.string().url('Valid URL required'),
  page_slug: z.string().min(1, 'Page slug is required'),
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof schema>

export function VideosPage() {
  const [items, setItems] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Video | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { title: '', youtube_url: '', page_slug: 'home', display_order: 0, is_active: true },
  })

  useEffect(() => { fetchItems() }, [])

  useEffect(() => {
    if (modalOpen) {
      if (editingItem) {
        form.reset({
          title: editingItem.title,
          youtube_url: editingItem.youtube_url,
          page_slug: editingItem.page_slug,
          display_order: editingItem.display_order,
          is_active: editingItem.is_active,
        })
      } else {
        form.reset({ title: '', youtube_url: '', page_slug: 'home', display_order: items.length, is_active: true })
      }
      setError(null)
    }
  }, [modalOpen, editingItem, form, items.length])

  async function fetchItems() {
    const { data } = await supabase.from('video_gallery').select('*').order('display_order', { ascending: true })
    if (data) setItems(data)
    setLoading(false)
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    setError(null)

    const payload = {
      title: data.title,
      youtube_url: data.youtube_url,
      page_slug: data.page_slug,
      display_order: data.display_order,
      is_active: data.is_active,
    }

    try {
      if (editingItem) {
        const { error: err } = await supabase.from('video_gallery').update(payload).eq('id', editingItem.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('video_gallery').insert(payload)
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
    if (!window.confirm('Delete this video?')) return
    await supabase.from('video_gallery').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading videos...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">Video Gallery</h1>
          <p className="text-sm text-text-muted mt-1">{items.length} video{items.length !== 1 ? 's' : ''}</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => { setEditingItem(null); setModalOpen(true) }}>
          Add Video
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center"><p className="text-sm text-text-dim">No videos yet</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Title</TableHead>
                  <TableHead>YouTube URL</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell className="text-text-muted max-w-[250px] truncate">{item.youtube_url}</TableCell>
                    <TableCell className="text-text-muted">{item.page_slug}</TableCell>
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

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingItem(null) }} title={editingItem ? 'Edit Video' : 'Add Video'} size="lg">
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Title" error={form.formState.errors.title?.message} {...form.register('title')} />
          <Input label="YouTube URL" placeholder="https://youtube.com/watch?v=..." error={form.formState.errors.youtube_url?.message} {...form.register('youtube_url')} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Page Slug" error={form.formState.errors.page_slug?.message} {...form.register('page_slug')} />
            <Input label="Display Order" type="number" {...form.register('display_order')} />
          </div>
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
              <Button type="submit" loading={saving}>{editingItem ? 'Save Changes' : 'Add Video'}</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
