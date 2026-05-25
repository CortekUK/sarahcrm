'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { SortableList, DragHandle } from '@/components/admin/SortableList'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  Plus,
  Pencil,
  Trash2,
  Crown,
  Tag as TagIcon,
  Sparkles,
  ListChecks,
} from 'lucide-react'
import type { Database } from '@/types/database'

type Plan = Database['public']['Tables']['membership_plans']['Row']

const TIER_OPTIONS = [
  { value: '', label: 'No internal classification' },
  { value: 'tier_1', label: 'Tier 1 (basic benefits)' },
  { value: 'tier_2', label: 'Tier 2 (mid benefits)' },
  { value: 'tier_3', label: 'Tier 3 (full benefits)' },
]

const schema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
  name: z.string().min(1, 'Name is required'),
  lede: z.string().optional(),
  contract_terms: z.string().optional(),
  annual_price_pounds: z.coerce.number().min(0),
  monthly_price_pounds: z.coerce.number().min(0),
  features: z
    .array(z.object({ value: z.string().min(1, 'Feature can’t be empty') }))
    .default([]),
  image_url: z.string().optional(),
  tier_classification: z.string().optional(),
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
  is_featured: z.boolean(),
})

type FormData = z.infer<typeof schema>

function poundsFromPence(pence: number) {
  return Math.round(pence) / 100
}

function gbp(pence: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100)
}

