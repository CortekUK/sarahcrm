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
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { Plus, Pencil, Trash2, Images } from 'lucide-react'
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

// Pages the public site reads hero slides from. Free-text page_slug let
// admins type slugs the site doesn't render — invisible content.
const PAGE_SLUGS: { value: string; label: string }[] = [
  { value: 'home', label: 'Homepage' },
  { value: 'about', label: 'About Sarah' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'events', label: 'Events' },
  { value: 'memberships', label: 'Memberships' },
  { value: 'private-event-services', label: 'Private Event Services' },
  { value: 'contact-us', label: 'Contact Us' },
]

export function HeroSlidesPage() {
  const confirm = useConfirm()
  const [items, setItems] = useState<HeroSlide[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<HeroSlide | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageFilter, setPageFilter] = useState<string>('all')

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      image_url: '',
      alt_text: '',
      overlay_text: '',
      page_slug: 'home',
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
          image_url: editingItem.image_url,
          alt_text: editingItem.alt_text,
          overlay_text: editingItem.overlay_text ?? '',
          page_slug: editingItem.page_slug,
          display_order: editingItem.display_order,
          is_active: editingItem.is_active,
        })
      } else {
        form.reset({
          image_url: '',
          alt_text: '',
          overlay_text: '',
          page_slug: pageFilter !== 'all' ? pageFilter : 'home',
          display_order: items.length,
          is_active: true,
        })
      }
      setError(null)
    }
  }, [modalOpen, editingItem, form, items.length, pageFilter])

  async function fetchItems() {
    const { data } = await supabase
      .from('hero_slides')
      .select('*')
      .order('page_slug', { ascending: true })
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
    const slide = items.find((i) => i.id === id)
    const ok = await confirm({
      title: 'Delete hero slide?',
      description: slide
        ? `"${slide.alt_text}" will be removed from the ${slide.page_slug} hero. This cannot be undone.`
        : 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('hero_slides').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function handleToggleActive(item: HeroSlide, next: boolean) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: next } : i)))
    const { error: err } = await supabase
      .from('hero_slides')
      .update({ is_active: next })
      .eq('id', item.id)
    if (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !next } : i)))
      throw err
    }
  }

  async function handleReorder(next: HeroSlide[]) {
    setItems(next)
    await Promise.all(
      next.map((i) =>
        supabase.from('hero_slides').update({ display_order: i.display_order }).eq('id', i.id),
      ),
    )
  }

  const filteredItems =
    pageFilter === 'all' ? items : items.filter((i) => i.page_slug === pageFilter)

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
    <div className="p-8 max-w-6xl">
      <AdminPageHeader
        title="Hero slides"
        description="Cinematic hero images shown at the top of each public page. Drag to reorder within a page; toggle off to hide a slide without deleting it."
        meta={
          <span className="text-xs text-text-dim">
            {items.length} slide{items.length !== 1 ? 's' : ''}
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
            Add slide
          </Button>
        }
      />

      {/* Page filter chips */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <button
          onClick={() => setPageFilter('all')}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
            pageFilter === 'all'
              ? 'bg-gold text-white border-gold'
              : 'bg-white text-text-muted border-border hover:border-border-hover'
          }`}
        >
          All pages
        </button>
        {PAGE_SLUGS.map((s) => {
          const count = items.filter((i) => i.page_slug === s.value).length
          if (count === 0 && pageFilter !== s.value) return null
          return (
            <button
              key={s.value}
              onClick={() => setPageFilter(s.value)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                pageFilter === s.value
                  ? 'bg-gold text-white border-gold'
                  : 'bg-white text-text-muted border-border hover:border-border-hover'
              }`}
            >
              {s.label} {count > 0 && `· ${count}`}
            </button>
          )
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredItems.length === 0 ? (
            <AdminEmptyState
              icon={Images}
              title={pageFilter === 'all' ? 'No hero slides yet' : `No slides for this page`}
              description="Add a hero image to display at the top of the page."
              action={
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setEditingItem(null)
                    setModalOpen(true)
                  }}
                >
                  Add first slide
                </Button>
              }
            />
          ) : (
            <SortableList
              items={filteredItems}
              onReorder={handleReorder}
              renderItem={(item, dragHandleProps) => (
                <div className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-b-0 group hover:bg-surface-2/50 transition-colors">
                  <DragHandle dragHandleProps={dragHandleProps} />
                  <Thumbnail
                    src={item.image_url}
                    alt={item.alt_text}
                    aspect="16 / 9"
                    width={96}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{item.alt_text}</p>
                    {item.overlay_text && (
                      <p className="text-[11px] text-text-muted italic mt-0.5 truncate">
                        “{item.overlay_text}”
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-dim px-2 py-1 rounded-full bg-surface-2 whitespace-nowrap">
                    {PAGE_SLUGS.find((s) => s.value === item.page_slug)?.label ?? item.page_slug}
                  </span>
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
        title={editingItem ? 'Edit hero slide' : 'Add hero slide'}
        size="lg"
      >
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <ImageUpload
            label="Hero image"
            value={form.watch('image_url')}
            onChange={(url) =>
              form.setValue('image_url', url ?? '', { shouldValidate: true, shouldDirty: true })
            }
            bucket="heroes"
            aspect="16 / 7"
            error={form.formState.errors.image_url?.message}
            hint="Wide cinematic crops (16:7 or similar) work best — they fill the page hero on desktop."
          />
          <Input
            label="Alt text"
            error={form.formState.errors.alt_text?.message}
            {...form.register('alt_text')}
          />
          <Input
            label="Overlay text"
            placeholder="Optional overlay text"
            {...form.register('overlay_text')}
          />
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
              Page
            </label>
            <select
              {...form.register('page_slug')}
              className="w-full px-3 py-2 border border-border rounded-[var(--radius-md)] bg-surface text-text text-sm focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
            >
              {PAGE_SLUGS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {form.formState.errors.page_slug && (
              <p className="text-xs text-accent-warm mt-1">
                {form.formState.errors.page_slug.message}
              </p>
            )}
          </div>
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
                {editingItem ? 'Save changes' : 'Add slide'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
