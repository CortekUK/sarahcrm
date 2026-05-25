'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { MediaPicker } from '@/components/ui/MediaPicker'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Thumbnail } from '@/components/admin/Thumbnail'
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  normalizeCloudinaryImageUrl,
  normalizeCloudinaryVideoUrl,
} from '@/lib/cms/cloudinary'
import { Pencil, Trash2, Film, ImageIcon, Plus } from 'lucide-react'
import type { Database } from '@/types/database'

type HeroSlide = Database['public']['Tables']['hero_slides']['Row']

// The full canonical list of pages the public site renders. Each one
// becomes a row in this admin page whether or not a hero_slides row
// exists for it — admin always sees the complete set and edits in place.
// `path` is the public URL we hit via /api/admin/revalidate after save
// so the new hero shows up immediately, not after the 60s window.
const PAGES: {
  value: string
  label: string
  description: string
  path: string
}[] = [
  { value: 'home', label: 'Homepage', description: 'The cinematic cold-open at /', path: '/' },
  { value: 'about', label: 'About', description: 'Sarah’s founder story at /about', path: '/about' },
  {
    value: 'memberships',
    label: 'Memberships',
    description: 'Pricing + tiers at /memberships',
    path: '/memberships',
  },
  { value: 'events', label: 'Events', description: 'The calendar at /events', path: '/events' },
  { value: 'gallery', label: 'Gallery', description: 'Past gatherings at /gallery', path: '/gallery' },
  {
    value: 'private-event-services',
    label: 'Private Events',
    description: 'Bespoke commissions at /private-event-services',
    path: '/private-event-services',
  },
  {
    value: 'contact-us',
    label: 'Contact',
    description: 'Enquiry form at /contact-us',
    path: '/contact-us',
  },
  {
    value: 'membership-application',
    label: 'Membership Application',
    description: 'The 8-step apply flow',
    path: '/membership-application',
  },
  {
    value: 'club-rules',
    label: 'Club Rules',
    description: 'The nine articles',
    path: '/club-rules',
  },
  {
    value: 'privacy-policy',
    label: 'Privacy Policy',
    description: 'The data notice',
    path: '/privacy-policy',
  },
]

function pageMeta(slug: string) {
  return PAGES.find((p) => p.value === slug)
}

// Modal schema — page_slug is mandatory but locked from the UI (it's
// chosen by which row the admin clicked Edit on). The .refine ensures
// the matching media URL is set for the chosen type.
const schema = z
  .object({
    page_slug: z.string().min(1),
    is_active: z.boolean(),
    media_type: z.enum(['image', 'video']),
    image_url: z.string().optional(),
    alt_text: z.string().optional(),
    video_url: z.string().optional(),
    video_poster_url: z.string().optional(),
    eyebrow: z.string().optional(),
    headline: z.string().optional(),
    lede: z.string().optional(),
    cta_primary_label: z.string().optional(),
    cta_primary_href: z.string().optional(),
    cta_secondary_label: z.string().optional(),
    cta_secondary_href: z.string().optional(),
  })
  .refine(
    (d) => {
      if (d.media_type === 'image') return Boolean(d.image_url)
      return Boolean(d.video_url)
    },
    {
      message: 'Please add the media (upload or paste a URL) before saving.',
      path: ['image_url'],
    },
  )

type FormData = z.infer<typeof schema>

