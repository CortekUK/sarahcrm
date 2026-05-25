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
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { Thumbnail } from '@/components/admin/Thumbnail'
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { SortableList, DragHandle } from '@/components/admin/SortableList'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { Plus, Pencil, Trash2, Video, ExternalLink, PlayCircle } from 'lucide-react'
import type { Database } from '@/types/database'

type Video = Database['public']['Tables']['video_gallery']['Row']

const PAGE_SLUGS: { value: string; label: string }[] = [
  { value: 'about', label: 'About Sarah' },
  { value: 'private-event-services', label: 'Private Event Services' },
]

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  youtube_url: z.string().url('Valid URL required'),
  page_slug: z.enum(['about', 'private-event-services']),
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof schema>

// Extract the YouTube video ID from any of the common URL shapes — drives
// the thumbnail preview in the list view.
function extractYouTubeId(url: string): string | null {
  if (!url) return null
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{6,})/,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function youtubeThumbnail(url: string): string | null {
  const id = extractYouTubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null
}

export function VideosPage() {
  const confirm = useConfirm()
  const [items, setItems] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Video | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageFilter, setPageFilter] = useState<string>('all')

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      title: '',
      youtube_url: '',
      page_slug: 'about',
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
        const slug = (editingItem.page_slug === 'private-event-services'
          ? 'private-event-services'
          : 'about') as 'about' | 'private-event-services'
        form.reset({
          title: editingItem.title,
          youtube_url: editingItem.youtube_url,
          page_slug: slug,
          display_order: editingItem.display_order,
          is_active: editingItem.is_active,
        })
      } else {
        form.reset({
          title: '',
          youtube_url: '',
          page_slug: (pageFilter === 'private-event-services'
            ? 'private-event-services'
            : 'about') as 'about' | 'private-event-services',
          display_order: items.length,
          is_active: true,
        })
      }
      setError(null)
    }
  }, [modalOpen, editingItem, form, items.length, pageFilter])

  async function fetchItems() {
    const { data } = await supabase
      .from('video_gallery')
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
    const item = items.find((i) => i.id === id)
    const ok = await confirm({
      title: 'Delete video?',
      description: item
        ? `"${item.title}" will be removed from the ${item.page_slug} page. This cannot be undone.`
        : 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('video_gallery').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function handleToggleActive(item: Video, next: boolean) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: next } : i)))
    const { error: err } = await supabase
      .from('video_gallery')
      .update({ is_active: next })
      .eq('id', item.id)
    if (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !next } : i)))
      throw err
    }
  }

  async function handleReorder(next: Video[]) {
    setItems(next)
    await Promise.all(
      next.map((i) =>
        supabase.from('video_gallery').update({ display_order: i.display_order }).eq('id', i.id),
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
          <span className="text-sm text-text-muted">Loading videos...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl">
      <AdminPageHeader
        title="Video gallery"
        description="YouTube videos embedded on the About and Private Event Services pages. Drag to reorder within a page."
        meta={
          <span className="text-xs text-text-dim">
            {items.length} video{items.length !== 1 ? 's' : ''}
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
            Add video
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
          return (
            <button
              key={s.value}
              onClick={() => setPageFilter(s.value)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                pageFilter === s.value
                  ? 'bg-gold text-white border-gold'
                  : 'bg-[var(--color-surface)] text-text-muted border-border hover:border-border-hover hover:text-text'
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
              icon={Video}
              title="No videos yet"
              description="Add YouTube URLs to feature videos on the About or Private Event Services page."
              action={
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setEditingItem(null)
                    setModalOpen(true)
                  }}
                >
                  Add first video
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
                  <div className="relative">
                    <Thumbnail
                      src={youtubeThumbnail(item.youtube_url)}
                      alt={item.title}
                      aspect="16 / 9"
                      width={96}
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <PlayCircle size={20} className="text-white drop-shadow-md" strokeWidth={1.5} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{item.title}</p>
                    <a
                      href={item.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] text-text-dim hover:text-gold transition-colors mt-0.5"
                    >
                      {item.youtube_url}
                      <ExternalLink size={10} />
                    </a>
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
        title={editingItem ? 'Edit video' : 'Add video'}
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
          <Input
            label="YouTube URL"
            placeholder="https://youtube.com/watch?v=..."
            error={form.formState.errors.youtube_url?.message}
            {...form.register('youtube_url')}
          />
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
              Page
            </label>
            <select
              {...form.register('page_slug')}
              className="w-full px-3 py-2 border border-border rounded-[var(--radius-md)] bg-surface text-text text-sm focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
            >
              {PAGE_SLUGS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {form.formState.errors.page_slug && (
              <p className="text-xs text-accent-warm mt-1">
                {form.formState.errors.page_slug.message}
              </p>
            )}
            <p className="text-[10px] text-text-dim mt-1">
              Where this video appears on the public site
            </p>
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
                {editingItem ? 'Save changes' : 'Add video'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
