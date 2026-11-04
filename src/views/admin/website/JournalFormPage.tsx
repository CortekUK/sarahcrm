'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
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
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Save } from 'lucide-react'
import { slugify } from '@/lib/marketing/blog-content'
import { toast } from '@/lib/hooks/use-toast'
import { dbErrorMessage, isHttpUrl, isValidSlug } from '@/lib/form-validation'
import { journalAuthorTypeLabels, journalStatusLabels, journalStrandLabels } from './JournalPage'

// blog_posts' Journal columns are not in the generated types yet — read via
// an untyped view of the browser client (admin RLS). Saves go through
// /api/admin/journal, which converts the Markdown to sanitised HTML.
const db = supabase as unknown as SupabaseClient

const STRANDS = ['press', 'founders_letter', 'stories', 'members'] as const
const VISIBILITIES = ['public', 'members'] as const
const AUTHOR_TYPES = ['sarah', 'member', 'guest'] as const
const STATUSES = ['published', 'unpublished', 'pending_review'] as const

interface PostRow {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body_markdown: string | null
  hero_image_url: string | null
  event_id: string | null
  status: string
  published_at: string | null
  strand: string | null
  visibility: string | null
  author_name: string | null
  author_type: string | null
  outlet: string | null
  original_url: string | null
  tags: string[] | null
  marketing_asset_id: string | null
}

const schema = z
  .object({
    strand: z.enum(STRANDS, { message: 'Choose a strand' }),
    title: z.string().trim().min(1, 'Title is required').max(200, 'Keep the title under 200 characters'),
    slug: z
      .string()
      .trim()
      .max(120, 'Keep the slug under 120 characters')
      .refine((v) => !v || isValidSlug(v), 'Lowercase letters, numbers and hyphens only'),
    visibility: z.enum(VISIBILITIES),
    author_type: z.enum(AUTHOR_TYPES),
    author_name: z.string().max(120).optional(),
    hero_image_url: z.string().optional(),
    excerpt: z.string().max(600, 'Keep the excerpt under 600 characters').optional(),
    body_markdown: z.string().max(100_000).optional(),
    outlet: z.string().max(120).optional(),
    original_url: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .refine((v) => !v || isHttpUrl(v), 'Enter a full link starting with https://'),
    published_at: z.string().optional(),
    tags: z.string().max(1000).optional(),
    event_id: z.string().optional(),
    status: z.enum(STATUSES),
  })
  .refine((d) => d.status !== 'published' || !!d.body_markdown?.trim() || !!d.excerpt?.trim(), {
    message: 'Add a body or an excerpt before publishing',
    path: ['body_markdown'],
  })

type FormData = z.infer<typeof schema>

const strandOptions = STRANDS.map((s) => ({ value: s, label: journalStrandLabels[s] }))
const visibilityOptions = [
  { value: 'public', label: 'Public' },
  { value: 'members', label: 'Members only' },
]
const authorTypeOptions = AUTHOR_TYPES.map((a) => ({ value: a, label: journalAuthorTypeLabels[a] }))
const statusOptions = STATUSES.map((s) => ({ value: s, label: journalStatusLabels[s] }))

const emptyValues: FormData = {
  strand: 'stories',
  title: '',
  slug: '',
  visibility: 'public',
  author_type: 'sarah',
  author_name: 'Sarah Restrick',
  hero_image_url: '',
  excerpt: '',
  body_markdown: '',
  outlet: '',
  original_url: '',
  published_at: '',
  tags: '',
  event_id: '',
  status: 'unpublished',
}

function pickEnum<T extends readonly string[]>(v: string | null | undefined, allowed: T, fallback: T[number]): T[number] {
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T[number]) : fallback
}

