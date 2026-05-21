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
import { ImageUpload } from '@/components/ui/ImageUpload'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { Thumbnail } from '@/components/admin/Thumbnail'
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { SortableList, DragHandle } from '@/components/admin/SortableList'
import { Plus, Pencil, Trash2, ExternalLink, Handshake } from 'lucide-react'
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: { name: '', image_url: '', website_url: '', display_order: 0, is_visible: true },
  })

  useEffect(() => {
    fetchItems()
  }, [])

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
    const { data } = await supabase
      .from('partner_logos')
      .select('*')
      .order('display_order', { ascending: true })
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

  async function handleToggleVisible(item: PartnerLogo, next: boolean) {
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, is_visible: next } : p)))
    const { error: err } = await supabase
      .from('partner_logos')
      .update({ is_visible: next })
      .eq('id', item.id)
    if (err) {
      setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, is_visible: !next } : p)))
      throw err
    }
  }

  async function handleReorder(next: PartnerLogo[]) {
    setItems(next)
    await Promise.all(
      next.map((p) =>
        supabase.from('partner_logos').update({ display_order: p.display_order }).eq('id', p.id),
      ),
    )
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
    <div className="p-8 max-w-6xl">
      <AdminPageHeader
        title="Partners"
        description="Sponsor and partner logos shown on the homepage 'Trusted by' strip. Drag to reorder; toggle to show or hide a logo without deleting it."
        meta={
          <span className="text-xs text-text-dim">
            {items.length} partner{items.length !== 1 ? 's' : ''}
            {' · '}
            {items.filter((i) => i.is_visible).length} visible
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
            Add partner
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <AdminEmptyState
              icon={Handshake}
              title="No partners yet"
              description="Add sponsor or partner logos to display them on the homepage."
              action={
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setEditingItem(null)
                    setModalOpen(true)
                  }}
                >
                  Add first partner
                </Button>
              }
            />
          ) : (
            <SortableList
              items={items}
              onReorder={handleReorder}
              renderItem={(item, dragHandleProps) => (
                <div className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-b-0 group hover:bg-surface-2/50 transition-colors">
                  <DragHandle dragHandleProps={dragHandleProps} />
                  <Thumbnail
                    src={item.image_url}
                    alt={item.name}
                    aspect="3 / 1"
                    width={72}
                    fit="contain"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{item.name}</p>
                    {item.website_url ? (
                      <a
                        href={item.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] text-text-dim hover:text-gold transition-colors mt-0.5"
                      >
                        {item.website_url}
                        <ExternalLink size={10} />
                      </a>
                    ) : (
                      <p className="text-[11px] text-text-dim mt-0.5 italic">No website link</p>
                    )}
                  </div>
                  <ActiveToggle
                    active={item.is_visible}
                    onChange={(next) => handleToggleVisible(item, next)}
                    activeLabel="Visible"
                    inactiveLabel="Hidden"
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
        title={editingItem ? 'Edit partner' : 'Add partner'}
        size="lg"
      >
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Partner name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
          <ImageUpload
            label="Logo"
            value={form.watch('image_url')}
            onChange={(url) =>
              form.setValue('image_url', url ?? '', { shouldValidate: true, shouldDirty: true })
            }
            bucket="logos"
            folder="partners"
            aspect="3 / 1"
            error={form.formState.errors.image_url?.message}
            hint="Transparent PNG recommended. The homepage strip shows logos in monochrome and lights up on hover."
          />
          <Input label="Website URL" placeholder="https://" {...form.register('website_url')} />
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-border text-gold accent-gold"
              {...form.register('is_visible')}
            />
            <span className="text-sm text-text">Visible on the homepage</span>
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
                {editingItem ? 'Save changes' : 'Add partner'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
