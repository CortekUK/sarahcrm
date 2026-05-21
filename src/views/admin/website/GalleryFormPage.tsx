'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Save, Send } from 'lucide-react'
import { slugify } from '@/lib/utils'

const gallerySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required'),
  category: z.string().optional(),
  cover_image_url: z.string().optional(),
  event_date: z.string().optional(),
  venue_name: z.string().optional(),
  location: z.string().optional(),
  is_published: z.boolean(),
})

type GalleryFormData = z.infer<typeof gallerySchema>

const categoryOptions = [
  { value: '', label: 'None' },
  { value: 'private_dining', label: 'Private Dining' },
  { value: 'members_event', label: 'Members Event' },
  { value: 'curated_experience', label: 'Curated Experience' },
  { value: 'sponsored_event', label: 'Sponsored Event' },
  { value: 'business_enrichment', label: 'Business Enrichment' },
]

export function GalleryFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const router = useRouter()
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<GalleryFormData>({
    resolver: zodResolver(gallerySchema) as any,
    defaultValues: {
      title: '',
      slug: '',
      category: '',
      cover_image_url: '',
      event_date: '',
      venue_name: '',
      location: '',
      is_published: false,
    },
  })

  // Auto-generate slug from title
  const title = form.watch('title')
  useEffect(() => {
    if (!isEdit && title) {
      form.setValue('slug', slugify(title), { shouldValidate: true })
    }
  }, [title, isEdit, form])

  // Fetch existing gallery for edit
  useEffect(() => {
    if (isEdit && id) {
      supabase
        .from('galleries')
        .select('*')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (data) {
            form.reset({
              title: data.title,
              slug: data.slug,
              category: data.category ?? '',
              cover_image_url: data.cover_image_url ?? '',
              event_date: data.event_date ? data.event_date.split('T')[0] : '',
              venue_name: data.venue_name ?? '',
              location: data.location ?? '',
              is_published: data.is_published,
            })
          }
          setLoading(false)
        })
    }
  }, [id, isEdit, form])

  async function onSubmit(data: GalleryFormData, publish = false) {
    setSaving(true)
    setError(null)

    const payload = {
      title: data.title,
      slug: data.slug,
      category: data.category || null,
      cover_image_url: data.cover_image_url || null,
      event_date: data.event_date || null,
      venue_name: data.venue_name || null,
      location: data.location || null,
      is_published: publish ? true : data.is_published,
    }

    try {
      if (isEdit && id) {
        const { error: err } = await supabase
          .from('galleries')
          .update(payload)
          .eq('id', id)
        if (err) throw err
        router.push(`/dashboard/website/galleries/${id}`)
      } else {
        const { data: created, error: err } = await supabase
          .from('galleries')
          .insert(payload)
          .select('id')
          .single()
        if (err) throw err
        router.push(`/dashboard/website/galleries/${created.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save gallery')
      setSaving(false)
    }
  }

  if (loading) {
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
    <div className="p-8 max-w-4xl">
      <AdminPageHeader
        title={isEdit ? 'Edit gallery' : 'Create gallery'}
        description={
          isEdit
            ? 'Update gallery details, cover image, and publish state. Manage individual photos from the gallery detail page.'
            : 'Create a new gallery to showcase event photos publicly. You can save as draft first, then add photos before publishing.'
        }
        backHref="/dashboard/website/galleries"
        breadcrumbs={[
          { label: 'Galleries', href: '/dashboard/website/galleries' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Save size={14} />}
              size="sm"
              loading={saving}
              onClick={form.handleSubmit((d: GalleryFormData) => onSubmit(d, false))}
            >
              {isEdit ? 'Save changes' : 'Save as draft'}
            </Button>
            {!isEdit && (
              <Button
                icon={<Send size={14} />}
                size="sm"
                loading={saving}
                onClick={form.handleSubmit((d: GalleryFormData) => onSubmit(d, true))}
              >
                Save &amp; publish
              </Button>
            )}
          </>
        }
      />

      {error && (
        <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
          <p className="text-sm text-accent-warm">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Basic info */}
        <Card>
          <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Title" error={form.formState.errors.title?.message} {...form.register('title')} />
              <Input label="Slug" error={form.formState.errors.slug?.message} {...form.register('slug')} />
            </div>
            <Select label="Category" options={categoryOptions} {...form.register('category')} />
            <ImageUpload
              label="Cover image"
              value={form.watch('cover_image_url')}
              onChange={(url) =>
                form.setValue('cover_image_url', url ?? '', { shouldDirty: true })
              }
              bucket="gallery"
              folder="covers"
              aspect="4 / 3"
              hint="Shown on the homepage strip and on the public Gallery list. Landscape works best."
            />
          </CardContent>
        </Card>

        {/* Event details */}
        <Card>
          <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Event Date" type="date" {...form.register('event_date')} />
              <Input label="Venue Name" {...form.register('venue_name')} />
              <Input label="Location" {...form.register('location')} />
            </div>
          </CardContent>
        </Card>

        {/* Publishing */}
        <Card>
          <CardHeader><CardTitle>Publishing</CardTitle></CardHeader>
          <CardContent>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-border text-gold accent-gold"
                {...form.register('is_published')}
              />
              <span className="text-sm text-text">Published</span>
            </label>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
