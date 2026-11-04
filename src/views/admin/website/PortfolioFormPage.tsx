'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { DateField } from '@/components/ui/DateField'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { MultiImageUpload } from '@/components/ui/MultiImageUpload'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ArrowDown, ArrowUp, Plus, Save, X } from 'lucide-react'
import { slugify } from '@/lib/utils'
import { toast } from '@/lib/hooks/use-toast'
import { dbErrorMessage, isHttpUrl, isValidSlug } from '@/lib/form-validation'
import { flushPortfolioCache, portfolioCategoryLabels } from './PortfolioPage'

// portfolio_case_studies is not in the generated Database types yet — see
// PortfolioPage.tsx. Untyped view of the browser client; admin RLS applies.
const db = supabase as unknown as SupabaseClient

const CATEGORIES = ['member_event', 'brand_activation', 'curated_experience', 'private_corporate', 'pitch'] as const
const LAYOUTS = ['full', 'half'] as const

interface CaseStudyRow {
  id: string
  slug: string
  title: string
  partner_names: string | null
  category: string
  location: string | null
  event_date: string | null
  date_label: string | null
  headline_result: string | null
  hero_image_url: string | null
  hero_video_url: string | null
  brief: string | null
  delivered: unknown
  results: unknown
  gallery_urls: string[] | null
  partner_quote: string | null
  partner_quote_by: string | null
  layout: string
  display_order: number
  is_featured: boolean
  is_published: boolean
  event_id: string | null
}

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Keep the title under 200 characters'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .max(120, 'Keep the slug under 120 characters')
    .refine(isValidSlug, 'Lowercase letters, numbers and hyphens only (e.g. summer-party-2026)'),
  partner_names: z.string().max(300).optional(),
  category: z.enum(CATEGORIES, { message: 'Choose a category' }),
  location: z.string().max(200).optional(),
  event_date: z.string().optional(),
  date_label: z.string().max(60).optional(),
  headline_result: z.string().max(200, 'One line — under 200 characters').optional(),
  hero_image_url: z.string().optional(),
  hero_video_url: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isHttpUrl(v), 'Enter a full link starting with https://'),
  brief: z.string().max(2000).optional(),
  delivered: z.array(z.object({ value: z.string().max(300) })),
  results: z.array(z.object({ figure: z.string().max(40), label: z.string().max(120) })),
  gallery_urls: z.array(z.string()),
  partner_quote: z.string().max(1500).optional(),
  partner_quote_by: z.string().max(200).optional(),
  layout: z.enum(LAYOUTS),
  display_order: z.coerce.number().int().min(0),
  is_featured: z.boolean(),
  is_published: z.boolean(),
  event_id: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: portfolioCategoryLabels[c] }))
const layoutOptions = [
  { value: 'half', label: 'Half width' },
  { value: 'full', label: 'Full width' },
]

const emptyValues: FormData = {
  title: '',
  slug: '',
  partner_names: '',
  category: 'member_event',
  location: '',
  event_date: '',
  date_label: '',
  headline_result: '',
  hero_image_url: '',
  hero_video_url: '',
  brief: '',
  delivered: [],
  results: [],
  gallery_urls: [],
  partner_quote: '',
  partner_quote_by: '',
  layout: 'half',
  display_order: 0,
  is_featured: false,
  is_published: false,
  event_id: '',
}

function toDelivered(v: unknown): { value: string }[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((value) => ({ value })) : []
}

function toResults(v: unknown): { figure: string; label: string }[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({ figure: String(x.figure ?? ''), label: String(x.label ?? '') }))
}

function MoveButtons({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number
  count: number
  onMove: (from: number, to: number) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <button
        type="button"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        className="p-1.5 text-text-dim hover:text-text rounded hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        title="Move up"
      >
        <ArrowUp size={14} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
        className="p-1.5 text-text-dim hover:text-text rounded hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        title="Move down"
      >
        <ArrowDown size={14} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-text-dim hover:text-accent-warm rounded hover:bg-surface-2 transition-colors"
        title="Remove"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  )
}

