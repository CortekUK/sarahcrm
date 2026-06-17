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
import { toast } from '@/lib/hooks/use-toast'
import { Plus, Pencil, Trash2, Instagram, ExternalLink, Save } from 'lucide-react'
import type { Database } from '@/types/database'

type Settings = Database['public']['Tables']['instagram_settings']['Row']
type Post = Database['public']['Tables']['instagram_posts']['Row']

// Both the homepage and the about page render <InstagramChapter />,
// so we revalidate both on any change so the new content appears
// without waiting for the 60s ISR window.
function flushPublicPages() {
  void fetch('/api/admin/revalidate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths: ['/', '/about'] }),
  }).catch(() => {})
}

// ─── Settings form schema ────────────────────────────────────────────

const settingsSchema = z.object({
  handle: z.string().optional(),
  display_name: z.string().optional(),
  profile_url: z.string().optional(),
  avatar_url: z.string().optional(),
  bio: z.string().optional(),
  follower_count: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  is_active: z.boolean(),
})

type SettingsFormData = z.infer<typeof settingsSchema>

// ─── Post form schema ────────────────────────────────────────────────

// One of image_url or post_url is required. A tile with only a URL is
// rendered as a graphite "link card" on the public chapter. This keeps
// the admin moving fast when she only has the IG post links and hasn't
// downloaded the images yet.
const postSchema = z
  .object({
    image_url: z.string().optional(),
    caption: z.string().optional(),
    post_url: z.string().optional(),
    display_order: z.coerce.number().int().min(0),
    is_active: z.boolean(),
  })
  .refine((d) => Boolean(d.image_url) || Boolean(d.post_url), {
    message: 'Add an image, a post URL, or both — at least one is required.',
    path: ['image_url'],
  })

type PostFormData = z.infer<typeof postSchema>

