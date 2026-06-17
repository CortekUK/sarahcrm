'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { SortableList, DragHandle } from '@/components/admin/SortableList'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { Plus, Pencil, Trash2, Check, Minus, Table2 } from 'lucide-react'

// /dashboard/website/membership-comparison
//
// CMS surface for the "Membership comparison" spec sheet on /memberships.
// One row per feature, with an Included/Not-included flag for each of the
// three public tiers (Individual / Business / Corporate). Admins can add,
// edit, reorder (drag), delete, and toggle rows on/off.
//
// The public page (/memberships) falls back to a hardcoded COMPARISON
// constant when this table is empty, so it never renders blank — exactly
// like the tier cards do with membership_plans.

// Paths whose ISR cache we flush after every edit. /memberships has
// `revalidate = 60`, so without this an admin edit could take up to a
// minute to surface publicly. Fire-and-forget — failures are non-fatal
// since a follow-up edit re-flushes anyway.
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

interface ComparisonRow {
  id: string
  label: string
  individual: boolean
  business: boolean
  corporate: boolean
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

const TIER_KEYS = ['individual', 'business', 'corporate'] as const
const TIER_LABELS: Record<(typeof TIER_KEYS)[number], string> = {
  individual: 'Individual',
  business: 'Business',
  corporate: 'Corporate',
}

const schema = z.object({
  label: z.string().min(1, 'Feature label is required'),
  individual: z.boolean(),
  business: z.boolean(),
  corporate: z.boolean(),
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof schema>

export function MembershipComparisonPage() {
  const confirm = useConfirm()
  const [rows, setRows] = useState<ComparisonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ComparisonRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      label: '',
      individual: false,
      business: false,
      corporate: false,
      display_order: 0,
      is_active: true,
    },
  })

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('membership_comparison')
      // Admin sees inactive rows too — RLS lets is_admin() through.
      .select('*')
      .order('display_order', { ascending: true })
    if (err) {
      toast({
        title: 'Failed to load comparison rows',
        description: err.message,
        variant: 'destructive',
      })
    } else if (data) {
      setRows(data as unknown as ComparisonRow[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  // Reset the form when the modal opens — hydrate from the selected row
  // for an edit, start fresh for a create.
  useEffect(() => {
    if (!modalOpen) return
    if (editing) {
      form.reset({
        label: editing.label,
        individual: editing.individual,
        business: editing.business,
        corporate: editing.corporate,
        display_order: editing.display_order,
        is_active: editing.is_active,
      })
    } else {
      form.reset({
        label: '',
        individual: false,
        business: false,
        corporate: false,
        display_order: rows.length,
        is_active: true,
      })
    }
    setError(null)
  }, [modalOpen, editing, form, rows.length])

  async function onSubmit(data: FormData) {
    setSaving(true)
    setError(null)
    const payload = {
      label: data.label.trim(),
      individual: data.individual,
      business: data.business,
      corporate: data.corporate,
      display_order: data.display_order,
      is_active: data.is_active,
    }
    try {
      if (editing) {
        const { error: err } = await supabase
          .from('membership_comparison')
          .update(payload)
          .eq('id', editing.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('membership_comparison').insert(payload)
        if (err) throw err
      }
      setModalOpen(false)
      setEditing(null)
      fetchRows()
      void flushPublicCache()
      toast({
        title: editing ? 'Row updated' : 'Row added',
        description: data.label,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(row: ComparisonRow) {
    const ok = await confirm({
      title: 'Delete this row?',
      description: (
        <span>
          “{row.label}” will be removed from the comparison table on the public Memberships page.
          This cannot be undone.
        </span>
      ),
      confirmLabel: 'Delete row',
      tone: 'danger',
    })
    if (!ok) return
    const { error: err } = await supabase
      .from('membership_comparison')
      .delete()
      .eq('id', row.id)
    if (err) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Row deleted', description: row.label })
    fetchRows()
    void flushPublicCache()
  }

  async function handleToggleActive(row: ComparisonRow, next: boolean) {
    // Optimistic update.
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: next } : r)))
    const { error: err } = await supabase
      .from('membership_comparison')
      .update({ is_active: next })
      .eq('id', row.id)
    if (err) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !next } : r)))
      toast({ title: 'Toggle failed', description: err.message, variant: 'destructive' })
      return
    }
    void flushPublicCache()
  }

  async function handleReorder(next: ComparisonRow[]) {
    setRows(next)
    await Promise.all(
      next.map((r) =>
        supabase
          .from('membership_comparison')
          .update({ display_order: r.display_order })
          .eq('id', r.id),
      ),
    )
    void flushPublicCache()
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading comparison…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <AdminPageHeader
        title="Membership comparison"
        description="The 'at a glance' comparison table on /memberships. Each row is one feature with an Included tick per tier. Drag to reorder, toggle to hide a row, or add new rows as the offering changes. The public site falls back to a hidden hardcoded set until you add the first row here."
        meta={
          <span className="text-xs text-text-dim">
            {rows.length} row{rows.length === 1 ? '' : 's'}
            {' · '}
            {rows.filter((r) => r.is_active).length} active
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
            Add row
          </Button>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={Table2}
              title="No comparison rows yet"
              description="Add rows so the comparison table is editable here. Until you do, the public site falls back to a hidden hardcoded set so the page never renders blank."
              action={
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setEditing(null)
                    setModalOpen(true)
                  }}
                >
                  Add first row
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Tier column header strip — mirrors the public table's
                Individual / Business / Corporate columns so the admin can
                read the ticks against the right tier. */}
            <div className="hidden sm:flex items-center gap-4 px-5 py-3 border-b border-border bg-surface-2/40">
              <span className="w-5" />
              <span className="flex-1 text-[10px] font-medium uppercase tracking-[0.22em] text-text-dim">
                Feature
              </span>
              {TIER_KEYS.map((key) => (
                <span
                  key={key}
                  className="w-16 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-text-dim"
                >
                  {TIER_LABELS[key]}
                </span>
              ))}
              <span className="w-[88px]" />
            </div>

            <SortableList
              items={rows}
              onReorder={handleReorder}
              renderItem={(row, dragHandleProps) => (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 border-b border-border last:border-b-0 group hover:bg-surface-2/50 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <DragHandle dragHandleProps={dragHandleProps} />
                    <p
                      className={`text-sm flex-1 min-w-0 ${
                        row.is_active
                          ? 'text-text'
                          : 'text-text-dim line-through decoration-text-dim/50'
                      }`}
                    >
                      {row.label}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-4">
                    {TIER_KEYS.map((key) => (
                      <span
                        key={key}
                        className="w-16 flex items-center justify-center"
                        aria-label={`${TIER_LABELS[key]}: ${row[key] ? 'included' : 'not included'}`}
                      >
                        {row[key] ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gold-muted border border-border-gold text-gold">
                            <Check size={13} strokeWidth={2} />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 text-text-dim">
                            <Minus size={13} strokeWidth={1.5} />
                          </span>
                        )}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <ActiveToggle
                      active={row.is_active}
                      onChange={(next) => handleToggleActive(row, next)}
                    />
                    <div className="flex items-center gap-0.5 ml-auto sm:ml-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(row)
                          setModalOpen(true)
                        }}
                        className="p-1.5 text-text-dim hover:text-text rounded hover:bg-surface-2 transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil size={14} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
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
        title={editing ? 'Edit comparison row' : 'Add comparison row'}
        size="lg"
      >
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Feature label"
            placeholder="Access to The Club network"
            hint="Shown in the left-hand column of the public table."
            error={form.formState.errors.label?.message}
            {...form.register('label')}
          />

          {/* Per-tier included toggles */}
          <div>
            <label className="block font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.22em] text-text-dim mb-2">
              Included for
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TIER_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-3 px-3.5 py-3 bg-surface-2 border border-border rounded-[var(--radius-md)] cursor-pointer hover:border-gold/40 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-border text-gold accent-gold"
                    {...form.register(key)}
                  />
                  <span className="text-sm text-text">{TIER_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </div>

          <Input
            label="Display order"
            type="number"
            hint="Lower numbers appear first. Drag rows in the list to reorder visually."
            {...form.register('display_order')}
          />

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
                  Delete row
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
                {editing ? 'Save changes' : 'Add row'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