export function MembershipPlansPage() {
  const confirm = useConfirm()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      slug: '',
      name: '',
      lede: '',
      contract_terms: '12 months · plus VAT',
      annual_price_pounds: 0,
      monthly_price_pounds: 0,
      features: [],
      image_url: '',
      tier_classification: '',
      display_order: 0,
      is_active: true,
      is_featured: false,
    },
  })

  const featureField = useFieldArray({ control: form.control, name: 'features' })

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('membership_plans')
      .select('*')
      .order('display_order', { ascending: true })
    if (err) {
      toast({
        title: 'Failed to load plans',
        description: err.message,
        variant: 'destructive',
      })
    } else if (data) {
      setPlans(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  // Reset the form when the modal opens — for an edit we hydrate from
  // the selected plan, for a create we start fresh.
  useEffect(() => {
    if (!modalOpen) return
    if (editing) {
      form.reset({
        slug: editing.slug,
        name: editing.name,
        lede: editing.lede ?? '',
        contract_terms: editing.contract_terms ?? '',
        annual_price_pounds: poundsFromPence(editing.annual_price_pence),
        monthly_price_pounds: poundsFromPence(editing.monthly_price_pence),
        features: (editing.features ?? []).map((f) => ({ value: f })),
        image_url: editing.image_url ?? '',
        tier_classification: editing.tier_classification ?? '',
        display_order: editing.display_order,
        is_active: editing.is_active,
        is_featured: editing.is_featured,
      })
    } else {
      form.reset({
        slug: '',
        name: '',
        lede: '',
        contract_terms: '12 months · plus VAT',
        annual_price_pounds: 0,
        monthly_price_pounds: 0,
        features: [],
        image_url: '',
        tier_classification: '',
        display_order: plans.length,
        is_active: true,
        is_featured: false,
      })
    }
    setError(null)
  }, [modalOpen, editing, form, plans.length])

  async function onSubmit(data: FormData) {
    setSaving(true)
    setError(null)
    const payload = {
      slug: data.slug,
      name: data.name,
      lede: data.lede || null,
      contract_terms: data.contract_terms || null,
      annual_price_pence: Math.round(data.annual_price_pounds * 100),
      monthly_price_pence: Math.round(data.monthly_price_pounds * 100),
      features: data.features.map((f) => f.value).filter(Boolean),
      image_url: data.image_url || null,
      tier_classification: data.tier_classification || null,
      display_order: data.display_order,
      is_active: data.is_active,
      is_featured: data.is_featured,
    }
    try {
      if (editing) {
        const { error: err } = await supabase
          .from('membership_plans')
          .update(payload)
          .eq('id', editing.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('membership_plans').insert(payload)
        if (err) throw err
      }
      setModalOpen(false)
      setEditing(null)
      fetchPlans()
      toast({
        title: editing ? 'Plan updated' : 'Plan added',
        description: data.name,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(plan: Plan) {
    const ok = await confirm({
      title: `Delete "${plan.name}"?`,
      description: (
        <span>
          This plan will be removed from the public Memberships page and the application form's
          tier picker. Existing members are not affected — only what new applicants can choose. This
          cannot be undone.
        </span>
      ),
      confirmLabel: 'Delete plan',
      tone: 'danger',
    })
    if (!ok) return
    const { error: err } = await supabase
      .from('membership_plans')
      .delete()
      .eq('id', plan.id)
    if (err) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Plan deleted', description: plan.name })
    fetchPlans()
  }

  async function handleToggleActive(plan: Plan, next: boolean) {
    // Optimistic update.
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, is_active: next } : p)))
    const { error: err } = await supabase
      .from('membership_plans')
      .update({ is_active: next })
      .eq('id', plan.id)
    if (err) {
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, is_active: !next } : p)))
      toast({ title: 'Toggle failed', description: err.message, variant: 'destructive' })
    }
  }

  async function handleReorder(next: Plan[]) {
    setPlans(next)
    await Promise.all(
      next.map((p) =>
        supabase.from('membership_plans').update({ display_order: p.display_order }).eq('id', p.id),
      ),
    )
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading plans…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <AdminPageHeader
        title="Membership plans"
        description="The plans visible on /memberships and inside the public application form. Every field on a plan card here maps to a slot on the public site — leave any field empty to hide it. Existing members keep their tier no matter what you change."
        meta={
          <span className="text-xs text-text-dim">
            {plans.length} plan{plans.length === 1 ? '' : 's'}
            {' · '}
            {plans.filter((p) => p.is_active).length} active
          </span>
        }
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
          >
            Add plan
          </Button>
        }
      />

      {plans.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={Crown}
              title="No membership plans yet"
              description="Add at least one plan so applicants have something to pick. The public site falls back to a hidden hardcoded set until you add the first row here."
              action={
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setEditing(null)
                    setModalOpen(true)
                  }}
                >
                  Add first plan
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <SortableList
              items={plans}
              onReorder={handleReorder}
              renderItem={(plan, dragHandleProps) => (
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 px-4 sm:px-5 py-4 border-b border-border last:border-b-0 group hover:bg-surface-2/50 transition-colors">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <DragHandle dragHandleProps={dragHandleProps} />
                    {plan.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={plan.image_url}
                        alt={plan.name}
                        className="w-20 h-16 rounded object-cover bg-surface-2 border border-border flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-16 rounded bg-surface-2 border border-border flex items-center justify-center flex-shrink-0">
                        <Crown size={18} className="text-text-dim" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-text">{plan.name}</p>
                        {plan.is_featured && (
                          <span className="inline-flex items-center gap-1 text-[9.5px] font-medium uppercase tracking-[0.18em] text-gold-dark bg-gold-muted px-1.5 py-0.5 rounded-full">
                            <Sparkles size={10} />
                            Featured
                          </span>
                        )}
                        <span className="text-[11px] text-text-dim font-mono">/{plan.slug}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-text-muted">
                        <span className="font-medium text-text">{gbp(plan.annual_price_pence)}</span>
                        <span className="text-text-dim"> / year</span>
                        <span className="text-text-dim"> · </span>
                        <span className="font-medium text-text">{gbp(plan.monthly_price_pence)}</span>
                        <span className="text-text-dim"> / month</span>
                        {plan.tier_classification && (
                          <>
                            <span className="text-text-dim"> · </span>
                            <span className="inline-flex items-center gap-1">
                              <TagIcon size={10} className="text-text-dim" />
                              {plan.tier_classification}
                            </span>
                          </>
                        )}
                      </p>
                      {plan.lede && (
                        <p className="mt-2 text-[12.5px] text-text-muted line-clamp-2 leading-relaxed">
                          {plan.lede}
                        </p>
                      )}
                      {plan.features.length > 0 && (
                        <p className="mt-2 text-[11px] text-text-dim inline-flex items-center gap-1">
                          <ListChecks size={11} />
                          {plan.features.length} feature{plan.features.length === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-3 flex-shrink-0">
                    <ActiveToggle
                      active={plan.is_active}
                      onChange={(next) => handleToggleActive(plan, next)}
                    />
                    <div className="flex items-center gap-0.5 ml-auto sm:ml-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(plan)
                          setModalOpen(true)
                        }}
                        className="p-1.5 text-text-dim hover:text-text rounded hover:bg-surface-2 transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil size={14} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(plan)}
                        className="p-1.5 text-text-dim hover:text-accent-warm rounded hover:bg-surface-2 transition-colors"
                        aria-label="Delete"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            />
          </CardContent>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        title={editing ? `Edit ${editing.name}` : 'Add membership plan'}
        size="xl"
      >
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Name"
              placeholder="Individual"
              error={form.formState.errors.name?.message}
              {...form.register('name')}
            />
            <Input
              label="Slug"
              placeholder="individual"
              hint="Used in URLs (e.g. /membership-application?tier=individual) — lowercase, hyphenated."
              error={form.formState.errors.slug?.message}
              {...form.register('slug')}
            />
          </div>

          <Textarea
            label="Lede"
            rows={3}
            placeholder="A single representation in the room. Quiet, considered, and built for the founder who keeps their own calendar."
            hint="The marketing tagline shown under the name. Hidden on the public site if blank."
            {...form.register('lede')}
          />

          <Input
            label="Contract terms"
            placeholder="12 months · plus VAT"
            hint="Shown under the price."
            {...form.register('contract_terms')}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Annual price"
              type="number"
              step="0.01"
              prefix="£"
              hint="What the applicant pays per year (ex-VAT). Shown as the headline price."
              {...form.register('annual_price_pounds', { valueAsNumber: true })}
            />
            <Input
              label="Monthly price"
              type="number"
              step="0.01"
              prefix="£"
              hint="What the applicant pays per month (ex-VAT). Usually annual / 12."
              {...form.register('monthly_price_pounds', { valueAsNumber: true })}
            />
          </div>

          {/* Features list — dynamic array of bullet points */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.22em] text-text-dim">
                Features
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<Plus size={13} />}
                onClick={() => featureField.append({ value: '' })}
              >
                Add feature
              </Button>
            </div>
            {featureField.fields.length === 0 ? (
              <p className="text-[12.5px] text-text-dim italic px-3 py-4 bg-surface-2 border border-border rounded-[var(--radius-md)] text-center">
                No features yet — the public card will show no bullet list.
              </p>
            ) : (
              <div className="space-y-2">
                {featureField.fields.map((field, i) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-text-dim w-5 text-right tabular-nums">
                      {i + 1}.
                    </span>
                    <input
                      type="text"
                      className={cn(
                        'flex-1 px-3.5 py-2 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-dim focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]',
                      )}
                      placeholder="e.g. 6 Member tickets"
                      {...form.register(`features.${i}.value`)}
                    />
                    <button
                      type="button"
                      onClick={() => featureField.remove(i)}
                      className="p-2 text-text-dim hover:text-accent-warm transition-colors"
                      aria-label="Remove feature"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ImageUpload
            label="Card image"
            value={form.watch('image_url')}
            onChange={(url) => form.setValue('image_url', url ?? '', { shouldDirty: true })}
            bucket="content"
            folder="memberships"
            aspect="3 / 4"
            hint="Portrait orientation works best — used as the full-bleed background of each tier card. Falls back to a flat graphite tile if blank."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Internal tier classification"
              options={TIER_OPTIONS}
              hint="Determines benefits + intro quota for members on this plan."
              {...form.register('tier_classification')}
            />
            <Input
              label="Display order"
              type="number"
              hint="Lower numbers appear first. Drag rows in the list to reorder visually."
              {...form.register('display_order')}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-border text-gold accent-gold"
                {...form.register('is_active')}
              />
              <span className="text-sm text-text">
                Active
                <span className="text-text-dim font-normal ml-1">(visible on public site)</span>
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-border text-gold accent-gold"
                {...form.register('is_featured')}
              />
              <span className="text-sm text-text">
                Featured
                <span className="text-text-dim font-normal ml-1">
                  (shown with a "Popular" badge)
                </span>
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-5 border-t border-border mt-5 -mx-6 px-6">
            <div>
              {editing && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    handleDelete(editing)
                    setModalOpen(false)
                    setEditing(null)
                  }}
                >
                  <Trash2 size={14} />
                  Delete plan
                </Button>
              )}
            </div>
            <div className="flex gap-3 sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setModalOpen(false)
                  setEditing(null)
                }}
                className="flex-1 sm:flex-none"
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving} className="flex-1 sm:flex-none">
                {editing ? 'Save changes' : 'Add plan'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
