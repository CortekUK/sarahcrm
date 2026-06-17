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
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { Thumbnail } from '@/components/admin/Thumbnail'
import { toast } from '@/lib/hooks/use-toast'
import { Pencil, Sparkles, Lock } from 'lucide-react'

// /dashboard/website/membership-benefits
//
// CMS surface for the 9-card "Membership benefits" bento on /memberships.
// The set of cards is FIXED at 9 — admins can edit copy/image and
// toggle visibility, but NOT add or remove cards. The bento layout is
// hand-tuned to nine positions and any other count breaks the
// editorial asymmetry. This is enforced at the RLS layer too
// (INSERT/DELETE policies are intentionally absent).

// Paths whose ISR cache we flush after every edit. /memberships has
// `revalidate = 60`, so without this an admin toggling a card off
// would still see it on the public page for up to a minute. Fire-and-
// forget — we don't surface failures to the editor (a follow-up edit
// will re-flush anyway).
const REVALIDATE_PATHS = ['/memberships']

async function flushPublicCache() {
  try {
    await fetch('/api/admin/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: REVALIDATE_PATHS }),
    })
  } catch {
    // Non-fatal — the cache will eventually self-refresh.
  }
}

interface Benefit {
  id: string
  position: number
  numeral: string
  title: string
  body: string
  image_url: string | null
  is_visible: boolean
  updated_at: string
}

const schema = z.object({
  numeral: z.string().min(1, 'Required').max(8, 'Keep it short'),
  title: z.string().min(1, 'Title is required').max(80, 'Keep under 80 chars'),
  body: z.string().min(20, 'Body must be at least 20 characters'),
  image_url: z.string().optional().nullable(),
})

type FormData = z.infer<typeof schema>

