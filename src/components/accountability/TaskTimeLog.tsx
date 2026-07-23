'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DateField } from '@/components/ui/DateField'
import { Textarea } from '@/components/ui/Textarea'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate, cn } from '@/lib/utils'
import { Loader2, Play, Square, Trash2, Clock } from 'lucide-react'
import {
  type TimeEntryRow,
  formatHours,
  hoursBetween,
  isRunningTimer,
  elapsedClock,
  sumHours,
} from '@/lib/time-tracking'

// Staff-facing time log for a SINGLE task. Manual hours entry + a start/stop
// timer, the list of this task's entries and a running total. RLS guarantees
// a staff member only ever reads/writes their own entries on their own tasks.
//
// `onChanged` lets the parent refresh any cross-task totals it shows.
export function TaskTimeLog({
  taskId,
  staffId,
  onChanged,
}: {
  taskId: string
  staffId: string
  onChanged?: () => void
}) {
  const [entries, setEntries] = useState<TimeEntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const today = new Date().toISOString().slice(0, 10)
  const [hours, setHours] = useState('')
  const [entryDate, setEntryDate] = useState(today)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('task_id', taskId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (data) setEntries(data)
    setLoading(false)
  }, [taskId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const running = useMemo(() => entries.find(isRunningTimer) ?? null, [entries])

  // Tick once a second only while a timer is running.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])

  const total = useMemo(() => sumHours(entries), [entries])

  async function addManual() {
    const h = Number(hours)
    if (!Number.isFinite(h) || h <= 0) {
      toast({ title: 'Enter a number of hours greater than 0', variant: 'destructive' })
      return
    }
    setBusy(true)
    const { error } = await supabase.from('time_entries').insert({
      staff_id: staffId,
      task_id: taskId,
      hours: Math.round(h * 100) / 100,
      entry_date: entryDate || today,
      note: note.trim() || null,
      source: 'manual',
    })
    setBusy(false)
    if (error) {
      toast({ title: 'Could not log time', description: error.message, variant: 'destructive' })
      return
    }
    setHours('')
    setNote('')
    setEntryDate(today)
    toast({ title: 'Time logged' })
    await load()
    onChanged?.()
  }

  async function startTimer() {
    if (running) return
    setBusy(true)
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('time_entries').insert({
      staff_id: staffId,
      task_id: taskId,
      hours: null,
      entry_date: nowIso.slice(0, 10),
      source: 'timer',
      started_at: nowIso,
    })
    setBusy(false)
    if (error) {
      // The partial unique index surfaces here if a timer is already running
      // (possibly on another task, in another tab).
      toast({
        title: 'Could not start timer',
        description: /uniq_running_timer/.test(error.message)
          ? 'You already have a timer running. Stop it first.'
          : error.message,
        variant: 'destructive',
      })
      await load()
      return
    }
    await load()
    onChanged?.()
  }

  async function stopTimer() {
    if (!running || !running.started_at) return
    setBusy(true)
    const endIso = new Date().toISOString()
    const computed = hoursBetween(running.started_at, endIso)
    const { error } = await supabase
      .from('time_entries')
      .update({ ended_at: endIso, hours: computed })
      .eq('id', running.id)
    setBusy(false)
    if (error) {
      toast({ title: 'Could not stop timer', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: `Timer stopped — ${formatHours(computed)} logged` })
    await load()
    onChanged?.()
  }

  async function remove(entry: TimeEntryRow) {
    setBusy(true)
    const { error } = await supabase.from('time_entries').delete().eq('id', entry.id)
    setBusy(false)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    await load()
    onChanged?.()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-[family-name:var(--font-heading)] text-sm font-semibold text-text">
          <Clock size={15} className="text-gold" /> Time
        </h3>
        <span className="text-xs text-text-muted">
          Total logged: <span className="font-medium text-text">{formatHours(total)}</span>
        </span>
      </div>

      {/* Timer */}
      <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3">
        {running ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <span className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text tabular-nums">
                {running.started_at ? elapsedClock(running.started_at, nowMs) : '00:00:00'}
              </span>
            </div>
            <Button variant="secondary" size="sm" icon={<Square size={14} />} loading={busy} onClick={stopTimer}>
              Stop &amp; save
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-muted">Start a timer and it saves as an entry when you stop.</span>
            <Button variant="secondary" size="sm" icon={<Play size={14} />} loading={busy} onClick={startTimer}>
              Start timer
            </Button>
          </div>
        )}
      </div>

      {/* Manual entry */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Hours"
          type="number"
          min="0"
          step="0.25"
          inputMode="decimal"
          placeholder="e.g. 2.5"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
        <DateField label="Date" value={entryDate} onChange={setEntryDate} />
      </div>
      <Textarea
        label="Note (optional)"
        placeholder="What did you work on?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
      <div className="flex justify-end">
        <Button size="sm" loading={busy} onClick={addManual}>
          Log hours
        </Button>
      </div>

      {/* Entries */}
      <div className="pt-1">
        {loading ? (
          <div className="flex items-center gap-2 text-text-muted text-sm py-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading time…
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-text-dim py-2">No time logged on this task yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-text">
                    <span className="font-medium">
                      {isRunningTimer(e) ? 'Running…' : formatHours(e.hours)}
                    </span>
                    <span className="text-text-dim"> · {formatDate(e.entry_date)}</span>
                    <span
                      className={cn(
                        'ml-2 text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full',
                        e.source === 'timer'
                          ? 'bg-gold-muted text-gold-dark'
                          : 'bg-surface-2 text-text-muted',
                      )}
                    >
                      {e.source}
                    </span>
                  </p>
                  {e.note && <p className="text-xs text-text-muted truncate">{e.note}</p>}
                </div>
                {!isRunningTimer(e) && (
                  <button
                    onClick={() => remove(e)}
                    disabled={busy}
                    aria-label="Delete entry"
                    className="text-text-dim hover:text-accent-warm transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