export function PortfolioFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const router = useRouter()
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<{ value: string; label: string }[]>([])
  // Slug follows the title until the admin edits it by hand (or, when
  // editing an existing case study, from the start — its URL is live).
  const slugTouched = useRef(isEdit)

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: emptyValues,
  })
  const delivered = useFieldArray({ control: form.control, name: 'delivered' })
  const results = useFieldArray({ control: form.control, name: 'results' })
  const errors = form.formState.errors

  const title = form.watch('title')
  useEffect(() => {
    if (!slugTouched.current && title) {
      form.setValue('slug', slugify(title), { shouldValidate: true })
    }
  }, [title, form])

  // Related-event picker.
  useEffect(() => {
    supabase
      .from('events')
      .select('id, title, start_date')
      .order('start_date', { ascending: false, nullsFirst: false })
      .limit(500)
      .then(({ data }) => {
        setEvents(
          (data ?? []).map((e) => ({
            value: e.id,
            label: e.start_date
              ? `${e.title} — ${new Date(e.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : e.title,
          })),
        )
      })
  }, [])

  useEffect(() => {
    if (!isEdit) {
      // New rows go to the end of the list.
      db.from('portfolio_case_studies')
        .select('id', { count: 'exact', head: true })
        .then(({ count }) => {
          if (typeof count === 'number') form.setValue('display_order', count)
        })
      return
    }
    db.from('portfolio_case_studies')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) setError(dbErrorMessage(err, 'Could not load this case study'))
        const row = data as CaseStudyRow | null
        if (row) {
          form.reset({
            title: row.title,
            slug: row.slug,
            partner_names: row.partner_names ?? '',
            category: (CATEGORIES as readonly string[]).includes(row.category)
              ? (row.category as FormData['category'])
              : 'member_event',
            location: row.location ?? '',
            event_date: row.event_date ? row.event_date.split('T')[0] : '',
            date_label: row.date_label ?? '',
            headline_result: row.headline_result ?? '',
            hero_image_url: row.hero_image_url ?? '',
            hero_video_url: row.hero_video_url ?? '',
            brief: row.brief ?? '',
            delivered: toDelivered(row.delivered),
            results: toResults(row.results),
            gallery_urls: row.gallery_urls ?? [],
            partner_quote: row.partner_quote ?? '',
            partner_quote_by: row.partner_quote_by ?? '',
            layout: row.layout === 'full' ? 'full' : 'half',
            display_order: row.display_order,
            is_featured: row.is_featured,
            is_published: row.is_published,
            event_id: row.event_id ?? '',
          })
        }
        setLoading(false)
      })
  }, [id, isEdit, form])

  async function onSubmit(data: FormData) {
    setSaving(true)
    setError(null)
    const payload = {
      title: data.title.trim(),
      slug: data.slug.trim(),
      partner_names: data.partner_names?.trim() || null,
      category: data.category,
      location: data.location?.trim() || null,
      event_date: data.event_date || null,
      date_label: data.date_label?.trim() || null,
      headline_result: data.headline_result?.trim() || null,
      hero_image_url: data.hero_image_url || null,
      hero_video_url: data.hero_video_url?.trim() || null,
      brief: data.brief?.trim() || null,
      delivered: data.delivered.map((d) => d.value.trim()).filter(Boolean),
      results: data.results
        .map((r) => ({ figure: r.figure.trim(), label: r.label.trim() }))
        .filter((r) => r.figure || r.label),
      gallery_urls: data.gallery_urls,
      partner_quote: data.partner_quote?.trim() || null,
      partner_quote_by: data.partner_quote_by?.trim() || null,
      layout: data.layout,
      display_order: data.display_order,
      is_featured: data.is_featured,
      is_published: data.is_published,
      event_id: data.event_id || null,
    }
    try {
      if (isEdit && id) {
        const { error: err } = await db.from('portfolio_case_studies').update(payload).eq('id', id)
        if (err) throw err
      } else {
        const { error: err } = await db.from('portfolio_case_studies').insert(payload)
        if (err) throw err
      }
      flushPortfolioCache(payload.slug)
      toast({ title: isEdit ? 'Case study saved' : 'Case study added', description: payload.title })
      router.push('/dashboard/website/portfolio')
    } catch (err) {
      const code = (err as { code?: string } | null)?.code
      const msg =
        code === '23505'
          ? 'Another case study already uses this slug — pick a different one.'
          : dbErrorMessage(err, 'Failed to save the case study')
      if (code === '23505') form.setError('slug', { message: msg })
      setError(msg)
      toast({ title: 'Case study not saved', description: msg, variant: 'destructive' })
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading case study...</span>
        </div>
      </div>
    )
  }

  const slugField = form.register('slug')

  return (
    <div className="p-8">
      <AdminPageHeader
        title={isEdit ? 'Edit case study' : 'Add case study'}
        description="A Portfolio case study: the brief, what The Club delivered, the results and the partner's words."
        backHref="/dashboard/website/portfolio"
        breadcrumbs={[
          { label: 'Portfolio', href: '/dashboard/website/portfolio' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        actions={
          <Button icon={<Save size={14} />} size="sm" loading={saving} onClick={form.handleSubmit(onSubmit)}>
            {isEdit ? 'Save changes' : 'Save case study'}
          </Button>
        }
      />

      {error && (
        <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
          <p className="text-sm text-accent-warm">{error}</p>
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Title" error={errors.title?.message} {...form.register('title')} />
              <Input
                label="Slug"
                error={errors.slug?.message}
                hint="The page address: /portfolio/your-slug"
                {...slugField}
                onChange={(e) => {
                  slugTouched.current = true
                  return slugField.onChange(e)
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Partner names"
                hint="e.g. Aston Martin × Bollinger"
                error={errors.partner_names?.message}
                {...form.register('partner_names')}
              />
              <Select
                label="Category"
                options={categoryOptions}
                error={errors.category?.message}
                {...form.register('category')}
              />
            </div>
            <Input
              label="Headline result"
              hint="One line for the card, e.g. “£1.5m in sales on the night”"
              error={errors.headline_result?.message}
              {...form.register('headline_result')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>When &amp; Where</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <DateField
                label="Event date (optional)"
                value={form.watch('event_date') ?? ''}
                onChange={(v) => form.setValue('event_date', v, { shouldDirty: true })}
              />
              <Input
                label="Date label"
                hint="Shown on the card, e.g. “Sep 2025” or “12 months”"
                error={errors.date_label?.message}
                {...form.register('date_label')}
              />
              <Input label="Location" error={errors.location?.message} {...form.register('location')} />
            </div>
            <Select
              label="Related event (optional)"
              placeholder="None"
              options={[{ value: '', label: 'None' }, ...events]}
              {...form.register('event_id')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Media</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ImageUpload
              label="Hero image"
              value={form.watch('hero_image_url')}
              onChange={(url) => form.setValue('hero_image_url', url ?? '', { shouldDirty: true })}
              bucket="gallery"
              folder="portfolio"
              aspect="16 / 9"
              hint="Shown on the Portfolio card and at the top of the case study. Landscape works best."
            />
            <Input
              label="Hero video (optional)"
              placeholder="https://"
              hint="A YouTube link or an .mp4 file link — plays in place of the hero image."
              error={errors.hero_video_url?.message}
              {...form.register('hero_video_url')}
            />
            <MultiImageUpload
              label="Gallery"
              value={form.watch('gallery_urls')}
              onChange={(urls) => form.setValue('gallery_urls', urls, { shouldDirty: true })}
              bucket="gallery"
              folder="portfolio"
              hint="6–12 images work best."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>The Story</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <Textarea
              label="The brief"
              rows={3}
              hint="2–3 sentences: what the partner came to The Club for."
              error={errors.brief?.message}
              {...form.register('brief')}
            />

            <div className="space-y-2">
              <p className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
                What we delivered
              </p>
              {delivered.fields.length === 0 && (
                <p className="text-xs text-text-dim">No points yet — e.g. “Venue: The Ritz, private dining room”.</p>
              )}
              {delivered.fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="e.g. Curated guest list of 40 The Club Members"
                      error={errors.delivered?.[index]?.value?.message}
                      {...form.register(`delivered.${index}.value` as const)}
                    />
                  </div>
                  <MoveButtons
                    index={index}
                    count={delivered.fields.length}
                    onMove={delivered.move}
                    onRemove={() => delivered.remove(index)}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => delivered.append({ value: '' })}
              >
                Add point
              </Button>
            </div>

            <div className="space-y-2">
              <p className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
                Results
              </p>
              <p className="text-xs text-text-dim">3–4 stat tiles, e.g. figure “£1.5m”, label “in sales”.</p>
              {results.fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <div className="w-40">
                    <Input
                      placeholder="Figure"
                      error={errors.results?.[index]?.figure?.message}
                      {...form.register(`results.${index}.figure` as const)}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      placeholder="Label"
                      error={errors.results?.[index]?.label?.message}
                      {...form.register(`results.${index}.label` as const)}
                    />
                  </div>
                  <MoveButtons
                    index={index}
                    count={results.fields.length}
                    onMove={results.move}
                    onRemove={() => results.remove(index)}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => results.append({ figure: '', label: '' })}
              >
                Add result
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Textarea
                  label="Partner quote (optional)"
                  rows={3}
                  error={errors.partner_quote?.message}
                  {...form.register('partner_quote')}
                />
              </div>
              <Input
                label="Quote by"
                hint="Name, role and company"
                error={errors.partner_quote_by?.message}
                {...form.register('partner_quote_by')}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Publishing</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Layout"
                hint="How wide the card sits in the Portfolio's editorial grid."
                options={layoutOptions}
                {...form.register('layout')}
              />
              <Input
                label="Display order"
                type="number"
                min={0}
                hint="Lower numbers show first. You can also drag rows on the list."
                error={errors.display_order?.message}
                {...form.register('display_order')}
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-border text-gold accent-gold"
                {...form.register('is_featured')}
              />
              <span className="text-sm text-text">Show on homepage — Recent Nights</span>
            </label>
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

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => router.push('/dashboard/website/portfolio')}>
            Cancel
          </Button>
          <Button type="submit" icon={<Save size={14} />} loading={saving}>
            {isEdit ? 'Save changes' : 'Save case study'}
          </Button>
        </div>
      </form>
    </div>
  )
}
