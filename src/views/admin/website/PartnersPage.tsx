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

type PartnerLogo = Database['public']['Tables']['partner_logos']['Row']

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  image_url: z.string().url('Valid URL required'),
  website_url: z.string().optional(),
  display_order: z.coerce.number().int().min(0),
  is_visible: z.boolean(),
})

type FormData = z.infer<typeof schema>

export function PartnersPage() {
  const [items, setItems] = useState<PartnerLogo[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PartnerLogo | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { name: '', image_url: '', website_url: '', display_order: 0, is_visible: true },
  })

  useEffect(() => { fetchItems() }, [])

  useEffect(() => {
    if (modalOpen) {
      if (editingItem) {
        form.reset({
          name: editingItem.name,
          image_url: editingItem.image_url,
          website_url: editingItem.website_url ?? '',
          display_order: editingItem.display_order,
          is_visible: editingItem.is_visible,
        })
      } else {
        form.reset({ name: '', image_url: '', website_url: '', display_order: items.length, is_visible: true })
      }
      setError(null)
    }
  }, [modalOpen, editingItem, form, items.length])

  async function fetchItems() {
    const { data } = await supabase.from('partner_logos').select('*').order('display_order', { ascending: true })
    if (data) setItems(data)
    setLoading(false)
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    setError(null)

    const payload = {
      name: data.name,
      image_url: data.image_url,
      website_url: data.website_url || null,
      display_order: data.display_order,
      is_visible: data.is_visible,
    }

    try {
      if (editingItem) {
        const { error: err } = await supabase.from('partner_logos').update(payload).eq('id', editingItem.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('partner_logos').insert(payload)
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
    if (!window.confirm('Delete this partner?')) return
    await supabase.from('partner_logos').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading partners...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">Partners</h1>
          <p className="text-sm text-text-muted mt-1">{items.length} partner{items.length !== 1 ? 's' : ''}</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => { setEditingItem(null); setModalOpen(true) }}>
          Add Partner
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center"><p className="text-sm text-text-dim">No partners yet</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Logo</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Visible</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <img src={item.image_url} alt={item.name} className="w-[60px] h-10 object-contain" />
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-text-muted max-w-[200px] truncate">{item.website_url || '—'}</TableCell>
                    <TableCell>{item.display_order}</TableCell>
                    <TableCell>
                      <Badge variant={item.is_visible ? 'active' : 'draft'} dot>
                        {item.is_visible ? 'Visible' : 'Hidden'}
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

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingItem(null) }} title={editingItem ? 'Edit Partner' : 'Add Partner'} size="lg">
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Partner Name" error={form.formState.errors.name?.message} {...form.register('name')} />
          <Input label="Logo URL" placeholder="https://" error={form.formState.errors.image_url?.message} {...form.register('image_url')} />
          <Input label="Website URL" placeholder="https://" {...form.register('website_url')} />
          <Input label="Display Order" type="number" {...form.register('display_order')} />
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded border-border text-gold accent-gold" {...form.register('is_visible')} />
            <span className="text-sm text-text">Visible</span>
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
              <Button type="submit" loading={saving}>{editingItem ? 'Save Changes' : 'Add Partner'}</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