export function HeroSlidesPage() {
  const confirm = useConfirm()
  const [items, setItems] = useState<HeroSlide[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      page_slug: '',
      is_active: true,
      media_type: 'image',
      image_url: '',
      alt_text: '',
      video_url: '',
      video_poster_url: '',
      eyebrow: '',
      headline: '',
      lede: '',
      cta_primary_label: '',
      cta_primary_href: '',
      cta_secondary_label: '',
      cta_secondary_href: '',
    },
  })

  useEffect(() => {
    fetchItems()
  }, [])

  // Each known page → existing hero row (display_order=0) or null. Built
  // here so the render loop never has to defend against missing rows.
  const heroByPage = useMemo(() => {
    const map = new Map<string, HeroSlide | null>()
    for (const p of PAGES) map.set(p.value, null)
    for (const h of items) {
      if (h.display_order === 0 && map.has(h.page_slug)) {
        map.set(h.page_slug, h)
      }
    }
    return map
  }, [items])

  useEffect(() => {
    if (!modalOpen || !editingSlug) return
    const existing = heroByPage.get(editingSlug)
    if (existing) {
      form.reset({
        page_slug: existing.page_slug,
        is_active: existing.is_active,
        media_type: (existing.media_type as 'image' | 'video') ?? 'image',
        image_url: existing.image_url ?? '',
        alt_text: existing.alt_text ?? '',
        video_url: existing.video_url ?? '',
        video_poster_url: existing.video_poster_url ?? '',
        eyebrow: existing.eyebrow ?? '',
        headline: existing.headline ?? '',
        lede: existing.lede ?? '',
        cta_primary_label: existing.cta_primary_label ?? '',
        cta_primary_href: existing.cta_primary_href ?? '',
        cta_secondary_label: existing.cta_secondary_label ?? '',
        cta_secondary_href: existing.cta_secondary_href ?? '',
      })
    } else {
      // Setting up a hero for the first time — start fresh with the page
      // pinned and active by default.
      form.reset({
        page_slug: editingSlug,
        is_active: true,
        media_type: 'image',
        image_url: '',
        alt_text: '',
        video_url: '',
        video_poster_url: '',
        eyebrow: '',
        headline: '',
        lede: '',
        cta_primary_label: '',
        cta_primary_href: '',
        cta_secondary_label: '',
        cta_secondary_href: '',
      })
    }
    setError(null)
  }, [modalOpen, editingSlug, heroByPage, form])

  async function fetchItems() {
    setLoading(true)
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
    // Source-of-truth rule: media_type wins. Whichever media URL doesn't
    // match the chosen type is force-cleared so a leftover JPG from a
    // previous "image" save can't show up in the row thumbnail or be
    // accidentally rendered by the public page. Video poster stays for
    // both (it's only used when media_type === 'video' anyway).
    const isVideo = data.media_type === 'video'
    // Cloudinary URLs without an f_auto,q_auto transformation deliver
    // the raw original file (hero videos can be 100 MB+) which kills
    // autoplay performance. Normalise on the way in so admins don't
    // have to remember the transformation pattern.
    const normalizedImage = data.image_url
      ? normalizeCloudinaryImageUrl(data.image_url)
      : null
    const normalizedVideo = data.video_url
      ? normalizeCloudinaryVideoUrl(data.video_url)
      : null
    const normalizedPoster = data.video_poster_url
      ? normalizeCloudinaryImageUrl(data.video_poster_url)
      : null

    const payload = {
      page_slug: data.page_slug,
      display_order: 0,
      is_active: data.is_active,
      media_type: data.media_type,
      image_url: isVideo ? null : normalizedImage,
      video_url: isVideo ? normalizedVideo : null,
      video_poster_url: isVideo ? normalizedPoster : null,
      alt_text: data.alt_text || null,
      eyebrow: data.eyebrow || null,
      headline: data.headline || null,
      lede: data.lede || null,
      cta_primary_label: data.cta_primary_label || null,
      cta_primary_href: data.cta_primary_href || null,
      cta_secondary_label: data.cta_secondary_label || null,
      cta_secondary_href: data.cta_secondary_href || null,
    }
    try {
      const existing = heroByPage.get(data.page_slug)
      if (existing) {
        const { error: err } = await supabase
          .from('hero_slides')
          .update(payload)
          .eq('id', existing.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('hero_slides').insert(payload)
        if (err) throw err
      }
      setModalOpen(false)
      setEditingSlug(null)
      fetchItems()
      // Flush the public page's ISR cache so the admin sees the new
      // hero right away instead of waiting for the 60s revalidate
      // window. Fire-and-forget — failures here are silent because
      // the save itself succeeded and the cache will catch up naturally.
      const path = pageMeta(data.page_slug)?.path
      if (path) {
        fetch('/api/admin/revalidate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ paths: [path] }),
        }).catch(() => {})
      }
      toast({
        title: 'Hero saved',
        description: `${pageMeta(data.page_slug)?.label ?? data.page_slug} updated. The public page will refresh on its next visit.`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetToDefault(slug: string) {
    const existing = heroByPage.get(slug)
    if (!existing) return
    const ok = await confirm({
      title: `Reset ${pageMeta(slug)?.label ?? slug} hero?`,
      description: (
        <span>
          The custom hero you set for this page will be removed and the public site falls back to
          the hardcoded default. You can set it up again any time. This action does not delete other
          slides if there were ever any extra ones — only the main hero.
        </span>
      ),
      confirmLabel: 'Reset to default',
      tone: 'danger',
    })
    if (!ok) return
    const { error: err } = await supabase.from('hero_slides').delete().eq('id', existing.id)
    if (err) {
      toast({ title: 'Reset failed', description: err.message, variant: 'destructive' })
      return
    }
    toast({
      title: 'Hero reset',
      description: `${pageMeta(slug)?.label ?? slug} is back to its default.`,
    })
    fetchItems()
    // Same fire-and-forget flush as save — the deleted row leaves the
    // page on its hardcoded fallback, which we want visible immediately.
    const path = pageMeta(slug)?.path
    if (path) {
      fetch('/api/admin/revalidate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paths: [path] }),
      }).catch(() => {})
    }
  }

  async function handleToggleActive(item: HeroSlide, next: boolean) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: next } : i)))
    const { error: err } = await supabase
      .from('hero_slides')
      .update({ is_active: next })
      .eq('id', item.id)
    if (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !next } : i)))
      toast({ title: 'Toggle failed', description: err.message, variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading heroes…</span>
        </div>
      </div>
    )
  }

  const liveCount = Array.from(heroByPage.values()).filter(
    (h) => h && h.is_active,
  ).length

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <AdminPageHeader
        title="Page heroes"
        description="The cinematic top section on each public page — image or video, with eyebrow + headline + lede + optional CTAs. The page list is fixed (one hero per page); edit any row to change what visitors see. Pages without a custom hero render their built-in defaults."
        meta={
          <span className="text-xs text-text-dim">
            {PAGES.length} pages · {liveCount} customised
          </span>
        }
      />

      <Card>
        <CardContent className="p-0">
          {PAGES.map((page, idx) => {
            const hero = heroByPage.get(page.value)
            const isLast = idx === PAGES.length - 1
            return (
              <div
                key={page.value}
                className={cn(
                  'flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-4 group hover:bg-surface-2/50 transition-colors',
                  !isLast && 'border-b border-border',
                )}
              >
                <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                  {/* Thumb or placeholder slot */}
                  <div className="relative flex-shrink-0">
                    {hero ? (
                      <>
                        <Thumbnail
                          // Video heroes show their poster (or the URL itself
                          // if no poster is set); image heroes show the image.
                          // Without this branch a stale image_url from an
                          // earlier media-type swap would mask the actual
                          // active poster.
                          src={
                            hero.media_type === 'video'
                              ? (hero.video_poster_url ?? hero.image_url)
                              : (hero.image_url ?? hero.video_poster_url)
                          }
                          alt={hero.alt_text ?? hero.headline ?? page.label}
                          aspect="16 / 9"
                          width={96}
                        />
                        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-ink/85 text-ivory-soft border border-graphite-line/60">
                          {hero.media_type === 'video' ? (
                            <Film size={10} strokeWidth={1.8} />
                          ) : (
                            <ImageIcon size={10} strokeWidth={1.8} />
                          )}
                        </span>
                      </>
                    ) : (
                      <div className="w-24 aspect-[16/9] rounded bg-surface-2 border border-dashed border-border flex items-center justify-center text-text-dim">
                        <ImageIcon size={16} strokeWidth={1.4} />
                      </div>
                    )}
                  </div>

                  {/* Page label + hero summary */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-text">{page.label}</p>
                      {!hero && (
                        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-dim bg-surface-2 border border-border px-2 py-0.5 rounded-full">
                          Using default
                        </span>
                      )}
                      {hero && !hero.is_active && (
                        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-accent-warm bg-[rgba(196,105,74,0.1)] border border-[rgba(196,105,74,0.25)] px-2 py-0.5 rounded-full">
                          Hidden
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-text-dim">{page.description}</p>
                    {hero?.headline && (
                      <p className="mt-1.5 text-[13px] text-text-muted truncate">
                        <span className="text-text font-medium">{hero.headline}</span>
                        {hero.lede && (
                          <span className="text-text-dim italic"> · {hero.lede}</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-3 flex-shrink-0">
                  {hero && (
                    <ActiveToggle
                      active={hero.is_active}
                      onChange={(next) => handleToggleActive(hero, next)}
                    />
                  )}
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={hero ? 'secondary' : 'primary'}
                      icon={hero ? <Pencil size={13} /> : <Plus size={13} />}
                      onClick={() => {
                        setEditingSlug(page.value)
                        setModalOpen(true)
                      }}
                    >
                      {hero ? 'Edit' : 'Customise'}
                    </Button>
                    {hero && (
                      <button
                        type="button"
                        onClick={() => handleResetToDefault(page.value)}
                        className="p-1.5 text-text-dim hover:text-accent-warm rounded hover:bg-surface-2 transition-colors"
                        title="Reset to built-in default"
                        aria-label="Reset to default"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingSlug(null)
        }}
        title={
          editingSlug
            ? `${pageMeta(editingSlug)?.label ?? editingSlug} hero`
            : 'Hero'
        }
        size="xl"
      >
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Locked page badge — admin sees which page they're editing.
             page_slug is registered as a hidden field; the select is
             gone because rows are 1:1 to pages now. */}
          <input type="hidden" {...form.register('page_slug')} />
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-text-dim">
                Editing
              </p>
              <p className="text-sm font-medium text-text mt-0.5">
                {pageMeta(editingSlug ?? '')?.label}
              </p>
              <p className="text-[11.5px] text-text-muted mt-0.5">
                {pageMeta(editingSlug ?? '')?.description}
              </p>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-border text-gold accent-gold"
                {...form.register('is_active')}
              />
              <span className="text-sm text-text">Live</span>
            </label>
          </div>

          {/* Media */}
          <div>
            <p className="font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.22em] text-text-dim mb-3">
              Background media
            </p>
            <HeroMediaPicker form={form} />
            {form.formState.errors.image_url && (
              <p className="mt-1.5 text-[11px] text-accent-warm">
                {form.formState.errors.image_url.message}
              </p>
            )}
            <div className="mt-4">
              <Input
                label="Alt text"
                hint="For screen readers + SEO. Recommended for any non-decorative hero."
                {...form.register('alt_text')}
              />
            </div>
          </div>

          {/* Text overlay */}
          <div>
            <p className="font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.22em] text-text-dim mb-3">
              Text overlay
            </p>
            <div className="space-y-4">
              <Input
                label="Eyebrow"
                placeholder="e.g. At The Club"
                hint="Small-caps tag above the headline. Leave blank to hide."
                {...form.register('eyebrow')}
              />
              <Input
                label="Headline"
                placeholder="e.g. Memberships."
                hint="The big display title."
                {...form.register('headline')}
              />
              <Textarea
                label="Lede"
                rows={3}
                placeholder="A short italic paragraph that sets the tone for the page."
                hint="Hidden if blank."
                {...form.register('lede')}
              />
            </div>
          </div>

          {/* CTAs */}
          <div>
            <p className="font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.22em] text-text-dim mb-3">
              Call-to-action buttons (optional)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Primary label"
                placeholder="Apply for Membership"
                {...form.register('cta_primary_label')}
              />
              <Input
                label="Primary link"
                placeholder="/membership-application"
                {...form.register('cta_primary_href')}
              />
              <Input
                label="Secondary label"
                placeholder="Discover The Club"
                {...form.register('cta_secondary_label')}
              />
              <Input
                label="Secondary link"
                placeholder="/about"
                {...form.register('cta_secondary_href')}
              />
            </div>
            <p className="mt-3 text-[11px] text-text-dim">
              Each CTA hides if either its label or link is blank. Only used by the homepage hero
              today, but kept available for future page additions.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 border-t border-border mt-5 -mx-6 px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setModalOpen(false)
                setEditingSlug(null)
              }}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving} className="flex-1 sm:flex-none">
              Save changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ─── HeroMediaPicker — isolated useWatch subscription ─────────────────
// Wrapping the MediaPicker in its own subcomponent that calls useWatch
// means the picker re-renders the moment any of (image_url, video_url,
// video_poster_url, media_type) changes — including when the upload
// finishes via onChange. The old form.watch(...) calls inline in the
// parent JSX subscribed inconsistently because react-hook-form has to
// see them in the active render tree, which under some action sequences
// it didn't. useWatch establishes an explicit subscription that fires
// reliably.

function HeroMediaPicker({
  form,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any
}) {
  const mediaType = useWatch({ control: form.control, name: 'media_type' }) as
    | 'image'
    | 'video'
  const imageUrl = (useWatch({ control: form.control, name: 'image_url' }) as
    | string
    | undefined) ?? ''
  const videoUrl = (useWatch({ control: form.control, name: 'video_url' }) as
    | string
    | undefined) ?? ''
  const videoPosterUrl = (useWatch({
    control: form.control,
    name: 'video_poster_url',
  }) as string | undefined) ?? ''

  return (
    <MediaPicker
      value={mediaType === 'image' ? imageUrl : videoUrl}
      onChange={(url) => {
        if (form.getValues('media_type') === 'image') {
          form.setValue('image_url', url, { shouldValidate: true, shouldDirty: true })
        } else {
          form.setValue('video_url', url, { shouldValidate: true, shouldDirty: true })
        }
      }}
      mediaType={mediaType}
      onMediaTypeChange={(t) => form.setValue('media_type', t, { shouldDirty: true })}
      posterUrl={videoPosterUrl}
      onPosterUrlChange={(url) =>
        form.setValue('video_poster_url', url, { shouldDirty: true })
      }
      bucket="heroes"
      folder=""
      hint="Wide 16:9 crops work best — videos should be muted-loopable (mp4 or webm)."
    />
  )
}
