'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { formatDate } from '@/lib/utils'
import { Pencil, Plus, Trash2, Send, Image } from 'lucide-react'
import type { Database } from '@/types/database'

type GalleryRow = Database['public']['Tables']['galleries']['Row']
type PhotoRow = Database['public']['Tables']['gallery_photos']['Row']

const categoryLabels: Record<string, string> = {
  private_dining: 'Private Dining',
  members_event: 'Members Event',
  curated_experience: 'Curated Experience',
  sponsored_event: 'Sponsored Event',
  business_enrichment: 'Business Enrichment',
}

const photoSchema = z.object({
  image_url: z.string().url('Valid URL required'),
  caption: z.string().optional(),
  display_order: z.coerce.number().int().min(0),
})

type PhotoFormData = z.infer<typeof photoSchema>

export function GalleryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const confirm = useConfirm()
  const [gallery, setGallery] = useState<GalleryRow | null>(null)
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)

  // Photo modal state
  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [editingPhoto, setEditingPhoto] = useState<PhotoRow | null>(null)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const photoForm = useForm<PhotoFormData>({
    resolver: zodResolver(photoSchema) as any,
    defaultValues: { image_url: '', caption: '', display_order: 0 },
  })

  useEffect(() => {
    if (id) fetchGallery(id)
  }, [id])

  useEffect(() => {
    if (photoModalOpen) {
      if (editingPhoto) {
        photoForm.reset({
          image_url: editingPhoto.image_url,
          caption: editingPhoto.caption ?? '',
          display_order: editingPhoto.display_order,
        })
      } else {
        photoForm.reset({ image_url: '', caption: '', display_order: photos.length })
      }
      setPhotoError(null)
    }
  }, [photoModalOpen, editingPhoto, photoForm, photos.length])

  async function fetchGallery(galleryId: string) {
    setLoading(true)
    const [galleryRes, photosRes] = await Promise.all([
      supabase.from('galleries').select('*').eq('id', galleryId).single(),
      supabase
        .from('gallery_photos')
        .select('*')
        .eq('gallery_id', galleryId)
        .order('display_order', { ascending: true }),
    ])

    if (galleryRes.data) setGallery(galleryRes.data)
    if (photosRes.data) setPhotos(photosRes.data)
    setLoading(false)
  }

  async function handlePublishToggle() {
    if (!id || !gallery) return
    setPublishing(true)
    const newStatus = !gallery.is_published
    await supabase.from('galleries').update({ is_published: newStatus }).eq('id', id)
    setGallery({ ...gallery, is_published: newStatus })
    setPublishing(false)
  }

  async function handleDeleteGallery() {
    if (!id) return
    const ok = await confirm({
      title: 'Delete gallery?',
      description: gallery
        ? `"${gallery.title}" and all of its photos will be permanently removed from the public site. This cannot be undone.`
        : 'This gallery and all of its photos will be permanently removed. This cannot be undone.',
      confirmLabel: 'Delete gallery',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('gallery_photos').delete().eq('gallery_id', id)
    await supabase.from('galleries').delete().eq('id', id)
    router.push('/dashboard/website/galleries')
  }

  async function onPhotoSubmit(data: PhotoFormData) {
    if (!id) return
    setSavingPhoto(true)
    setPhotoError(null)

    try {
      if (editingPhoto) {
        const { error: err } = await supabase
          .from('gallery_photos')
          .update({
            image_url: data.image_url,
            caption: data.caption || null,
            display_order: data.display_order,
          })
          .eq('id', editingPhoto.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase
          .from('gallery_photos')
          .insert({
            gallery_id: id,
            image_url: data.image_url,
            caption: data.caption || null,
            display_order: data.display_order,
          })
        if (err) throw err
      }

      setPhotoModalOpen(false)
      setEditingPhoto(null)
      // Refetch photos
      const { data: refreshed } = await supabase
        .from('gallery_photos')
        .select('*')
        .eq('gallery_id', id)
        .order('display_order', { ascending: true })
      if (refreshed) setPhotos(refreshed)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Failed to save photo')
    } finally {
      setSavingPhoto(false)
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!id) return
    const ok = await confirm({
      title: 'Delete photo?',
      description: 'This photo will be removed from the gallery. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('gallery_photos').delete().eq('id', photoId)
    setPhotos((prev) => prev.filter((p) => p.id !== photoId))
  }

  if (loading || !gallery) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading gallery...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl">
      <AdminPageHeader
        title={gallery.title}
        description={
          gallery.category
            ? `${categoryLabels[gallery.category] ?? gallery.category} · /${gallery.slug}`
            : `/${gallery.slug}`
        }
        backHref="/dashboard/website/galleries"
        breadcrumbs={[
          { label: 'Galleries', href: '/dashboard/website/galleries' },
          { label: gallery.title },
        ]}
        actions={
          <>
            <Button
              variant={gallery.is_published ? 'secondary' : 'primary'}
              icon={<Send size={14} />}
              size="sm"
              loading={publishing}
              onClick={handlePublishToggle}
            >
              {gallery.is_published ? 'Unpublish' : 'Publish'}
            </Button>
            <Button
              variant="secondary"
              icon={<Pencil size={14} />}
              size="sm"
              onClick={() => router.push(`/dashboard/website/galleries/${id}/edit`)}
            >
              Edit
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeleteGallery}>
              Delete
            </Button>
          </>
        }
      />

      {/* Gallery info card */}
      <Card className="mb-6">
        <CardContent className="py-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
                  {gallery.title}
                </h1>
                <Badge variant={gallery.is_published ? 'active' : 'draft'} dot>
                  {gallery.is_published ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <p className="text-sm text-text-muted">
                {gallery.category ? categoryLabels[gallery.category] ?? gallery.category : 'No category'} &middot; {gallery.slug}
              </p>
            </div>
            {gallery.cover_image_url && (
              <img
                src={gallery.cover_image_url}
                alt={gallery.title}
                className="w-24 h-16 object-cover rounded-[var(--radius-md)]"
              />
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Event Date</p>
              <p className="text-text">{gallery.event_date ? formatDate(gallery.event_date) : '—'}</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Venue</p>
              <p className="text-text">{gallery.venue_name || '—'}</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Location</p>
              <p className="text-text">{gallery.location || '—'}</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Photos</p>
              <p className="text-text">{photos.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Photos section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Photos ({photos.length})</CardTitle>
          <Button
            icon={<Plus size={14} />}
            size="sm"
            onClick={() => {
              setEditingPhoto(null)
              setPhotoModalOpen(true)
            }}
          >
            Add Photo
          </Button>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <div className="py-10 text-center">
              <Image size={32} strokeWidth={1} className="mx-auto text-text-dim mb-3" />
              <p className="text-sm text-text-dim">No photos yet. Add your first photo above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative bg-surface-2 rounded-[var(--radius-md)] overflow-hidden border border-border"
                >
                  <div className="aspect-[4/3]">
                    <img
                      src={photo.image_url}
                      alt={photo.caption || ''}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-text truncate">{photo.caption || 'No caption'}</p>
                    <Badge variant="info" className="mt-1">Order: {photo.display_order}</Badge>
                  </div>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-[rgba(44,40,37,0.5)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => {
                        setEditingPhoto(photo)
                        setPhotoModalOpen(true)
                      }}
                      className="p-2 bg-surface rounded-[var(--radius-md)] text-text hover:bg-surface-2 transition-colors"
                    >
                      <Pencil size={16} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="p-2 bg-surface rounded-[var(--radius-md)] text-accent-warm hover:bg-surface-2 transition-colors"
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Modal */}
      <Modal
        open={photoModalOpen}
        onClose={() => { setPhotoModalOpen(false); setEditingPhoto(null) }}
        title={editingPhoto ? 'Edit Photo' : 'Add Photo'}
        size="lg"
      >
        {photoError && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{photoError}</p>
          </div>
        )}

        <form onSubmit={photoForm.handleSubmit(onPhotoSubmit)} className="space-y-4">
          <ImageUpload
            label="Photo"
            value={photoForm.watch('image_url')}
            onChange={(url) =>
              photoForm.setValue('image_url', url ?? '', { shouldValidate: true, shouldDirty: true })
            }
            bucket="gallery"
            folder={`photos/${id}`}
            aspect="4 / 3"
            error={photoForm.formState.errors.image_url?.message}
          />
          <Input
            label="Caption"
            placeholder="Optional caption"
            {...photoForm.register('caption')}
          />
          <Input
            label="Display Order"
            type="number"
            {...photoForm.register('display_order')}
          />

          <div className="flex justify-end gap-3 pt-2">
            {editingPhoto && (
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  handleDeletePhoto(editingPhoto.id)
                  setPhotoModalOpen(false)
                  setEditingPhoto(null)
                }}
              >
                Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="ghost" onClick={() => { setPhotoModalOpen(false); setEditingPhoto(null) }}>
              Cancel
            </Button>
            <Button type="submit" loading={savingPhoto}>
              {editingPhoto ? 'Save Changes' : 'Add Photo'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
