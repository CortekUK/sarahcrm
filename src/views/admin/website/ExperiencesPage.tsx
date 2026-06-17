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
import { ImageUpload } from '@/components/ui/ImageUpload'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { Thumbnail } from '@/components/admin/Thumbnail'
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { SortableList, DragHandle } from '@/components/admin/SortableList'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { Plus, Pencil, Trash2, Sparkles, ExternalLink } from 'lucide-react'
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
  const confirm = useConfirm()
  const [items, setItems] = useState<Experience[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Experience | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      title: '',
      description: '',
      image_url: '',
      link_url: '',
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
          title: editingItem.title,
          description: editingItem.description ?? '',
          image_url: editingItem.image_url ?? '',
          link_url: editingItem.link_url ?? '',
          display_order: editingItem.display_order,
          is_active: editingItem.is_active,
        })
      } else {
        form.reset({
          title: '',
          description: '',
          image_url: '',
          link_url: '',
          display_order: items.length,
          is_active: true,
        })
      }
      setError(null)
    }
  }, [modalOpen, editingItem, form, items.length])

  async function fetchItems() {
    const { data } = await supabase
      .from('curated_experiences')
      .select('*')
      .order('display_order', { ascending: true })
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
        const { error: err } = await supabase
          .from('curated_experiences')
          .update(payload)
          .eq('id', editingItem.id)
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
    const item = items.find((i) => i.id === id)
    const ok = await confirm({
      title: 'Delete experience?',
      description: item
        ? `"${item.title}" will be removed from the Private Events page. This cannot be undone.`
        : 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('curated_experiences').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function handleToggleActive(item: Experience, next: boolean) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: next } : i)))
    const { error: err } = await supabase
      .from('curated_experiences')
      .update({ is_active: next })
      .eq('id', item.id)
    if (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !next } : i)))
      throw err
    }
  }

  async function handleReorder(next: Experience[]) {
    setItems(next)
    await Promise.all(
      next.map((i) =>
        supabase
          .from('curated_experiences')
          .update({ display_order: i.display_order })
          .eq('id', i.id),
      ),
    )
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
      <AdminPageHeader
        title="Curated experiences"
        description="The cards on the Private Event Services page. Each links to an external partner site or a deeper page."
        meta={
          <span className="text-xs text-text-dim">
            {items.length} experience{items.length !== 1 ? 's' : ''}
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
            Add experience
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <AdminEmptyState
              icon={Sparkles}
              title="No experiences yet"
              description="Add curated experiences to feature on the Private Event Services page."
              action={
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setEditingItem(null)
                    setModalOpen(true)
                  }}
                >
                  Add first experience
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
                  <Thumbnail src={item.image_url} alt={item.title} aspect="4 / 3" width={72} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{item.title}</p>
                    {item.description && (
                      <p className="text-[11px] text-text-muted line-clamp-1 mt-0.5">
                        {item.description}
                      </p>
                    )}
                    {item.link_url && (
                      <a
                        href={item.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] text-text-dim hover:text-gold transition-colors mt-1"
                      >
                        {item.link_url}
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
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
        title={editingItem ? 'Edit experience' : 'Add experience'}
        size="lg"
      >
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Title"
            error={form.formState.errors.title?.message}
            {...form.register('title')}
          />
          <Textarea label="Description" rows={3} {...form.register('description')} />
          <ImageUpload
            label="Image"
            value={form.watch('image_url')}
            onChange={(url) => form.setValue('image_url', url ?? '', { shouldDirty: true })}
            bucket="content"
            folder="experiences"
            aspect="4 / 3"
          />
          <Input label="Link URL" placeholder="https://" {...form.register('link_url')} />
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-border text-gold accent-gold"
              {...form.register('is_active')}
            />
            <span className="text-sm text-text">Active on Private Event Services</span>
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
                {editingItem ? 'Save changes' : 'Add experience'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
