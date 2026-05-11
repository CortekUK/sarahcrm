'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
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

type HeroSlide = Database['public']['Tables']['hero_slides']['Row']

const schema = z.object({
  image_url: z.string().url('Valid URL required'),
  alt_text: z.string().min(1, 'Alt text is required'),
  overlay_text: z.string().optional(),
  page_slug: z.string().min(1, 'Page slug is required'),
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof schema>

export function HeroSlidesPage() {
  const [items, setItems] = useState<HeroSlide[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<HeroSlide | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { image_url: '', alt_text: '', overlay_text: '', page_slug: 'home', display_order: 0, is_active: true },
  })

  useEffect(() => { fetchItems() }, [])

  useEffect(() => {
    if (modalOpen) {
      if (editingItem) {
        form.reset({
          image_url: editingItem.image_url,
          alt_text: editingItem.alt_text,
          overlay_text: editingItem.overlay_text ?? '',
          page_slug: editingItem.page_slug,
          display_order: editingItem.display_order,
          is_active: editingItem.is_active,
        })
      } else {
        form.reset({ image_url: '', alt_text: '', overlay_text: '', page_slug: 'home', display_order: items.length, is_active: true })
      }
      setError(null)
    }
  }, [modalOpen, editingItem, form, items.length])

  async function fetchItems() {
    const { data } = await supabase
      .from('hero_slides')
      .select('*')
      .order('display_order', { ascending: true })
    if (data) setItems(data)
    setLoading(false)
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    setError(null)

    const payload = {
      image_url: data.image_url,
      alt_text: data.alt_text,
      overlay_text: data.overlay_text || null,
      page_slug: data.page_slug,
      display_order: data.display_order,
      is_active: data.is_active,
    }

    try {
      if (editingItem) {
        const { error: err } = await supabase.from('hero_slides').update(payload).eq('id', editingItem.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('hero_slides').insert(payload)
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
    if (!window.confirm('Delete this hero slide?')) return
    await supabase.from('hero_slides').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading hero slides...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">Hero Slides</h1>
          <p className="text-sm text-text-muted mt-1">{items.length} slide{items.length !== 1 ? 's' : ''}</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => { setEditingItem(null); setModalOpen(true) }}>
          Add Slide
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center"><p className="text-sm text-text-dim">No hero slides yet</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Thumbnail</TableHead>
                  <TableHead>Alt Text</TableHead>
                  <TableHead>Overlay</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <img src={item.image_url} alt={item.alt_text} className="w-20 h-[45px] object-cover rounded" />
                    </TableCell>
                    <TableCell className="font-medium">{item.alt_text}</TableCell>
                    <TableCell className="text-text-muted max-w-[200px] truncate">{item.overlay_text || '—'}</TableCell>
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

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingItem(null) }} title={editingItem ? 'Edit Hero Slide' : 'Add Hero Slide'} size="lg">
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Image URL" placeholder="https://" error={form.formState.errors.image_url?.message} {...form.register('image_url')} />
          <Input label="Alt Text" error={form.formState.errors.alt_text?.message} {...form.register('alt_text')} />
          <Input label="Overlay Text" placeholder="Optional overlay text" {...form.register('overlay_text')} />
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
              <Button type="submit" loading={saving}>{editingItem ? 'Save Changes' : 'Add Slide'}</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