export function JournalFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const router = useRouter()
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<{ value: string; label: string }[]>([])
  const [fromAiEngine, setFromAiEngine] = useState(false)
  const slugTouched = useRef(isEdit)

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: emptyValues,
  })
  const errors = form.formState.errors

  const title = form.watch('title')
  const strand = form.watch('strand')
  const visibility = form.watch('visibility')
  const isPress = strand === 'press'

  useEffect(() => {
    if (!slugTouched.current && title?.trim()) {
      form.setValue('slug', slugify(title), { shouldValidate: true })
    }
  }, [title, form])

  // Members' Editorial is always members-only.
  useEffect(() => {
    if (strand === 'members' && visibility !== 'members') {
      form.setValue('visibility', 'members', { shouldDirty: true })
    }
  }, [strand, visibility, form])

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
    if (!isEdit || !id) return
    db.from('blog_posts')
      .select(
        'id, slug, title, excerpt, body_markdown, hero_image_url, event_id, status, published_at, strand, visibility, author_name, author_type, outlet, original_url, tags, marketing_asset_id',
      )
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) setError(dbErrorMessage(err, 'Could not load this post'))
        const row = data as PostRow | null
        if (row) {
          setFromAiEngine(!!row.marketing_asset_id)
          form.reset({
            strand: pickEnum(row.strand, STRANDS, 'stories'),
            title: row.title,
            slug: row.slug,
            visibility: pickEnum(row.visibility, VISIBILITIES, 'public'),
            author_type: pickEnum(row.author_type, AUTHOR_TYPES, 'sarah'),
            author_name: row.author_name ?? '',
            hero_image_url: row.hero_image_url ?? '',
            excerpt: row.excerpt ?? '',
            body_markdown: row.body_markdown ?? '',
            outlet: row.outlet ?? '',
            original_url: row.original_url ?? '',
            published_at: row.published_at ? row.published_at.slice(0, 10) : '',
            tags: (row.tags ?? []).join(', '),
            event_id: row.event_id ?? '',
            status: pickEnum(row.status, STATUSES, 'unpublished'),
          })
        }
        setLoading(false)
      })
  }, [id, isEdit, form])

  async function onSubmit(data: FormData) {
    setSaving(true)
    setError(null)
    const payload = {
      ...(isEdit ? { id } : {}),
      strand: data.strand,
      title: data.title.trim(),
      slug: data.slug.trim(),
      visibility: data.strand === 'members' ? 'members' : data.visibility,
      author_type: data.author_type,
      author_name: data.author_name?.trim() || null,
      hero_image_url: data.hero_image_url || null,
      excerpt: data.excerpt?.trim() || '',
      body_markdown: data.body_markdown ?? '',
      outlet: data.strand === 'press' ? data.outlet?.trim() || null : null,
      original_url: data.strand === 'press' ? data.original_url?.trim() || null : null,
      published_at: data.published_at || null,
      tags: (data.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      event_id: data.event_id || null,
      status: data.status,
    }
    try {
      const res = await fetch('/api/admin/journal', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; post?: { slug: string } }
      if (!res.ok) throw new Error(json.error ?? 'Failed to save the post')
      toast({
        title: isEdit ? 'Post saved' : 'Post created',
        description:
          json.post?.slug && json.post.slug !== payload.slug
            ? `${payload.title} — saved at /journal/${json.post.slug} (that address was taken).`
            : payload.title,
      })
      router.push('/dashboard/website/journal')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save the post'
      setError(msg)
      toast({ title: 'Post not saved', description: msg, variant: 'destructive' })
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading post...</span>
        </div>
      </div>
    )
  }

  const slugField = form.register('slug')

  return (
    <div className="p-8">
      <AdminPageHeader
        title={isEdit ? 'Edit post' : 'Write post'}
        description={
          fromAiEngine
            ? 'This post was created by the Marketing AI Engine. You can edit it here like any other Journal post.'
            : 'A Journal post: press coverage, a Founder’s Letter, a story from The Club, or Members’ Editorial.'
        }
        backHref="/dashboard/website/journal"
        breadcrumbs={[
          { label: 'Journal', href: '/dashboard/website/journal' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        actions={
          <Button icon={<Save size={14} />} size="sm" loading={saving} onClick={form.handleSubmit(onSubmit)}>
            {isEdit ? 'Save changes' : 'Save post'}
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
              <Select
                label="Strand"
                options={strandOptions}
                error={errors.strand?.message}
                {...form.register('strand')}
              />
              <Select
                label="Visibility"
                options={visibilityOptions}
                hint={
                  strand === 'members'
                    ? "Members' Editorial is always members only."
                    : 'Members-only posts are never shown to signed-out visitors.'
                }
                {...form.register('visibility')}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Title" error={errors.title?.message} {...form.register('title')} />
              <Input
                label="Slug"
                error={errors.slug?.message}
                hint="The page address: /journal/your-slug"
                {...slugField}
                onChange={(e) => {
                  slugTouched.current = true
                  return slugField.onChange(e)
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Author type" options={authorTypeOptions} {...form.register('author_type')} />
              <Input
                label="Author name"
                error={errors.author_name?.message}
                {...form.register('author_name')}
              />
            </div>
            <ImageUpload
              label="Hero image"
              value={form.watch('hero_image_url')}
              onChange={(url) => form.setValue('hero_image_url', url ?? '', { shouldDirty: true })}
              bucket="gallery"
              folder="journal"
              aspect="16 / 9"
              hint="Shown on the Journal card and at the top of the post. Landscape works best."
            />
          </CardContent>
        </Card>

        {isPress && (
          <Card>
            <CardHeader><CardTitle>Press</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Outlet"
                  hint="e.g. The Times, Tatler"
                  error={errors.outlet?.message}
                  {...form.register('outlet')}
                />
                <Input
                  label="Link to the original"
                  placeholder="https://"
                  error={errors.original_url?.message}
                  {...form.register('original_url')}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Content</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              label="Excerpt"
              rows={3}
              hint={
                isPress
                  ? 'A short paraphrase of the coverage — never the full article. Leave empty to use the first paragraph of the body.'
                  : 'Shown on the Journal card. Leave empty to use the first paragraph of the body.'
              }
              error={errors.excerpt?.message}
              {...form.register('excerpt')}
            />
            <Textarea
              label="Body"
              rows={18}
              className="font-mono text-[13px]"
              hint="Markdown: ## Heading, **bold**, *italic*, [link text](https://…), - bullet points, > quote. Leave a blank line between paragraphs."
              error={errors.body_markdown?.message}
              {...form.register('body_markdown')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Details &amp; Publishing</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <DateField
                label="Article date"
                value={form.watch('published_at') ?? ''}
                onChange={(v) => form.setValue('published_at', v, { shouldDirty: true })}
                placeholder="Set automatically when published"
              />
              <Select label="Status" options={statusOptions} {...form.register('status')} />
            </div>
            <Input
              label="Tags"
              placeholder="PITCH, Hospitality"
              hint="Comma-separated programme and sector tags, e.g. PITCH, Hospitality"
              error={errors.tags?.message}
              {...form.register('tags')}
            />
            <Select
              label="Related event (optional)"
              placeholder="None"
              options={[{ value: '', label: 'None' }, ...events]}
              {...form.register('event_id')}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => router.push('/dashboard/website/journal')}>
            Cancel
          </Button>
          <Button type="submit" icon={<Save size={14} />} loading={saving}>
            {isEdit ? 'Save changes' : 'Save post'}
          </Button>
        </div>
      </form>
    </div>
  )
}
