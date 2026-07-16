'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, Pencil, Receipt } from 'lucide-react'

// Event cost side + P&L for a single event. Lives on the event detail page.
//
//   revenue = ticket revenue (confirmed bookings, passed in) +
//             committed sponsorship (confirmed / invoiced / paid, amount_pence)
//   cost    = Σ event_expenses.amount_pence
//   profit  = revenue − cost
//   margin  = profit / revenue   (— when revenue = 0)
//
// Sponsorship is summed here the same way FinancePage + SponsorsPanel do
// (amount_pence for confirmed/invoiced/paid) so the numbers reconcile.

interface ExpenseRow {
  id: string
  label: string
  amount_pence: number
  category: string | null
  created_at: string
}

// SelectMenu (Radix) disallows an empty-string value, so "Uncategorised"
// uses a 'none' sentinel that maps back to null on save.
const NO_CATEGORY = 'none'

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: NO_CATEGORY, label: 'Uncategorised' },
  { value: 'venue', label: 'Venue' },
  { value: 'catering', label: 'Catering' },
  { value: 'av', label: 'AV / Production' },
  { value: 'talent', label: 'Talent / Speakers' },
  { value: 'staffing', label: 'Staffing' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
]

function categoryLabel(value: string | null): string {
  if (!value || value === NO_CATEGORY) return 'Uncategorised'
  return CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? value
}

