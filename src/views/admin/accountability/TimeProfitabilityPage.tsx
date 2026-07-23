'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
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
import { toast } from '@/lib/hooks/use-toast'
import { formatDate, cn } from '@/lib/utils'
import { Loader2, Coins } from 'lucide-react'
import { personName, type PersonLite } from '@/lib/accountability'
import { formatHours, formatPounds } from '@/lib/time-tracking'

interface TaskLite {
  id: string
  owner_id: string
  event_id: string | null
  status: string
}
interface EventLite {
  id: string
  title: string
  start_date: string
}
interface EntryLite {
  staff_id: string
  task_id: string
  hours: number | null
}

// Inline editable event revenue (£, in pounds). Upserts event_profitability.
function RevenueCell({
  eventId,
  initial,
  adminId,
  onSaved,
}: {
  eventId: string
  initial: number
  adminId: string | null
  onSaved: (revenue: number) => void
}) {
  const [value, setValue] = useState(initial ? String(initial) : '')
  const [saved, setSaved] = useState(initial ? String(initial) : '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (value === saved) return
    const trimmed = value.trim()
    const revenue = trimmed === '' ? 0 : Number(trimmed)
    if (!Number.isFinite(revenue) || revenue < 0) {
      toast({ title: 'Enter a valid revenue amount', variant: 'destructive' })
      setValue(saved)
      return
    }
    setBusy(true)
    const { error } = await supabase.from('event_profitability').upsert(
      {
        event_id: eventId,
        revenue,
        updated_by: adminId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' },
    )
    setBusy(false)
    if (error) {
      toast({ title: 'Could not save revenue', description: error.message, variant: 'destructive' })
      setValue(saved)
      return
    }
    setSaved(value)
    onSaved(revenue)
    toast({ title: 'Revenue saved' })
  }

  return (
    <div className="w-32">
      <Input
        type="number"
        min="0"
        step="1"
        inputMode="decimal"
        prefix="£"
        placeholder="0.00"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
    </div>
  )
}

export function TimeProfitabilityPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [events, setEvents] = useState<EventLite[]>([])
  const [entries, setEntries] = useState<EntryLite[]>([])
  const [staff, setStaff] = useState<PersonLite[]>([])
  const [ratesById, setRatesById] = useState<Record<string, number>>({})
  const [revenueByEvent, setRevenueByEvent] = useState<Record<string, number>>({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [tasksRes, eventsRes, entriesRes, staffRes, ratesRes, profitRes] =
      await Promise.all([
        supabase.from('accountability_tasks').select('id, owner_id, event_id, status'),
        supabase.from('events').select('id, title, start_date').order('start_date', { ascending: false }),
        supabase.from('time_entries').select('staff_id, task_id, hours'),
        supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('role', ['team_member', 'freelancer']),
        supabase.from('staff_rates').select('staff_id, hourly_rate'),
        supabase.from('event_profitability').select('event_id, revenue'),
      ])
    if (tasksRes.data) setTasks(tasksRes.data as TaskLite[])
    if (eventsRes.data) setEvents(eventsRes.data as EventLite[])
    if (entriesRes.data) setEntries(entriesRes.data as EntryLite[])
    if (staffRes.data) setStaff(staffRes.data as PersonLite[])
    if (ratesRes.data) {
      const m: Record<string, number> = {}
      for (const r of ratesRes.data) m[r.staff_id] = Number(r.hourly_rate ?? 0)
      setRatesById(m)
    }
    if (profitRes.data) {
      const m: Record<string, number> = {}
      for (const p of profitRes.data) m[p.event_id] = Number(p.revenue ?? 0)
      setRevenueByEvent(m)
    }
    setLoading(false)
  }

  const taskById = useMemo(() => {
    const m: Record<string, TaskLite> = {}
    for (const t of tasks) m[t.id] = t
    return m
  }, [tasks])

  const eventById = useMemo(() => {
    const m: Record<string, EventLite> = {}
    for (const e of events) m[e.id] = e
    return m
  }, [events])

  // Per-event rollup: hours + cost (Σ hours × the entry's staff rate).
  const eventStats = useMemo(() => {
    const hours: Record<string, number> = {}
    const cost: Record<string, number> = {}
    for (const e of entries) {
      const h = Number(e.hours ?? 0)
      if (!h) continue
      const task = taskById[e.task_id]
      if (!task?.event_id) continue
      const rate = ratesById[e.staff_id] ?? 0
      hours[task.event_id] = (hours[task.event_id] ?? 0) + h
      cost[task.event_id] = (cost[task.event_id] ?? 0) + h * rate
    }
    return { hours, cost }
  }, [entries, taskById, ratesById])

  // Events worth showing: those with linked tasks, logged time, or a set
  // revenue. Sorted by start_date desc (events already are).
  const eventRows = useMemo(() => {
    const linked = new Set<string>()
    for (const t of tasks) if (t.event_id) linked.add(t.event_id)
    return events
      .filter(
        (ev) =>
          linked.has(ev.id) ||
          (eventStats.hours[ev.id] ?? 0) > 0 ||
          revenueByEvent[ev.id] != null,
      )
      .map((ev) => {
        const revenue = revenueByEvent[ev.id] ?? 0
        const cost = eventStats.cost[ev.id] ?? 0
        return {
          event: ev,
          hours: eventStats.hours[ev.id] ?? 0,
          revenue,
          cost,
          profit: revenue - cost,
        }
      })
  }, [events, tasks, eventStats, revenueByEvent])

  // Per-staff summary: total hours + completed tasks + cost.
  const staffRows = useMemo(() => {
    const hours: Record<string, number> = {}
    for (const e of entries) hours[e.staff_id] = (hours[e.staff_id] ?? 0) + Number(e.hours ?? 0)
    const doneByStaff: Record<string, number> = {}
    for (const t of tasks)
      if (t.status === 'done') doneByStaff[t.owner_id] = (doneByStaff[t.owner_id] ?? 0) + 1
    return staff.map((s) => {
      const h = Math.round((hours[s.id] ?? 0) * 100) / 100
      const rate = ratesById[s.id] ?? 0
      return {
        person: s,
        hours: h,
        rate,
        cost: h * rate,
        completed: doneByStaff[s.id] ?? 0,
      }
    })
  }, [staff, entries, tasks, ratesById])

  const totals = useMemo(() => {
    const revenue = eventRows.reduce((a, r) => a + r.revenue, 0)
    const cost = eventRows.reduce((a, r) => a + r.cost, 0)
    const hours = eventRows.reduce((a, r) => a + r.hours, 0)
    return { revenue, cost, profit: revenue - cost, hours }
  }, [eventRows])

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading time &amp; profitability…
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Time & Profitability"
        description="Hours roll up from each staff member's tasks to the event they're linked to. Enter an event's revenue and the system computes cost (hours × rate) and profit."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard label="Tracked revenue" value={formatPounds(totals.revenue)} />
        <StatCard label="Staff cost" value={formatPounds(totals.cost)} changeText="hours × rate" changeType="neutral" />
        <StatCard
          label="Profit"
          value={formatPounds(totals.profit)}
          changeText={totals.profit >= 0 ? 'in the black' : 'in the red'}
          changeType={totals.profit >= 0 ? 'positive' : 'negative'}
        />
        <StatCard label="Hours (linked)" value={formatHours(totals.hours)} />
      </div>

      {/* Per-event profitability */}
      <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text mb-3">
        By event
      </h2>
      <Card className="mb-8">
        <CardContent className="p-0">
          {eventRows.length === 0 ? (
            <div className="py-16">
              <AdminEmptyState
                icon={Coins}
                title="No events being tracked yet"
                description="Link a task to an event (Accountability → Tasks) so its logged time rolls up here, then enter the event's revenue."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventRows.map((r) => (
                  <TableRow key={r.event.id} className="hover:bg-transparent">
                    <TableCell>
                      <p className="font-medium text-text">{r.event.title}</p>
                      <p className="text-xs text-text-dim">{formatDate(r.event.start_date)}</p>
                    </TableCell>
                    <TableCell className="text-right text-text-muted tabular-nums">
                      {formatHours(r.hours)}
                    </TableCell>
                    <TableCell className="text-right text-text-muted tabular-nums">
                      {formatPounds(r.cost)}
                    </TableCell>
                    <TableCell>
                      <RevenueCell
                        eventId={r.event.id}
                        initial={r.revenue}
                        adminId={profile?.id ?? null}
                        onSaved={(revenue) =>
                          setRevenueByEvent((prev) => ({ ...prev, [r.event.id]: revenue }))
                        }
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        r.profit >= 0 ? 'text-accent' : 'text-accent-warm',
                      )}
                    >
                      {formatPounds(r.profit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Per-staff summary */}
      <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text mb-3">
        By staff member
      </h2>
      <Card>
        <CardContent className="p-0">
          {staffRows.length === 0 ? (
            <div className="py-16">
              <AdminEmptyState
                icon={Coins}
                title="No staff yet"
                description="Add team members under Accountability → Team Members."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Staff member</TableHead>
                  <TableHead className="text-right">Total hours</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Tasks completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffRows.map((r) => (
                  <TableRow key={r.person.id} className="hover:bg-transparent">
                    <TableCell className="font-medium text-text">{personName(r.person)}</TableCell>
                    <TableCell className="text-right text-text-muted tabular-nums">
                      {formatHours(r.hours)}
                    </TableCell>
                    <TableCell className="text-right text-text-muted tabular-nums">
                      {r.rate ? `${formatPounds(r.rate)}/h` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-text-muted tabular-nums">
                      {formatPounds(r.cost)}
                    </TableCell>
                    <TableCell className="text-right text-text-muted tabular-nums">
                      {r.completed}
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
