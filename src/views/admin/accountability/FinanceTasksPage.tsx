'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { StatCard } from '@/components/ui/StatCard'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { toast } from '@/lib/hooks/use-toast'
import { formatDateTime } from '@/lib/utils'
import { Loader2, PoundSterling, Plus, Pencil, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  CADENCE_OPTIONS,
  CADENCE_LABEL,
  ESCALATION_LEVEL_META,
  currentPeriods,
  todayDate,
  daysLate,
  formatDate,
  formatPeriodLabel,
  type Cadence,
  type FinanceTaskRow,
  type FinanceOccurrenceRow,
} from '@/lib/finance-tasks'

interface FormState {
  id: string | null
  title: string
  cadence: Cadence
  due_day: string
  accountant_name: string
  accountant_email: string
  escalation_name: string
  escalation_email: string
  final_name: string
  final_email: string
  active: boolean
}

const EMPTY_FORM: FormState = {
  id: null,
  title: '',
  cadence: 'monthly',
  due_day: '7',
  accountant_name: '',
  accountant_email: '',
  escalation_name: '',
  escalation_email: '',
  final_name: '',
  final_email: '',
  active: true,
}

// Admin Finance Tasks page — recurring finance deliverables with three
// name+email contacts (accountant → Finance Director → Sarah). The hourly
// automations cron auto-escalates overdue occurrences by email; here an admin
// creates/edits/deactivates the definitions, sees each period's occurrence
// (status, due date, days late, escalation level), and marks them complete.
export function FinanceTasksPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<FinanceTaskRow[]>([])
  const [occurrences, setOccurrences] = useState<FinanceOccurrenceRow[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [tasksRes, occRes] = await Promise.all([
      supabase.from('finance_tasks').select('*').order('created_at', { ascending: true }),
      supabase.from('finance_task_occurrences').select('*'),
    ])
    if (tasksRes.data) setTasks(tasksRes.data as FinanceTaskRow[])
    if (occRes.data) setOccurrences(occRes.data as FinanceOccurrenceRow[])
    setLoading(false)
  }

  const occByTask = useMemo(() => {
    const m = new Map<string, FinanceOccurrenceRow[]>()
    for (const o of occurrences) {
      const arr = m.get(o.finance_task_id) ?? []
      arr.push(o)
      m.set(o.finance_task_id, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => b.due_date.localeCompare(a.due_date))
    return m
  }, [occurrences])

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  // Overdue = pending occurrence whose due_date has passed. Sorted worst-first.
  const overdue = useMemo(
    () =>
      occurrences
        .filter((o) => o.status === 'pending' && daysLate(o.due_date) >= 0)
        .sort((a, b) => daysLate(b.due_date) - daysLate(a.due_date)),
    [occurrences],
  )

  const activeCount = tasks.filter((t) => t.active).length
  const pendingCount = occurrences.filter((o) => o.status === 'pending').length

  function openCreate() {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(t: FinanceTaskRow) {
    setForm({
      id: t.id,
      title: t.title,
      cadence: t.cadence as Cadence,
      due_day: String(t.due_day),
      accountant_name: t.accountant_name ?? '',
      accountant_email: t.accountant_email ?? '',
      escalation_name: t.escalation_name ?? '',
      escalation_email: t.escalation_email ?? '',
      final_name: t.final_name ?? '',
      final_email: t.final_email ?? '',
      active: t.active,
    })
    setModalOpen(true)
  }

  async function save() {
    const dueDay = Number(form.due_day)
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' })
      return
    }
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
      toast({ title: 'Due day must be a whole number 1–28', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      cadence: form.cadence,
      due_day: dueDay,
      accountant_name: form.accountant_name.trim() || null,
      accountant_email: form.accountant_email.trim() || null,
      escalation_name: form.escalation_name.trim() || null,
      escalation_email: form.escalation_email.trim() || null,
      final_name: form.final_name.trim() || null,
      final_email: form.final_email.trim() || null,
      active: form.active,
    }
    try {
      let taskId = form.id
      if (form.id) {
        const { error } = await supabase.from('finance_tasks').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('finance_tasks')
          .insert({ ...payload, created_by: profile?.id ?? null })
          .select('id')
          .single()
        if (error) throw error
        taskId = (data as { id: string }).id
      }

      // Seed the current period occurrence immediately so the task is
      // visible/actionable before the next cron run (the cron does the same,
      // idempotently, via the unique index). Skip a period whose due date has
      // already passed — a task added today starts chasing from today onward.
      if (taskId && payload.active) {
        const todayStr = todayDate()
        const periods = currentPeriods(payload.cadence, payload.due_day).filter(
          (p) => p.dueDate >= todayStr,
        )
        if (periods.length) {
          await supabase.from('finance_task_occurrences').upsert(
            periods.map((p) => ({
              finance_task_id: taskId!,
              period_label: p.label,
              due_date: p.dueDate,
            })),
            { onConflict: 'finance_task_id,period_label', ignoreDuplicates: true },
          )
        }
      }

      toast({ title: form.id ? 'Finance task updated' : 'Finance task created' })
      setModalOpen(false)
      await load()
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(t: FinanceTaskRow) {
    const { error } = await supabase
      .from('finance_tasks')
      .update({ active: !t.active })
      .eq('id', t.id)
    if (error) {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: t.active ? 'Task deactivated' : 'Task reactivated' })
    await load()
  }

  async function markComplete(o: FinanceOccurrenceRow) {
    const { error } = await supabase
      .from('finance_task_occurrences')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: profile?.id ?? null,
      })
      .eq('id', o.id)
    if (error) {
      toast({ title: 'Could not mark complete', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Marked complete' })
    await load()
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading finance tasks…
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Finance Tasks"
        description="Recurring finance deliverables (management accounts, VAT, payroll, cashflow). Each has an accountant, an escalation contact (Finance Director) and a final contact (Sarah). When a period goes overdue the system emails each level in turn automatically — the system chases, not Sarah."
        actions={<Button icon={<Plus size={15} />} onClick={openCreate}>Add finance task</Button>}
      />

      {/* Headline stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Active tasks" value={activeCount} />
        <StatCard label="Pending occurrences" value={pendingCount} />
        <StatCard
          label="Overdue"
          value={overdue.length}
          changeText={overdue.length > 0 ? 'Needs attention' : 'All on track'}
          changeType={overdue.length > 0 ? 'negative' : 'positive'}
        />
      </div>

      {/* Overdue — surfaced prominently */}
      {overdue.length > 0 && (
        <Card className="mb-6 border-accent-warm/40">
          <CardContent className="py-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={15} className="text-accent-warm" />
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
                Overdue — being chased
              </p>
            </div>
            <div className="space-y-2">
              {overdue.map((o) => {
                const t = taskById.get(o.finance_task_id)
                const late = daysLate(o.due_date)
                const meta = ESCALATION_LEVEL_META[o.escalation_level] ?? ESCALATION_LEVEL_META[0]
                return (
                  <div
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-surface-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">
                        {t?.title ?? 'Finance task'}{' '}
                        <span className="text-text-dim">· {formatPeriodLabel(o.period_label)}</span>
                      </p>
                      <p className="text-xs text-text-muted">
                        Due {formatDate(o.due_date)} · {late} day{late === 1 ? '' : 's'} late
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<CheckCircle2 size={14} />}
                        onClick={() => markComplete(o)}
                      >
                        Mark complete
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task definitions + their occurrences */}
      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <AdminEmptyState
              icon={PoundSterling}
              title="No finance tasks yet"
              description="Add a recurring finance deliverable and its three contacts. The system will create each period's occurrence and chase it automatically when overdue."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tasks.map((t) => {
            const occs = occByTask.get(t.id) ?? []
            return (
              <Card key={t.id} className={t.active ? undefined : 'opacity-70'}>
                <CardContent className="p-0">
                  {/* Task header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-border">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-text">{t.title}</p>
                        <Badge variant="info">{CADENCE_LABEL[t.cadence] ?? t.cadence}</Badge>
                        {!t.active && <Badge variant="draft">Inactive</Badge>}
                      </div>
                      <p className="text-xs text-text-muted mt-1">
                        Due day {t.due_day} of the period · Accountant:{' '}
                        {t.accountant_name || t.accountant_email || '—'} · FD:{' '}
                        {t.escalation_name || t.escalation_email || '—'} · Final:{' '}
                        {t.final_name || t.final_email || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil size={14} />}
                        onClick={() => openEdit(t)}
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(t)}>
                        {t.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  </div>

                  {/* Occurrences */}
                  {occs.length === 0 ? (
                    <div className="px-5 py-4 text-sm text-text-muted">
                      No occurrences yet — the first one will be created on its next due date.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {occs.map((o) => {
                        const late = daysLate(o.due_date)
                        const isOverdue = o.status === 'pending' && late >= 0
                        const meta =
                          ESCALATION_LEVEL_META[o.escalation_level] ?? ESCALATION_LEVEL_META[0]
                        return (
                          <div
                            key={o.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-text">
                                {formatPeriodLabel(o.period_label)}{' '}
                                <span className="text-text-dim">· due {formatDate(o.due_date)}</span>
                              </p>
                              <p className="text-xs text-text-muted">
                                {o.status === 'completed' ? (
                                  <>
                                    Completed
                                    {o.completed_at ? ` ${formatDateTime(o.completed_at)}` : ''}
                                  </>
                                ) : isOverdue ? (
                                  <span className="text-accent-warm">
                                    {late} day{late === 1 ? '' : 's'} late
                                  </span>
                                ) : (
                                  `Due in ${-late} day${-late === 1 ? '' : 's'}`
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {o.status === 'completed' ? (
                                <Badge variant="active">
                                  <CheckCircle2 size={12} className="mr-1" />
                                  Complete
                                </Badge>
                              ) : (
                                <>
                                  <Badge variant={meta.variant}>{meta.label}</Badge>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<CheckCircle2 size={14} />}
                                    onClick={() => markComplete(o)}
                                  >
                                    Mark complete
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'Edit finance task' : 'Add finance task'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g. Monthly Management Accounts"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Cadence"
              options={CADENCE_OPTIONS}
              value={form.cadence}
              onChange={(e) => setForm((f) => ({ ...f, cadence: e.target.value as Cadence }))}
            />
            <Select
              label="Due day of period"
              options={Array.from({ length: 28 }, (_, i) => ({
                value: String(i + 1),
                label: `Day ${i + 1}`,
              }))}
              value={form.due_day}
              onChange={(e) => setForm((f) => ({ ...f, due_day: e.target.value }))}
              hint="Quarterly = day of the quarter's final month · Annual = day in December"
            />
          </div>

          <ContactRow
            roleLabel="Accountant (level 1)"
            name={form.accountant_name}
            email={form.accountant_email}
            onName={(v) => setForm((f) => ({ ...f, accountant_name: v }))}
            onEmail={(v) => setForm((f) => ({ ...f, accountant_email: v }))}
          />
          <ContactRow
            roleLabel="Escalation — Finance Director (level 2)"
            name={form.escalation_name}
            email={form.escalation_email}
            onName={(v) => setForm((f) => ({ ...f, escalation_name: v }))}
            onEmail={(v) => setForm((f) => ({ ...f, escalation_email: v }))}
          />
          <ContactRow
            roleLabel="Final — Sarah (level 3)"
            name={form.final_name}
            email={form.final_email}
            onName={(v) => setForm((f) => ({ ...f, final_name: v }))}
            onEmail={(v) => setForm((f) => ({ ...f, final_email: v }))}
          />

          {form.id && (
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Active (inactive tasks are not chased)
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={save}>
              {form.id ? 'Save changes' : 'Create task'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function ContactRow({
  roleLabel,
  name,
  email,
  onName,
  onEmail,
}: {
  roleLabel: string
  name: string
  email: string
  onName: (v: string) => void
  onEmail: (v: string) => void
}) {
  return (
    <div>
      <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-2">
        {roleLabel}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Name" value={name} onChange={(e) => onName(e.target.value)} />
        <Input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
        />
      </div>
    </div>
  )
}
