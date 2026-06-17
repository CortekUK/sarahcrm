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
import { Textarea } from '@/components/ui/Textarea'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { SortableList, DragHandle } from '@/components/admin/SortableList'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { Plus, Pencil, Trash2, Quote, MessageSquareQuote } from 'lucide-react'
import type { Database } from '@/types/database'

type Testimonial = Database['public']['Tables']['testimonials']['Row']

// Public surface that displays testimonials — the homepage's
// VoicesChapter reads from this table. Flushing `/` after any change
// makes the new/edited/removed quote appear immediately instead of
// waiting for the 60s ISR window.
function flushHomepageCache() {
  void fetch('/api/admin/revalidate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths: ['/'] }),
  }).catch(() => {})
}

const schema = z.object({
  person_name: z.string().min(1, 'Name is required'),
  person_title: z.string().optional(),
  company_name: z.string().optional(),
  quote_text: z.string().min(1, 'Quote is required'),
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof schema>

// Initials avatar for a testimonial — feels more premium than empty space.
function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/)
  const text = (parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')
  return (
    <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center flex-shrink-0 ring-1 ring-gold/20">
      <span className="font-[family-name:var(--font-heading)] text-sm font-semibold text-gold-dark uppercase">
        {text}
      </span>
    </div>
  )
}

export function TestimonialsPage() {
  const confirm = useConfirm()
  const [items, setItems] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Testimonial | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      person_name: '',
      person_title: '',
      company_name: '',
      quote_text: '',
      display_order: 0,
      is_active: true,
    },
  })

  useEffect(() => {
    fetchItems()
  }, [])

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
        form.reset({
          person_name: '',
          person_title: '',
          company_name: '',
          quote_text: '',
          display_order: items.length,
          is_active: true,
        })
      }
      setError(null)
    }
  }, [modalOpen, editingItem, form, items.length])

  async function fetchItems() {
    const { data } = await supabase
      .from('testimonials')
      .select('*')
      .order('display_order', { ascending: true })
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
      flushHomepageCache()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const item = items.find((i) => i.id === id)
    const ok = await confirm({
      title: 'Delete testimonial?',
      description: item
        ? `The quote from ${item.person_name} will no longer appear on the homepage. This cannot be undone.`
        : 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('testimonials').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
    flushHomepageCache()
  }

  async function handleToggleActive(item: Testimonial, next: boolean) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: next } : i)))
    const { error: err } = await supabase
      .from('testimonials')
      .update({ is_active: next })
      .eq('id', item.id)
    if (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !next } : i)))
      throw err
    }
    flushHomepageCache()
  }

  async function handleReorder(next: Testimonial[]) {
    setItems(next)
    await Promise.all(
      next.map((i) =>
        supabase.from('testimonials').update({ display_order: i.display_order }).eq('id', i.id),
      ),
    )
    flushHomepageCache()
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
      <AdminPageHeader
        title="Testimonials"
        description="Member quotes shown on the homepage In Their Own Words carousel. Drag to reorder; toggle inactive to hide without deleting. When all testimonials are removed or inactive, the homepage section is hidden entirely — no placeholder quotes are ever shown to the public."
        meta={
          <span className="text-xs text-text-dim">
            {items.length} testimonial{items.length !== 1 ? 's' : ''}
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
            Add testimonial
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <AdminEmptyState
              icon={MessageSquareQuote}
              title="No testimonials yet"
              description="Member quotes appear on the homepage and add credibility to the brand."
              action={
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setEditingItem(null)
                    setModalOpen(true)
                  }}
                >
                  Add first testimonial
                </Button>
              }
            />
          ) : (
            <SortableList
              items={items}
              onReorder={handleReorder}
              renderItem={(item, dragHandleProps) => (
                <div className="flex items-start gap-4 px-5 py-4 border-b border-border last:border-b-0 group hover:bg-surface-2/50 transition-colors">
                  <div className="flex items-center gap-3 pt-1">
                    <DragHandle dragHandleProps={dragHandleProps} />
                    <Initials name={item.person_name} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text">{item.person_name}</p>
                    <p className="text-[11px] text-text-dim mt-0.5">
                      {[item.person_title, item.company_name].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <div className="relative mt-2 pl-4 border-l-2 border-gold/30">
                      <Quote
                        size={10}
                        className="absolute -left-[5px] top-0 text-gold bg-bg"
                      />
                      <p className="text-sm text-text-muted italic leading-relaxed line-clamp-2">
                        {item.quote_text}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
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
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingItem(null)
        }}
        title={editingItem ? 'Edit testimonial' : 'Add testimonial'}
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
              label="Person name"
              error={form.formState.errors.person_name?.message}
              {...form.register('person_name')}
            />
            <Input label="Title / role" {...form.register('person_title')} />
          </div>
          <Input label="Company name" {...form.register('company_name')} />
          <Textarea
            label="Quote"
            rows={4}
            error={form.formState.errors.quote_text?.message}
            {...form.register('quote_text')}
          />
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-border text-gold accent-gold"
              {...form.register('is_active')}
            />
            <span className="text-sm text-text">Active on the homepage</span>
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
                {editingItem ? 'Save changes' : 'Add testimonial'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
