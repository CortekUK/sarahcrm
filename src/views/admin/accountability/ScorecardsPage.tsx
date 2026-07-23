'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { cn, formatDateTime } from '@/lib/utils'
import { Loader2, Plus, Trash2, Pencil, Sparkles, Target, ChevronLeft, ChevronRight } from 'lucide-react'
import { personName, type PersonLite } from '@/lib/accountability'
import {
  type ScorecardTargetRow,
  type ScorecardSummaryRow,
  type ScorecardSource,
  SCORECARD_SOURCE_META,
  SCORECARD_SOURCE_OPTIONS,
  mondayOf,
  addWeeks,
  formatWeekRange,
  isCurrentWeek,
  actualForTarget,
  isTargetMet,
  computeScore,
  tasksCompletedInWeek,
  hoursLoggedInWeek,
  type WeekActualInputs,
} from '@/lib/scorecards'

interface TaskLite {
  owner_id: string
  status: string
  updated_at: string
}
interface EntryLite {
  staff_id: string
  hours: number | null
  entry_date: string
}

const emptyForm = {
  label: '',
  target_value: '',
  source: 'manual' as ScorecardSource,
  manual_actual: '',
}

export function ScorecardsPage() {
  const confirm = useConfirm()
  const { profile } = useAuth()
  const [weekStart, setWeekStart] = useState<string>(() => mondayOf())
  const [loading, setLoading] = useState(true)

  const [staff, setStaff] = useState<PersonLite[]>([])
  const [targets, setTargets] = useState<ScorecardTargetRow[]>([])
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [entries, setEntries] = useState<EntryLite[]>([])
  const [summaries, setSummaries] = useState<Record<string, ScorecardSummaryRow>>({})

  const [modalStaffId, setModalStaffId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  async function load() {
    setLoading(true)
    const [staffRes, targetsRes, tasksRes, entriesRes, summariesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('role', ['team_member', 'freelancer'])
        .eq('staff_status', 'active'),
      supabase.from('scorecard_targets').select('*').eq('week_start', weekStart),
      supabase.from('accountability_tasks').select('owner_id, status, updated_at'),
      supabase.from('time_entries').select('staff_id, hours, entry_date'),
      supabase.from('scorecard_summaries').select('*').eq('week_start', weekStart),
    ])
    if (staffRes.data) setStaff(staffRes.data as PersonLite[])
    if (targetsRes.data) setTargets(targetsRes.data as ScorecardTargetRow[])
    if (tasksRes.data) setTasks(tasksRes.data as TaskLite[])
    if (entriesRes.data) setEntries(entriesRes.data as EntryLite[])
    if (summariesRes.data) {
      const m: Record<string, ScorecardSummaryRow> = {}
      for (const s of summariesRes.data as ScorecardSummaryRow[]) m[s.staff_id] = s
      setSummaries(m)
    } else {
      setSummaries({})
    }
    setLoading(false)
  }

  // Auto metrics per staff for this week.
  const autoByStaff = useMemo(() => {
    const m: Record<string, WeekActualInputs> = {}
    for (const s of staff) {
      m[s.id] = {
        tasksCompleted: tasksCompletedInWeek(
          tasks.filter((t) => t.owner_id === s.id),
          weekStart,
        ),
        hoursLogged: hoursLoggedInWeek(
          entries.filter((e) => e.staff_id === s.id),
          weekStart,
        ),
      }
    }
    return m
  }, [staff, tasks, entries, weekStart])

  const targetsByStaff = useMemo(() => {
    const m: Record<string, ScorecardTargetRow[]> = {}
    for (const t of targets) (m[t.staff_id] ??= []).push(t)
    return m
  }, [targets])

  function openAdd(staffId: string) {
    setModalStaffId(staffId)
    setEditingId(null)
    setForm({ ...emptyForm })
  }

  function openEdit(t: ScorecardTargetRow) {
    setModalStaffId(t.staff_id)
    setEditingId(t.id)
    setForm({
      label: t.label,
      target_value: String(t.target_value ?? ''),
      source: t.source as ScorecardSource,
      manual_actual: String(t.manual_actual ?? ''),
    })
  }

  function closeModal() {
    setModalStaffId(null)
    setEditingId(null)
  }

  async function saveTarget() {
    if (!modalStaffId) return
    const label = form.label.trim()
    if (!label) {
      toast({ title: 'A label is required', variant: 'destructive' })
      return
    }
    const targetValue = Number(form.target_value)
    if (!Number.isFinite(targetValue) || targetValue < 0) {
      toast({ title: 'Enter a valid target number', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = {
      staff_id: modalStaffId,
      week_start: weekStart,
      label,
      target_value: targetValue,
      source: form.source,
      manual_actual:
        form.source === 'manual' && form.manual_actual.trim() !== ''
          ? Number(form.manual_actual)
          : 0,
    }
    if (editingId) {
      const { error } = await supabase
        .from('scorecard_targets')
        .update(payload)
        .eq('id', editingId)
      setSaving(false)
      if (error) {
        toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Target updated' })
    } else {
      const { error } = await supabase
        .from('scorecard_targets')
        .insert({ ...payload, created_by: profile?.id ?? null })
      setSaving(false)
      if (error) {
        toast({ title: 'Could not create', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Target added' })
    }
    closeModal()
    load()
  }

  async function removeTarget() {
    if (!editingId) return
    const ok = await confirm({
      title: 'Remove this target?',
      description: 'It will be deleted from this week’s scorecard.',
      confirmLabel: 'Remove target',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('scorecard_targets').delete().eq('id', editingId)
    if (error) {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' })
      return
    }
    closeModal()
    toast({ title: 'Target removed' })
    load()
  }

  // Inline edit of a manual target's actual value.
  async function saveManualActual(target: ScorecardTargetRow, raw: string) {
    const value = raw.trim() === '' ? 0 : Number(raw)
    if (!Number.isFinite(value) || value < 0) {
      toast({ title: 'Enter a valid number', variant: 'destructive' })
      return
    }
    if (value === Number(target.manual_actual ?? 0)) return
    const { error } = await supabase
      .from('scorecard_targets')
      .update({ manual_actual: value })
      .eq('id', target.id)
    if (error) {
      toast({ title: 'Could not save actual', description: error.message, variant: 'destructive' })
      load()
      return
    }
    setTargets((prev) =>
      prev.map((t) => (t.id === target.id ? { ...t, manual_actual: value } : t)),
    )
  }

  async function generateSummary(staffId: string) {
    setGenerating(staffId)
    try {
      const res = await fetch('/api/admin/scorecards/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId, week_start: weekStart }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not generate summary', description: json.error, variant: 'destructive' })
        return
      }
      setSummaries((prev) => ({ ...prev, [staffId]: json.summary as ScorecardSummaryRow }))
      toast({ title: 'Summary generated' })
    } catch (e) {
      toast({
        title: 'Could not generate summary',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setGenerating(null)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading scorecards…
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Scorecards"
        description="Set each staff member's weekly targets (Monday–Sunday). Auto targets pull live from tasks completed and hours logged; manual targets are self-reported by staff. Generate a Friday summary with a performance score and an AI narrative."
      />

      {/* Week picker */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="secondary"
          size="sm"
          icon={<ChevronLeft size={15} />}
          onClick={() => setWeekStart((w) => addWeeks(w, -1))}
          aria-label="Previous week"
        />
        <div className="min-w-[220px] text-center">
          <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
            {formatWeekRange(weekStart)}
          </p>
          <p className="text-xs text-text-dim">
            {isCurrentWeek(weekStart) ? 'This week' : 'Week beginning ' + weekStart}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<ChevronRight size={15} />}
          onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          aria-label="Next week"
        />
        {!isCurrentWeek(weekStart) && (
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(mondayOf())}>
            This week
          </Button>
        )}
      </div>

      {staff.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <AdminEmptyState
              icon={Target}
              title="No staff yet"
              description="Add team members under Accountability → Team Members, then set their weekly targets here."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {staff.map((s) => {
            const auto = autoByStaff[s.id] ?? { tasksCompleted: 0, hoursLogged: 0 }
            const staffTargets = targetsByStaff[s.id] ?? []
            const { met, total, score } = computeScore(staffTargets, auto)
            const summary = summaries[s.id]
            return (
              <Card key={s.id}>
                <CardContent className="p-0">
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-text">{personName(s)}</p>
                      {total > 0 && (
                        <Badge
                          variant={score >= 80 ? 'active' : score >= 50 ? 'upcoming' : 'urgent'}
                        >
                          {met}/{total} met · {score}%
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Plus size={14} />}
                        onClick={() => openAdd(s.id)}
                      >
                        Add target
                      </Button>
                      <Button
                        size="sm"
                        icon={<Sparkles size={14} />}
                        loading={generating === s.id}
                        disabled={staffTargets.length === 0}
                        onClick={() => generateSummary(s.id)}
                      >
                        Generate summary
                      </Button>
                    </div>
                  </div>

                  {/* Targets */}
                  {staffTargets.length === 0 ? (
                    <div className="px-5 py-8 text-sm text-text-muted">
                      No targets set for this week yet. Add one to start tracking.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Target</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Target</TableHead>
                          <TableHead className="text-right">Actual</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {staffTargets.map((t) => {
                          const actual = actualForTarget(t, auto)
                          const isMet = isTargetMet(t, auto)
                          const srcMeta = SCORECARD_SOURCE_META[t.source as ScorecardSource]
                          return (
                            <TableRow key={t.id} className="hover:bg-transparent">
                              <TableCell className="font-medium text-text">{t.label}</TableCell>
                              <TableCell className="text-text-muted text-xs">
                                {srcMeta?.label ?? t.source}
                              </TableCell>
                              <TableCell className="text-right text-text-muted tabular-nums">
                                {Number(t.target_value)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {t.source === 'manual' ? (
                                  <div className="w-24 ml-auto">
                                    <ManualActualInput
                                      key={t.id + String(t.manual_actual)}
                                      initial={Number(t.manual_actual ?? 0)}
                                      onSave={(v) => saveManualActual(t, v)}
                                    />
                                  </div>
                                ) : (
                                  <span className="text-text">
                                    {t.source === 'hours_logged'
                                      ? `${actual}h`
                                      : actual}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={isMet ? 'active' : 'draft'}>
                                  {isMet ? 'Met' : 'Outstanding'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <button
                                  onClick={() => openEdit(t)}
                                  className="text-text-dim hover:text-text transition-colors"
                                  aria-label="Edit target"
                                >
                                  <Pencil size={14} />
                                </button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}

                  {/* Friday summary */}
                  {summary && (
                    <div className="px-5 py-4 border-t border-border bg-surface-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={14} className="text-gold" />
                        <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
                          Friday summary · score {summary.performance_score}% ·{' '}
                          {summary.targets_met}/{summary.targets_total} met
                        </p>
                      </div>
                      <p className="text-sm text-text whitespace-pre-wrap">{summary.narrative}</p>
                      {summary.generated_at && (
                        <p className="text-xs text-text-dim mt-2">
                          Generated {formatDateTime(summary.generated_at)}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add / edit target modal */}
      <Modal
        open={!!modalStaffId}
        onClose={closeModal}
        title={editingId ? 'Edit target' : 'Add target'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Label"
            placeholder="e.g. Outreach messages"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Target number"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              placeholder="50"
              value={form.target_value}
              onChange={(e) => setForm({ ...form, target_value: e.target.value })}
            />
            <SelectMenu
              label="Source"
              value={form.source}
              onValueChange={(v) => setForm({ ...form, source: v as ScorecardSource })}
              options={SCORECARD_SOURCE_OPTIONS}
            />
          </div>
          <p className="text-xs text-text-dim -mt-1">
            {SCORECARD_SOURCE_META[form.source].hint}
          </p>
          {form.source === 'manual' && (
            <Input
              label="Actual so far (optional)"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              placeholder="0"
              value={form.manual_actual}
              onChange={(e) => setForm({ ...form, manual_actual: e.target.value })}
            />
          )}
          <div className="flex items-center justify-between pt-2">
            {editingId ? (
              <Button
                variant="ghost"
                icon={<Trash2 size={14} />}
                className="text-accent-warm"
                onClick={removeTarget}
              >
                Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button loading={saving} onClick={saveTarget}>
                {editingId ? 'Save changes' : 'Add target'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// Small controlled input that commits on blur / Enter.
function ManualActualInput({
  initial,
  onSave,
}: {
  initial: number
  onSave: (value: string) => void
}) {
  const [value, setValue] = useState(String(initial))
  return (
    <Input
      type="number"
      min="0"
      step="1"
      inputMode="decimal"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSave(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      className="text-right"
    />
  )
}