export function InstagramAdminPage() {
  const confirm = useConfirm()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [postModalOpen, setPostModalOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [savingPost, setSavingPost] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)

  const settingsForm = useForm<SettingsFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(settingsSchema) as any,
    defaultValues: {
      handle: '',
      display_name: '',
      profile_url: '',
      avatar_url: '',
      bio: '',
      follower_count: undefined,
      is_active: true,
    },
  })

  const postForm = useForm<PostFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(postSchema) as any,
    defaultValues: {
      image_url: '',
      caption: '',
      post_url: '',
      display_order: 0,
      is_active: true,
    },
  })

  useEffect(() => {
    fetchAll()
  }, [])

  useEffect(() => {
    if (!postModalOpen) return
    if (editingPost) {
      postForm.reset({
        image_url: editingPost.image_url ?? '',
        caption: editingPost.caption ?? '',
        post_url: editingPost.post_url ?? '',
        display_order: editingPost.display_order,
        is_active: editingPost.is_active,
      })
    } else {
      postForm.reset({
        image_url: '',
        caption: '',
        post_url: '',
        display_order: posts.length,
        is_active: true,
      })
    }
    setPostError(null)
  }, [postModalOpen, editingPost, posts.length, postForm])

  async function fetchAll() {
    setLoading(true)
    const [settingsRes, postsRes] = await Promise.all([
      supabase.from('instagram_settings').select('*').limit(1).maybeSingle(),
      supabase.from('instagram_posts').select('*').order('display_order', { ascending: true }),
    ])
    const s = settingsRes.data as Settings | null
    setSettings(s)
    setPosts((postsRes.data as Post[]) ?? [])
    if (s) {
      settingsForm.reset({
        handle: s.handle ?? '',
        display_name: s.display_name ?? '',
        profile_url: s.profile_url ?? '',
        avatar_url: s.avatar_url ?? '',
        bio: s.bio ?? '',
        follower_count: s.follower_count ?? undefined,
        is_active: s.is_active,
      })
    }
    setLoading(false)
  }

  async function onSaveSettings(data: SettingsFormData) {
    setSavingSettings(true)
    const payload = {
      handle: data.handle || null,
      display_name: data.display_name || null,
      profile_url: data.profile_url || null,
      avatar_url: data.avatar_url || null,
      bio: data.bio || null,
      follower_count: typeof data.follower_count === 'number' ? data.follower_count : null,
      is_active: data.is_active,
      updated_at: new Date().toISOString(),
    }
    try {
      if (settings) {
        const { error: err } = await supabase
          .from('instagram_settings')
          .update(payload)
          .eq('id', settings.id)
        if (err) throw err
      } else {
        const { data: inserted, error: err } = await supabase
          .from('instagram_settings')
          .insert(payload)
          .select()
          .single()
        if (err) throw err
        setSettings(inserted as Settings)
      }
      toast({ title: 'Profile saved' })
      flushPublicPages()
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSavingSettings(false)
    }
  }

  async function onSavePost(data: PostFormData) {
    setSavingPost(true)
    setPostError(null)
    const payload = {
      image_url: data.image_url || null,
      caption: data.caption || null,
      post_url: data.post_url || null,
      display_order: data.display_order,
      is_active: data.is_active,
    }
    try {
      if (editingPost) {
        const { error: err } = await supabase
          .from('instagram_posts')
          .update(payload)
          .eq('id', editingPost.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('instagram_posts').insert(payload)
        if (err) throw err
      }
      setPostModalOpen(false)
      setEditingPost(null)
      await fetchAll()
      flushPublicPages()
    } catch (e) {
      setPostError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSavingPost(false)
    }
  }

  async function handleDeletePost(id: string) {
    const post = posts.find((p) => p.id === id)
    const ok = await confirm({
      title: 'Remove this Instagram tile?',
      description: post
        ? 'It will disappear from the public Instagram chapter on the homepage and about page. This cannot be undone.'
        : 'This cannot be undone.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('instagram_posts').delete().eq('id', id)
    setPosts((prev) => prev.filter((p) => p.id !== id))
    flushPublicPages()
  }

  async function handleTogglePostActive(post: Post, next: boolean) {
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_active: next } : p)))
    const { error: err } = await supabase
      .from('instagram_posts')
      .update({ is_active: next })
      .eq('id', post.id)
    if (err) {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_active: !next } : p)))
      return
    }
    flushPublicPages()
  }

  async function handleReorder(next: Post[]) {
    setPosts(next)
    await Promise.all(
      next.map((p) =>
        supabase
          .from('instagram_posts')
          .update({ display_order: p.display_order })
          .eq('id', p.id),
      ),
    )
    flushPublicPages()
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading Instagram…</span>
        </div>
      </div>
    )
  }

  const activeCount = posts.filter((p) => p.is_active).length

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Instagram"
        description="The Instagram chapter shown on the homepage and the About page. Set the profile bits (handle, name, bio, avatar, follower count) then add up to nine tiles — the chapter renders the first six. Drag to reorder; toggle inactive to hide without deleting."
        meta={
          <span className="text-xs text-text-dim">
            {posts.length} tile{posts.length !== 1 ? 's' : ''} · {activeCount} active
          </span>
        }
      />

      {/* ── Profile / settings ───────────────────────────────── */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
                Profile
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Shown in the left column of the chapter, with the &quot;Follow on Instagram&quot;
                CTA.
              </p>
            </div>
          </div>

          <form
            onSubmit={settingsForm.handleSubmit(onSaveSettings)}
            className="space-y-5"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ImageUpload
                label="Avatar"
                value={settingsForm.watch('avatar_url')}
                onChange={(url) =>
                  settingsForm.setValue('avatar_url', url ?? '', {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                bucket="content"
                folder="instagram/avatar"
                aspect="1 / 1"
                hint="Square. Will be rendered as a circle."
              />
              <div className="space-y-4">
                <Input
                  label="Display name"
                  placeholder="The Club by Sarah Restrick"
                  {...settingsForm.register('display_name')}
                />
                <Input
                  label="Handle"
                  placeholder="@theclubbysarahrestrick"
                  {...settingsForm.register('handle')}
                />
                <Input
                  label="Followers"
                  placeholder="12000"
                  type="number"
                  min={0}
                  step={1}
                  hint="Numeric only. We format it (12.3K, 1.2M)."
                  {...settingsForm.register('follower_count')}
                />
              </div>
            </div>

            <Input
              label="Profile URL"
              placeholder="https://instagram.com/theclubbysarahrestrick"
              hint="Where 'Follow on Instagram' (and tiles without their own URL) link to."
              {...settingsForm.register('profile_url')}
            />

            <Textarea
              label="Bio"
              rows={2}
              placeholder="A private members club. Curated evenings, real introductions."
              {...settingsForm.register('bio')}
            />

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-border text-gold accent-gold"
                {...settingsForm.register('is_active')}
              />
              <span className="text-sm text-text">
                Show the Instagram chapter on the public site
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              {settings?.profile_url && (
                <a
                  href={settings.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-gold"
                >
                  <ExternalLink size={12} />
                  Open profile
                </a>
              )}
              <Button type="submit" icon={<Save size={14} />} loading={savingSettings}>
                Save profile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Tiles (hidden per request) ───────────────────────────
          Wrapped in `false` so the whole section is hidden without
          deleting it — flip to `true` to bring it back. */}
      {false && (
      <>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
            Tiles
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            The first six active tiles render on the public site, in this order.
          </p>
        </div>
        <Button
          icon={<Plus size={14} />}
          onClick={() => {
            setEditingPost(null)
            setPostModalOpen(true)
          }}
        >
          Add tile
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {posts.length === 0 ? (
            <AdminEmptyState
              icon={Instagram}
              title="No tiles yet"
              description="Upload your first Instagram image. We render up to six in a 3×2 grid on the public chapter."
              action={
                <Button
                  icon={<Plus size={14} />}
                  onClick={() => {
                    setEditingPost(null)
                    setPostModalOpen(true)
                  }}
                >
                  Add your first tile
                </Button>
              }
            />
          ) : (
            <SortableList
              items={posts}
              onReorder={handleReorder}
              renderItem={(post, dragHandleProps) => {
                const idx = posts.findIndex((p) => p.id === post.id)
                return (
                <div
                  key={post.id}
                  className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-b-0"
                >
                  <DragHandle dragHandleProps={dragHandleProps} />
                  <Thumbnail src={post.image_url} alt={post.caption ?? 'Instagram tile'} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text truncate">
                      {post.caption || (
                        <span className="text-text-dim italic">No caption</span>
                      )}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs text-text-dim">#{idx + 1}</p>
                      {post.post_url && (
                        <a
                          href={post.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-text-muted hover:text-gold inline-flex items-center gap-1"
                        >
                          <ExternalLink size={11} />
                          Post link
                        </a>
                      )}
                      {idx > 5 && (
                        <span className="text-[10px] uppercase tracking-[0.18em] text-text-dim">
                          (hidden — past 6th)
                        </span>
                      )}
                    </div>
                  </div>
                  <ActiveToggle
                    active={post.is_active}
                    onChange={(next) => handleTogglePostActive(post, next)}
                  />
                  <button
                    type="button"
                    className="p-1.5 rounded text-text-dim hover:text-text hover:bg-surface-2"
                    onClick={() => {
                      setEditingPost(post)
                      setPostModalOpen(true)
                    }}
                    aria-label="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="p-1.5 rounded text-text-dim hover:text-accent-warm hover:bg-surface-2"
                    onClick={() => handleDeletePost(post.id)}
                    aria-label="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                )
              }}
            />
          )}
        </CardContent>
      </Card>
      </>
      )}

      {/* ── Tile modal ───────────────────────────────────────── */}
      <Modal
        open={postModalOpen}
        onClose={() => {
          setPostModalOpen(false)
          setEditingPost(null)
        }}
        title={editingPost ? 'Edit tile' : 'Add tile'}
        size="md"
      >
        <form onSubmit={postForm.handleSubmit(onSavePost)} className="space-y-4">
          <ImageUpload
            label="Image (optional)"
            value={postForm.watch('image_url')}
            onChange={(url) =>
              postForm.setValue('image_url', url ?? '', {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            bucket="content"
            folder="instagram/posts"
            aspect="1 / 1"
            error={postForm.formState.errors.image_url?.message}
            hint="Square crop renders best. Skip if you only have the post URL — we'll render a typographic link card instead."
          />
          <Textarea
            label="Caption (optional)"
            rows={2}
            placeholder="What's happening in the photo — used as the tile's alt text and tooltip."
            {...postForm.register('caption')}
          />
          <Input
            label="Post URL (optional)"
            placeholder="https://instagram.com/p/..."
            hint="If set, clicking the tile opens this specific post. Leave blank to link to the main profile."
            {...postForm.register('post_url')}
          />
          <Input
            type="number"
            label="Order"
            {...postForm.register('display_order')}
          />
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-border text-gold accent-gold"
              {...postForm.register('is_active')}
            />
            <span className="text-sm text-text">Active</span>
          </label>

          {postError && (
            <div className="px-3 py-2 bg-accent-warm/10 border border-accent-warm/30 rounded text-xs text-accent-warm">
              {postError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPostModalOpen(false)
                setEditingPost(null)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={savingPost}>
              {editingPost ? 'Save' : 'Add tile'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