export function MembershipBenefitsPage() {
  const [items, setItems] = useState<Benefit[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Benefit | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      numeral: '',
      title: '',
      body: '',
      image_url: '',
    },
  })

  useEffect(() => {
    fetchItems()
  }, [])

  useEffect(() => {
    if (!modalOpen || !editing) return
    form.reset({
      numeral: editing.numeral,
      title: editing.title,
      body: editing.body,
      image_url: editing.image_url ?? '',
    })
    setError(null)
  }, [modalOpen, editing, form])

  async function fetchItems() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('membership_benefits')
      // Admin needs to see hidden cards too — RLS lets is_admin() pass
      // through. Sort by canonical position so card I always comes
      // first, regardless of last-edited time.
      .select('*')
      .order('position', { ascending: true })

    if (err) {
      toast({
        title: 'Failed to load benefits',
        description: err.message,
        variant: 'destructive',
      })
    } else if (data) {
      setItems(data as unknown as Benefit[])
    }
    setLoading(false)
  }

  async function handleSave(data: FormData) {
    if (!editing) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('membership_benefits')
      .update({
        numeral: data.numeral.trim(),
        title: data.title.trim(),
        body: data.body.trim(),
        image_url: data.image_url || null,
      })
      .eq('id', editing.id)

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    toast({ title: 'Saved', description: `Card ${editing.numeral} updated.` })
    setModalOpen(false)
    setEditing(null)
    setSaving(false)
    fetchItems()
    void flushPublicCache()
  }

  async function handleToggleVisibility(item: Benefit, next: boolean) {
    // Optimistic update — flip locally first, revert if the server says
    // no. Toggling visibility is a one-tap operation; making the user
    // wait for the round-trip feels sluggish.
    setItems((prev) =>
      prev.map((b) => (b.id === item.id ? { ...b, is_visible: next } : b)),
    )
    const { error: err } = await supabase
      .from('membership_benefits')
      .update({ is_visible: next })
      .eq('id', item.id)

    if (err) {
      setItems((prev) =>
        prev.map((b) => (b.id === item.id ? { ...b, is_visible: !next } : b)),
      )
      toast({
        title: 'Could not update visibility',
        description: err.message,
        variant: 'destructive',
      })
      return
    }
    toast({
      title: next ? 'Card shown' : 'Card hidden',
      description: `Card ${item.numeral} · ${item.title}`,
    })
    void flushPublicCache()
  }

  const visibleCount = items.filter((i) => i.is_visible).length

  return (
    <div className="px-6 lg:px-10 py-8 lg:py-10 space-y-7">
      <AdminPageHeader
        title="Membership benefits"
        description={`Edit copy and imagery for the bento on /memberships. ${visibleCount} of ${items.length} cards visible. The set is locked at nine — toggle visibility to hide a card from the public page.`}
      />

      {/* Locked-set explainer pill — sits above the list so an admin who
          can't find an "Add" button understands why. */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-surface-2 text-[11px] uppercase tracking-[0.18em] text-text-dim">
        <Lock size={11} strokeWidth={1.6} />
        Fixed set · edit & hide only
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-text-dim">
              Loading benefits…
            </div>
          ) : items.length === 0 ? (
            // Hits when the migration hasn't been applied. We don't
            // show an "Add" button because creates are blocked — point
            // the admin at the migration instead.
            <div className="px-6 py-12 text-center">
              <Sparkles size={20} className="mx-auto mb-3 text-text-dim" />
              <p className="text-sm text-text">No benefit cards found.</p>
              <p className="text-[12px] text-text-dim mt-1.5 max-w-md mx-auto">
                Run the <code className="text-text">20260526_membership_benefits.sql</code>{' '}
                migration to seed the nine cards.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="group flex items-center gap-4 px-5 py-4 hover:bg-surface-2/50 transition-colors"
                >
                  {/* Position chip — Roman numeral + position number,
                      anchors the card identity in the list. */}
                  <div className="w-12 h-12 shrink-0 rounded-md border border-border-gold bg-gold-muted flex flex-col items-center justify-center">
                    <span className="font-[family-name:var(--font-heading)] text-[14px] font-semibold text-gold leading-none">
                      {item.numeral}
                    </span>
                    <span className="text-[8.5px] uppercase tracking-[0.18em] text-text-dim mt-0.5">
                      {String(item.position).padStart(2, '0')}
                    </span>
                  </div>

                  <Thumbnail
                    src={item.image_url}
                    alt={item.title}
                    aspect="4 / 3"
                    width={64}
                  />

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        item.is_visible ? 'text-text' : 'text-text-dim line-through decoration-text-dim/50'
                      }`}
                    >
                      {item.title}
                    </p>
                    <p className="text-[12px] text-text-muted line-clamp-2 mt-0.5">
                      {item.body}
                    </p>
                  </div>

                  <ActiveToggle
                    active={item.is_visible}
                    onChange={(next) => handleToggleVisibility(item, next)}
                  />

                  <button
                    onClick={() => {
                      setEditing(item)
                      setModalOpen(true)
                    }}
                    className="p-2 text-text-dim hover:text-text rounded hover:bg-surface-2 transition-colors"
                    title="Edit"
                    aria-label={`Edit card ${item.numeral}`}
                  >
                    <Pencil size={14} strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        title={editing ? `Edit card ${editing.numeral} · ${editing.title}` : 'Edit card'}
        size="lg"
      >
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4">
            <Input
              label="Numeral"
              hint="Top-right corner mark"
              error={form.formState.errors.numeral?.message}
              {...form.register('numeral')}
            />
            <Input
              label="Title"
              error={form.formState.errors.title?.message}
              {...form.register('title')}
            />
          </div>
          <Textarea
            label="Body"
            rows={5}
            hint="Italic editorial body — keep to 2–4 sentences."
            error={form.formState.errors.body?.message}
            {...form.register('body')}
          />
          <ImageUpload
            label="Image"
            hint="Used as a faded background on the wider tiles. 4:3 or 3:2 crops work best."
            value={form.watch('image_url') ?? ''}
            onChange={(url) => form.setValue('image_url', url ?? '', { shouldDirty: true })}
            bucket="content"
            folder="membership-benefits"
            aspect="4 / 3"
          />

          <div className="flex justify-end gap-3 pt-5 border-t border-border mt-5 -mx-6 px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setModalOpen(false)
                setEditing(null)
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
