'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/lib/hooks/use-toast'
import { formatDateTime } from '@/lib/utils'
import { Loader2, Sparkles, Target } from 'lucide-react'
import {
  type ScorecardTargetRow,
  type ScorecardSummaryRow,
  type ScorecardSource,
  SCORECARD_SOURCE_META,
  mondayOf,
  formatWeekRange,
  actualForTarget,
  isTargetMet,
  computeScore,
  tasksCompletedInWeek,
  hoursLoggedInWeek,
  type WeekActualInputs,
} from '@/lib/scorecards'

// Staff self-service scorecard. RLS scopes every query to the signed-in user:
// their own targets, their own tasks/time entries (for the live auto metrics),
// and their own read-only Friday summary. A staff member may only edit the
// actual value of their own MANUAL targets (enforced by policy + trigger).
export function StaffScorecardPanel() {
  const { profile } = useAuth()
  const weekStart = useMemo(() => mondayOf(), [])
  const [loading, setLoading] = useState(true)
  const [targets, setTargets] = useState<ScorecardTargetRow[]>([])
  const [auto, setAuto] = useState<WeekActualInputs>({ tasksCompleted: 0, hoursLogged: 0 })
  const [summary, setSummary] = useState<ScorecardSummaryRow | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function load() {
    if (!profile?.id) return
    setLoading(true)
    const [targetsRes, tasksRes, entriesRes, summaryRes] = await Promise.all([
      supabase.from('scorecard_targets').select('*').eq('week_start', weekStart),
      supabase.from('accountability_tasks').select('status, updated_at'),
      supabase.from('time_entries').select('hours, entry_date'),
      supabase
        .from('scorecard_summaries')
        .select('*')
        .eq('week_start', weekStart)
        .maybeSingle(),
    ])
    if (targetsRes.data) setTargets(targetsRes.data as ScorecardTargetRow[])
    setAuto({
      tasksCompleted: tasksCompletedInWeek(tasksRes.data ?? [], weekStart),
      hoursLogged: hoursLoggedInWeek(entriesRes.data ?? [], weekStart),
    })
    setSummary((summaryRes.data as ScorecardSummaryRow | null) ?? null)
    setLoading(false)
  }

  const { met, total, score } = useMemo(() => computeScore(targets, auto), [targets, auto])

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
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
      load()
      return
    }
    setTargets((prev) =>
      prev.map((t) => (t.id === target.id ? { ...t, manual_actual: value } : t)),
    )
    toast({ title: 'Saved' })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-text-muted py-6">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your scorecard…
      </div>
    )
  }

  return (
    <div className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text">
            My scorecard
          </h2>
          <p className="text-sm text-text-muted mt-0.5">
            This week · {formatWeekRange(weekStart)}
          </p>
        </div>
        {total > 0 && (
          <Badge variant={score >= 80 ? 'active' : score >= 50 ? 'upcoming' : 'urgent'}>
            {met}/{total} met · {score}%
          </Badge>
        )}
      </div>

      {targets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Target className="mx-auto mb-3 text-text-dim" size={26} />
            <p className="text-text font-medium">No targets set for this week</p>
            <p className="text-sm text-text-muted mt-1">
              Your manager sets weekly targets — check back once they’re added.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {targets.map((t) => {
            const actual = actualForTarget(t, auto)
            const isMet = isTargetMet(t, auto)
            const srcMeta = SCORECARD_SOURCE_META[t.source as ScorecardSource]
            const tgt = Number(t.target_value)
            const pct = tgt > 0 ? Math.min(100, Math.round((actual / tgt) * 100)) : 100
            return (
              <div
                key={t.id}
                className="rounded-[var(--radius-lg)] border border-border bg-surface px-5 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-text">{t.label}</p>
                    <p className="text-xs text-text-dim mt-0.5">{srcMeta?.label ?? t.source}</p>
                  </div>
                  <Badge variant={isMet ? 'active' : 'draft'}>
                    {isMet ? 'Met' : 'Outstanding'}
                  </Badge>
                </div>

                {/* Manual self-report input — its own right-aligned row */}
                {t.source === 'manual' && (
                  <div className="mt-3 flex items-center justify-end gap-3">
                    <span className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-text-muted">
                      My actual
                    </span>
                    <div className="w-24">
                      <ManualActualInput
                        key={t.id + String(t.manual_actual)}
                        initial={Number(t.manual_actual ?? 0)}
                        onSave={(v) => saveManualActual(t, v)}
                      />
                    </div>
                  </div>
                )}

                {/* Progress bar — full width */}
                <div className="mt-3">
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className={isMet ? 'h-full bg-accent' : 'h-full bg-gold'}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-text-muted mt-1 tabular-nums">
                    {t.source === 'hours_logged' ? `${actual}h` : actual} of {tgt}
                    {t.source === 'hours_logged' ? 'h' : ''}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Read-only Friday summary */}
      {summary && (
        <div className="mt-4 rounded-[var(--radius-lg)] border border-border bg-surface-2 px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-gold" />
            <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
              Friday summary · score {summary.performance_score}% · {summary.targets_met}/
              {summary.targets_total} met
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
    </div>
  )
}

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
    />
  )
}