export function EventExpensesPanel({
  eventId,
  ticketRevenuePence,
}: {
  eventId: string
  ticketRevenuePence: number
}) {
  const confirm = useConfirm()
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [sponsorshipPence, setSponsorshipPence] = useState(0)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<ExpenseRow | null>(null)

  // Add / edit form state
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(NO_CATEGORY)

  useEffect(() => {
    fetchData()
  }, [eventId])

  async function fetchData() {
    setLoading(true)
    const [expRes, sponsorRes] = await Promise.all([
      supabase
        .from('event_expenses')
        .select('id, label, amount_pence, category, created_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true }),
      supabase
        .from('sponsorships')
        .select('amount_pence, status')
        .eq('event_id', eventId)
        .in('status', ['confirmed', 'invoiced', 'paid']),
    ])
    if (expRes.data) setExpenses(expRes.data as ExpenseRow[])
    setSponsorshipPence(
      (sponsorRes.data ?? []).reduce((sum, s) => sum + (s.amount_pence ?? 0), 0),
    )
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setLabel('')
    setAmount('')
    setCategory(NO_CATEGORY)
    setOpen(true)
  }

  function openEdit(row: ExpenseRow) {
    setEditing(row)
    setLabel(row.label)
    setAmount(String(row.amount_pence / 100))
    setCategory(row.category ?? NO_CATEGORY)
    setOpen(true)
  }

  async function handleSave() {
    if (!label.trim()) {
      toast({ title: 'Add a label', description: 'e.g. Venue hire, Catering.', variant: 'destructive' })
      return
    }
    const amountPence = Math.round((parseFloat(amount) || 0) * 100)
    if (!(amountPence > 0)) {
      toast({ title: 'Set an amount', description: 'The cost must be more than £0.', variant: 'destructive' })
      return
    }
    setSaving(true)
    if (editing) {
      const { error } = await supabase
        .from('event_expenses')
        .update({
          label: label.trim(),
          amount_pence: amountPence,
          category: category === NO_CATEGORY ? null : category,
        })
        .eq('id', editing.id)
      setSaving(false)
      if (error) {
        toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Expense updated' })
    } else {
      const { error } = await supabase.from('event_expenses').insert({
        event_id: eventId,
        label: label.trim(),
        amount_pence: amountPence,
        category: category === NO_CATEGORY ? null : category,
      })
      setSaving(false)
      if (error) {
        toast({ title: 'Could not add expense', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Expense added' })
    }
    setOpen(false)
    fetchData()
  }

  async function handleDelete(row: ExpenseRow) {
    const ok = await confirm({
      title: 'Remove this expense?',
      description: (
        <span>
          <strong className="text-text">{row.label}</strong> ({formatCurrency(row.amount_pence)}) will
          be removed from this event&rsquo;s costs. This cannot be undone.
        </span>
      ),
      confirmLabel: 'Remove expense',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('event_expenses').delete().eq('id', row.id)
    if (error) {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' })
      return
    }
    setExpenses((list) => list.filter((r) => r.id !== row.id))
  }

  const costPence = expenses.reduce((sum, e) => sum + e.amount_pence, 0)
  const revenuePence = ticketRevenuePence + sponsorshipPence
  const profitPence = revenuePence - costPence
  const marginPct = revenuePence > 0 ? Math.round((profitPence / revenuePence) * 100) : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Expenses &amp; P&amp;L ({expenses.length})</CardTitle>
        <Button size="sm" icon={<Plus size={15} />} onClick={openAdd}>
          Add expense
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {/* P&L summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border-b border-border">
          <div className="bg-surface px-5 py-4">
            <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
              Revenue
            </p>
            <p className="mt-1 text-lg text-text tabular-nums">{formatCurrency(revenuePence)}</p>
            <p className="text-[11px] text-text-dim">tickets + sponsorship</p>
          </div>
          <div className="bg-surface px-5 py-4">
            <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
              Cost
            </p>
            <p className="mt-1 text-lg text-text tabular-nums">{formatCurrency(costPence)}</p>
            <p className="text-[11px] text-text-dim">{expenses.length} item{expenses.length === 1 ? '' : 's'}</p>
          </div>
          <div className="bg-surface px-5 py-4">
            <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
              Profit
            </p>
            <p className={`mt-1 text-lg tabular-nums ${profitPence >= 0 ? 'text-text' : 'text-accent-warm'}`}>
              {formatCurrency(profitPence)}
            </p>
          </div>
          <div className="bg-surface px-5 py-4">
            <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
              Margin
            </p>
            <p className={`mt-1 text-lg tabular-nums ${profitPence >= 0 ? 'text-text' : 'text-accent-warm'}`}>
              {marginPct === null ? '—' : `${marginPct}%`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-text-dim">Loading expenses…</div>
        ) : expenses.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Receipt size={24} className="mx-auto text-text-dim mb-3" />
            <p className="text-sm text-text-muted">No expenses recorded yet</p>
            <p className="text-xs text-text-dim mt-1">
              Add venue, catering, AV and other costs to see this event&rsquo;s true profit.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {expenses.map((e) => (
              <div key={e.id} className="px-5 sm:px-6 py-3.5 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text truncate">{e.label}</p>
                  <p className="text-xs text-text-dim">{categoryLabel(e.category)}</p>
                </div>
                <p className="text-sm text-text tabular-nums shrink-0">{formatCurrency(e.amount_pence)}</p>
                <button
                  onClick={() => openEdit(e)}
                  className="shrink-0 w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-text-dim hover:text-text hover:bg-surface-2 transition-colors"
                  aria-label="Edit expense"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(e)}
                  className="shrink-0 w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-text-dim hover:text-accent-warm hover:bg-surface-2 transition-colors"
                  aria-label="Remove expense"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* ── Add / edit expense modal ─────────────────────────────── */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit expense' : 'Add expense'}
        size="md"
      >
        <div className="space-y-6 py-1">
          <Input
            label="Label"
            placeholder="e.g. Venue hire, Catering"
            hint="A short name for this cost."
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Input
              label="Amount (£)"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <SelectMenu
              label="Category"
              value={category}
              onValueChange={setCategory}
              options={CATEGORY_OPTIONS}
            />
          </div>
        </div>
        <div className="-mx-6 -mb-4 mt-8 px-6 py-4 border-t border-border flex items-center justify-end gap-3 bg-surface rounded-b-[var(--radius-xl)]">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {editing ? 'Save changes' : 'Add expense'}
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
