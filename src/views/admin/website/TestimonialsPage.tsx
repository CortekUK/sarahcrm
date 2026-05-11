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

type Testimonial = Database['public']['Tables']['testimonials']['Row']

const schema = z.object({
  person_name: z.string().min(1, 'Name is required'),
  person_title: z.string().optional(),
  company_name: z.string().optional(),
  quote_text: z.string().min(1, 'Quote is required'),
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof schema>

export function TestimonialsPage() {
  const [items, setItems] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Testimonial | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: { person_name: '', person_title: '', company_name: '', quote_text: '', display_order: 0, is_active: true },
  })

  useEffect(() => { fetchItems() }, [])

  useEffect(() => {
    if (modalOpen) {
      if (editingItem) {
        form.reset({
          person_name: editingItem.person_name,
          person_title: editingItem.person_title ?? '',
          company_name: editingItem.company_name ?? '',
          quote_text: editingItem.quote_text,
          display_order: editingItem.display_order,
          is_active: editingItem.is_active,
        })
      } else {
        form.reset({ person_name: '', person_title: '', company_name: '', quote_text: '', display_order: items.length, is_active: true })
      }
      setError(null)
    }
  }, [modalOpen, editingItem, form, items.length])

  async function fetchItems() {
    const { data } = await supabase.from('testimonials').select('*').order('display_order', { ascending: true })
    if (data) setItems(data)
    setLoading(false)
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    setError(null)

    const payload = {
      person_name: data.person_name,
      person_title: data.person_title || null,
      company_name: data.company_name || null,
      quote_text: data.quote_text,
      display_order: data.display_order,
      is_active: data.is_active,
    }

    try {
      if (editingItem) {
        const { error: err } = await supabase.from('testimonials').update(payload).eq('id', editingItem.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('testimonials').insert(payload)
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
    if (!window.confirm('Delete this testimonial?')) return
    await supabase.from('testimonials').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading testimonials...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">Testimonials</h1>
          <p className="text-sm text-text-muted mt-1">{items.length} testimonial{items.length !== 1 ? 's' : ''}</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => { setEditingItem(null); setModalOpen(true) }}>
          Add Testimonial
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center"><p className="text-sm text-text-dim">No testimonials yet</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Quote</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.person_name}</TableCell>
                    <TableCell className="text-text-muted">{item.person_title || '—'}</TableCell>
                    <TableCell className="text-text-muted">{item.company_name || '—'}</TableCell>
                    <TableCell className="text-text-muted max-w-[300px] truncate">{item.quote_text}</TableCell>
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

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingItem(null) }} title={editingItem ? 'Edit Testimonial' : 'Add Testimonial'} size="lg">
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Person Name" error={form.formState.errors.person_name?.message} {...form.register('person_name')} />
            <Input label="Title / Role" {...form.register('person_title')} />
          </div>
          <Input label="Company Name" {...form.register('company_name')} />
          <Textarea label="Quote" rows={3} error={form.formState.errors.quote_text?.message} {...form.register('quote_text')} />
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
              <Button type="submit" loading={saving}>{editingItem ? 'Save Changes' : 'Add Testimonial'}</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
