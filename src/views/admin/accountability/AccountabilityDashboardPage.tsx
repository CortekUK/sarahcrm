'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
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
import { cn } from '@/lib/utils'
import {
  Loader2,
  AlertTriangle,
  Ban,
  ClipboardCheck,
  Target,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { personName, type PersonLite } from '@/lib/accountability'
import { formatHours } from '@/lib/time-tracking'
import { handoverHasContent, today, formatHandoverDate } from '@/lib/handover'
import {
  mondayOf,
  weekEnd,
  formatWeekRange,
  computeScore,
  tasksCompletedInWeek,
  hoursLoggedInWeek,
  type ScorecardTargetRow,
} from '@/lib/scorecards'

// ── Row shapes we fetch (thin projections) ───────────────────
interface TaskRow {
  id: string
  title: string
  owner_id: string
  status: string
  deadline: string | null
  updated_at: string
}
interface EntryRow {
  staff_id: string
  hours: number | null
  entry_date: string
}
interface SummaryRow {
  staff_id: string
  performance_score: number | null
  targets_met: number | null
  targets_total: number | null
}
interface HandoverRow {
  staff_id: string
  completed_today: string | null
  working_tomorrow: string | null
  blocked: string | null
  support_needed: string | null
}

// Below this score (%) a staff member's week is flagged as "needs attention".
const LOW_SCORE_THRESHOLD = 50

// Calendar-day difference: how many days ago was `deadline` (date part only)
// relative to today. > 0 means overdue by that many days.
function daysLate(deadline: string): number {
  const dPart = deadline.slice(0, 10)
  const dl = new Date(`${dPart}T00:00:00`).getTime()
  const now = new Date(`${today()}T00:00:00`).getTime()
  return Math.round((now - dl) / 86_400_000)
}

// A task is overdue when it has a deadline before today and isn't done.
function isOverdue(t: TaskRow): boolean {
  if (!t.deadline || t.status === 'done') return false
  return daysLate(t.deadline) > 0
}

export function AccountabilityDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<PersonLite[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [targets, setTargets] = useState<ScorecardTargetRow[]>([])
  const [summaries, setSummaries] = useState<SummaryRow[]>([])
  const [handovers, setHandovers] = useState<HandoverRow[]>([])

  const weekStart = useMemo(() => mondayOf(), [])
  const weekEndDate = useMemo(() => weekEnd(weekStart), [weekStart])
  const todayStr = useMemo(() => today(), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [staffRes, tasksRes, entriesRes, targetsRes, summariesRes, handoversRes] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('role', ['team_member', 'freelancer'])
            .eq('staff_status', 'active'),
          supabase
            .from('accountability_tasks')
            .select('id, title, owner_id, status, deadline, updated_at'),
          supabase
            .from('time_entries')
            .select('staff_id, hours, entry_date')
            .gte('entry_date', weekStart)
            .lte('entry_date', weekEndDate),
          supabase
            .from('scorecard_targets')
            .select('id, staff_id, week_start, label, target_value, source, manual_actual, created_by, created_at, updated_at')
            .eq('week_start', weekStart),
          supabase
            .from('scorecard_summaries')
            .select('staff_id, performance_score, targets_met, targets_total')
            .eq('week_start', weekStart),
          supabase
            .from('daily_handovers')
            .select('staff_id, completed_today, working_tomorrow, blocked, support_needed')
            .eq('handover_date', todayStr),
        ])
      if (cancelled) return
      if (staffRes.data) setStaff(staffRes.data as PersonLite[])
      if (tasksRes.data) setTasks(tasksRes.data as TaskRow[])
      if (entriesRes.data) setEntries(entriesRes.data as EntryRow[])
      if (targetsRes.data) setTargets(targetsRes.data as ScorecardTargetRow[])
      if (summariesRes.data) setSummaries(summariesRes.data as SummaryRow[])
      if (handoversRes.data) setHandovers(handoversRes.data as HandoverRow[])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [weekStart, weekEndDate, todayStr])

  // Active-staff scoping: all headline numbers count only tasks owned by
  // currently-active staff so the top row matches the per-staff table.
  const activeIds = useMemo(() => new Set(staff.map((s) => s.id)), [staff])
  const peopleById = useMemo(() => {
    const m: Record<string, PersonLite> = {}
    for (const s of staff) m[s.id] = s
    return m
  }, [staff])

  const staffTasks = useMemo(
    () => tasks.filter((t) => activeIds.has(t.owner_id)),
    [tasks, activeIds],
  )

  const summaryByStaff = useMemo(() => {
    const m: Record<string, SummaryRow> = {}
    for (const s of summaries) m[s.staff_id] = s
    return m
  }, [summaries])

  const handoverByStaff = useMemo(() => {
    const m: Record<string, HandoverRow> = {}
    for (const h of handovers) m[h.staff_id] = h
    return m
  }, [handovers])

  const targetsByStaff = useMemo(() => {
    const m: Record<string, ScorecardTargetRow[]> = {}
    for (const t of targets) (m[t.staff_id] ??= []).push(t)
    return m
  }, [targets])

  // Per-staff auto metrics for the current week.
  function weekMetrics(staffId: string) {
    const myTasks = tasks.filter((t) => t.owner_id === staffId)
    const myEntries = entries.filter((e) => e.staff_id === staffId)
    return {
      tasksCompleted: tasksCompletedInWeek(myTasks, weekStart),
      hoursLogged: hoursLoggedInWeek(myEntries, weekStart),
    }
  }

  // Scorecard score for a staff member: prefer a generated summary, else
  // compute met/total from this week's targets + live auto metrics.
  function scoreFor(staffId: string): { score: number | null; met: number; total: number } {
    const summary = summaryByStaff[staffId]
    const myTargets = targetsByStaff[staffId] ?? []
    if (summary && summary.performance_score != null) {
      return {
        score: Number(summary.performance_score),
        met: summary.targets_met ?? 0,
        total: summary.targets_total ?? myTargets.length,
      }
    }
    if (myTargets.length === 0) return { score: null, met: 0, total: 0 }
    const s = computeScore(myTargets, weekMetrics(staffId))
    return { score: s.score, met: s.met, total: s.total }
  }

  // ── Per-staff workload rows ────────────────────────────────
  const staffRows = useMemo(() => {
    return staff.map((s) => {
      const mine = tasks.filter((t) => t.owner_id === s.id)
      const open = mine.filter((t) => t.status !== 'done').length
      const overdue = mine.filter(isOverdue).length
      const blocked = mine.filter((t) => t.status === 'blocked').length
      const hours = hoursLoggedInWeek(
        entries.filter((e) => e.staff_id === s.id),
        weekStart,
      )
      const completedThisWeek = tasksCompletedInWeek(mine, weekStart)
      const sc = scoreFor(s.id)
      const handover = handoverByStaff[s.id]
      const submitted = handoverHasContent(handover ?? null)
      return { person: s, open, overdue, blocked, hours, completedThisWeek, sc, submitted }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, tasks, entries, weekStart, summaryByStaff, targetsByStaff, handoverByStaff])

  // ── Headline stats ─────────────────────────────────────────
  const stats = useMemo(() => {
    const openTasks = staffTasks.filter((t) => t.status !== 'done').length
    const overdueTasks = staffTasks.filter(isOverdue).length
    const blockedTasks = staffTasks.filter((t) => t.status === 'blocked').length
    const hoursThisWeek = hoursLoggedInWeek(
      entries.filter((e) => activeIds.has(e.staff_id)),
      weekStart,
    )
    const submittedToday = staff.filter((s) =>
      handoverHasContent(handoverByStaff[s.id] ?? null),
    ).length
    return {
      activeStaff: staff.length,
      openTasks,
      overdueTasks,
      blockedTasks,
      hoursThisWeek,
      submittedToday,
    }
  }, [staffTasks, entries, activeIds, weekStart, staff, handoverByStaff])

  // Task status breakdown (active staff) for the small visual.
  const statusBreakdown = useMemo(() => {
    const counts = { not_started: 0, in_progress: 0, blocked: 0, done: 0 } as Record<string, number>
    for (const t of staffTasks) counts[t.status] = (counts[t.status] ?? 0) + 1
    const total = staffTasks.length
    return { counts, total }
  }, [staffTasks])

  // ── At-risk lists ──────────────────────────────────────────
  const overdueList = useMemo(
    () =>
      staffTasks
        .filter(isOverdue)
        .map((t) => ({ task: t, days: daysLate(t.deadline as string) }))
        .sort((a, b) => b.days - a.days),
    [staffTasks],
  )
  const blockedList = useMemo(
    () => staffTasks.filter((t) => t.status === 'blocked'),
    [staffTasks],
  )
  const missingHandover = useMemo(
    () => staff.filter((s) => !handoverHasContent(handoverByStaff[s.id] ?? null)),
    [staff, handoverByStaff],
  )
  const lowScorers = useMemo(
    () =>
      staffRows
        .filter((r) => r.sc.total > 0 && r.sc.score != null && r.sc.score < LOW_SCORE_THRESHOLD)
        .map((r) => ({ person: r.person, score: r.sc.score as number, met: r.sc.met, total: r.sc.total })),
    [staffRows],
  )

  const nothingAtRisk =
    overdueList.length === 0 &&
    blockedList.length === 0 &&
    missingHandover.length === 0 &&
    lowScorers.length === 0

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading accountability dashboard…
      </div>
    )
  }

  const STATUS_BAR: { key: string; label: string; className: string }[] = [
    { key: 'not_started', label: 'Not started', className: 'bg-text-dim' },
    { key: 'in_progress', label: 'In progress', className: 'bg-accent-blue' },
    { key: 'blocked', label: 'Blocked', className: 'bg-accent-warm' },
    { key: 'done', label: 'Done', className: 'bg-accent' },
  ]

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Accountability Overview"
        description="A read-only, team-only snapshot of the accountability system — workload, hours, scorecards and handovers — surfacing what needs Sarah's attention right now."
        meta={
          <span className="text-xs text-text-dim">
            This week: {formatWeekRange(weekStart)} · Today: {formatHandoverDate(todayStr)}
          </span>
        }
      />

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5 mb-8">
        <StatCard label="Active staff" value={stats.activeStaff} />
        <StatCard label="Open tasks" value={stats.openTasks} />
        <StatCard
          label="Overdue tasks"
          value={stats.overdueTasks}
          changeText={stats.overdueTasks > 0 ? 'needs attention' : 'all on time'}
          changeType={stats.overdueTasks > 0 ? 'negative' : 'positive'}
        />
        <StatCard
          label="Blocked tasks"
          value={stats.blockedTasks}
          changeText={stats.blockedTasks > 0 ? 'needs attention' : 'none blocked'}
          changeType={stats.blockedTasks > 0 ? 'negative' : 'positive'}
        />
        <StatCard label="Hours this week" value={formatHours(stats.hoursThisWeek)} />
        <StatCard
          label="Handovers today"
          value={`${stats.submittedToday}/${stats.activeStaff}`}
          changeText={
            stats.activeStaff > 0 && stats.submittedToday < stats.activeStaff
              ? `${stats.activeStaff - stats.submittedToday} waiting`
              : 'all in'
          }
          changeType={
            stats.activeStaff > 0 && stats.submittedToday < stats.activeStaff
              ? 'negative'
              : 'positive'
          }
        />
      </div>

      {/* Task status breakdown (small visual) */}
      {statusBreakdown.total > 0 && (
        <Card className="mb-8">
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-[family-name:var(--font-heading)] text-sm font-semibold text-text">
                Task status breakdown
              </h2>
              <span className="text-xs text-text-dim">{statusBreakdown.total} tasks</span>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              {STATUS_BAR.map((s) => {
                const n = statusBreakdown.counts[s.key] ?? 0
                if (!n) return null
                const pct = (n / statusBreakdown.total) * 100
                return (
                  <div
                    key={s.key}
                    className={cn('h-full', s.className)}
                    style={{ width: `${pct}%` }}
                    title={`${s.label}: ${n}`}
                  />
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {STATUS_BAR.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-xs text-text-muted">
                  <span className={cn('h-2.5 w-2.5 rounded-full', s.className)} />
                  {s.label}
                  <span className="tabular-nums text-text-dim">
                    {statusBreakdown.counts[s.key] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* At-risk / needs attention */}
      <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text mb-3">
        Needs attention
      </h2>
      <Card className="mb-8">
        <CardContent className={nothingAtRisk ? 'p-0' : undefined}>
          {nothingAtRisk ? (
            <div className="py-16">
              <AdminEmptyState
                icon={CheckCircle2}
                title="Nothing needs attention"
                description="No overdue or blocked tasks, everyone has submitted today's handover, and no scorecard is running low this week."
              />
            </div>
          ) : (
            <div className="grid gap-8 md:grid-cols-2">
              {/* Overdue tasks */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={15} className="text-accent-warm" />
                  <h3 className="text-sm font-semibold text-text">Overdue tasks</h3>
                  <span className="text-xs text-text-dim">({overdueList.length})</span>
                </div>
                {overdueList.length === 0 ? (
                  <p className="text-sm text-text-dim">None — all deadlines on track.</p>
                ) : (
                  <ul className="space-y-2">
                    {overdueList.map(({ task, days }) => (
                      <li key={task.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-text truncate">{task.title}</p>
                          <p className="text-xs text-text-dim">
                            {personName(peopleById[task.owner_id])}
                          </p>
                        </div>
                        <Badge variant="urgent" className="shrink-0">
                          {days}d late
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Blocked tasks */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Ban size={15} className="text-accent-warm" />
                  <h3 className="text-sm font-semibold text-text">Blocked tasks</h3>
                  <span className="text-xs text-text-dim">({blockedList.length})</span>
                </div>
                {blockedList.length === 0 ? (
                  <p className="text-sm text-text-dim">None blocked.</p>
                ) : (
                  <ul className="space-y-2">
                    {blockedList.map((task) => (
                      <li key={task.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-text truncate">{task.title}</p>
                          <p className="text-xs text-text-dim">
                            {personName(peopleById[task.owner_id])}
                          </p>
                        </div>
                        <Badge variant="urgent" className="shrink-0">
                          Blocked
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Missing handover today */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ClipboardCheck size={15} className="text-gold" />
                  <h3 className="text-sm font-semibold text-text">No handover today</h3>
                  <span className="text-xs text-text-dim">({missingHandover.length})</span>
                </div>
                {missingHandover.length === 0 ? (
                  <p className="text-sm text-text-dim">Everyone has submitted today.</p>
                ) : (
                  <ul className="space-y-2">
                    {missingHandover.map((s) => (
                      <li key={s.id} className="flex items-center gap-2">
                        <XCircle size={14} className="text-accent-warm shrink-0" />
                        <span className="text-sm text-text">{personName(s)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Low scorecards */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Target size={15} className="text-gold" />
                  <h3 className="text-sm font-semibold text-text">
                    Low scorecard this week
                  </h3>
                  <span className="text-xs text-text-dim">({lowScorers.length})</span>
                </div>
                {lowScorers.length === 0 ? (
                  <p className="text-sm text-text-dim">
                    No one below {LOW_SCORE_THRESHOLD}%.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {lowScorers.map((r) => (
                      <li
                        key={r.person.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-text truncate">
                            {personName(r.person)}
                          </p>
                          <p className="text-xs text-text-dim">
                            {r.met}/{r.total} targets met
                          </p>
                        </div>
                        <Badge variant="urgent" className="shrink-0">
                          {r.score}%
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-staff workload */}
      <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text mb-3">
        Per-staff workload
      </h2>
      <Card>
        <CardContent className="p-0">
          {staffRows.length === 0 ? (
            <div className="py-16">
              <AdminEmptyState
                icon={Target}
                title="No active staff"
                description="Add or activate team members under Accountability → Team Members."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Staff member</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Blocked</TableHead>
                  <TableHead className="text-right">Hours (wk)</TableHead>
                  <TableHead className="text-right">Done (wk)</TableHead>
                  <TableHead className="text-right">Scorecard</TableHead>
                  <TableHead className="text-center">Handover</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffRows.map((r) => (
                  <TableRow key={r.person.id} className="hover:bg-transparent">
                    <TableCell className="font-medium text-text">
                      {personName(r.person)}
                    </TableCell>
                    <TableCell className="text-right text-text-muted tabular-nums">
                      {r.open}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        r.overdue > 0 ? 'text-accent-warm font-medium' : 'text-text-muted',
                      )}
                    >
                      {r.overdue}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        r.blocked > 0 ? 'text-accent-warm font-medium' : 'text-text-muted',
                      )}
                    >
                      {r.blocked}
                    </TableCell>
                    <TableCell className="text-right text-text-muted tabular-nums">
                      {formatHours(r.hours)}
                    </TableCell>
                    <TableCell className="text-right text-text-muted tabular-nums">
                      {r.completedThisWeek}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.sc.score == null ? (
                        <span className="text-text-dim">—</span>
                      ) : (
                        <span
                          className={cn(
                            'font-medium',
                            r.sc.score < LOW_SCORE_THRESHOLD
                              ? 'text-accent-warm'
                              : 'text-accent',
                          )}
                        >
                          {r.sc.score}%
                          <span className="ml-1 text-xs font-normal text-text-dim">
                            ({r.sc.met}/{r.sc.total})
                          </span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.submitted ? (
                        <CheckCircle2 size={16} className="inline text-accent" />
                      ) : (
                        <XCircle size={16} className="inline text-accent-warm" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
