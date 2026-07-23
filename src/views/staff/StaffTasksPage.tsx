'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { TaskCollab } from '@/components/accountability/TaskCollab'
import { TaskTimeLog } from '@/components/accountability/TaskTimeLog'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate, cn } from '@/lib/utils'
import { Loader2, ShieldCheck, CalendarClock } from 'lucide-react'
import {
  type AccTaskRow,
  type AccAttachmentRow,
  type PersonLite,
  ACC_STATUS_META,
  ACC_STATUS_OPTIONS,
  isAccOverdue,
} from '@/lib/accountability'

// Staff self-service — a signed-in team member sees ONLY their own tasks
// (enforced by RLS: owner_id = auth.uid()). They can change status, add
// comments, upload attachments and record an outcome.
export function StaffTasksPage() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState<AccTaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')

  const [openTask, setOpenTask] = useState<AccTaskRow | null>(null)
  const [outcomeDraft, setOutcomeDraft] = useState('')
  const [savingOutcome, setSavingOutcome] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    // RLS restricts this to the signed-in owner's tasks; no client-side
    // owner filter needed (and none would be trusted anyway).
    const { data } = await supabase
      .from('accountability_tasks')
      .select('*')
      .order('deadline', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (data) setTasks(data)
    setLoading(false)
  }

  // The signed-in user is the only relevant person for names shown here.
  const peopleById = useMemo<Record<string, PersonLite>>(() => {
    if (!profile) return {}
    return {
      [profile.id]: {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
      },
    }
  }, [profile])

  const counts = useMemo(() => {
    let open = 0
    let overdue = 0
    let done = 0
    for (const t of tasks) {
      if (t.status === 'done') done++
      else open++
      if (isAccOverdue(t)) overdue++
    }
    return { open, overdue, done }
  }, [tasks])

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter === 'open' && t.status === 'done') return false
      if (statusFilter !== 'open' && statusFilter !== 'all' && t.status !== statusFilter)
        return false
      return true
    })
  }, [tasks, statusFilter])

  function open(task: AccTaskRow) {
    setOpenTask(task)
    setOutcomeDraft(task.outcome ?? '')
  }

  async function changeStatus(status: string) {
    if (!openTask) return
    const { data, error } = await supabase
      .from('accountability_tasks')
      .update({ status })
      .eq('id', openTask.id)
      .select('*')
      .single()
    if (error) {
      toast({ title: 'Could not update status', description: error.message, variant: 'destructive' })
      return
    }
    if (data) {
      setOpenTask(data)
      setTasks((prev) => prev.map((t) => (t.id === data.id ? data : t)))
    }
  }

  async function saveOutcome() {
    if (!openTask) return
    setSavingOutcome(true)
    const { data, error } = await supabase
      .from('accountability_tasks')
      .update({ outcome: outcomeDraft.trim() || null })
      .eq('id', openTask.id)
      .select('*')
      .single()
    setSavingOutcome(false)
    if (error) {
      toast({ title: 'Could not save outcome', description: error.message, variant: 'destructive' })
      return
    }
    if (data) {
      setOpenTask(data)
      setTasks((prev) => prev.map((t) => (t.id === data.id ? data : t)))
      toast({ title: 'Outcome saved' })
    }
  }

  const canDeleteAttachment = (att: AccAttachmentRow) => att.uploaded_by === profile?.id

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-text-muted py-10">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your tasks…
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
          My tasks
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Everything assigned to you — with a deadline, a status and a place to record the outcome.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">Open</p>
          <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text mt-1">
            {counts.open}
          </p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">Overdue</p>
          <p
            className={cn(
              'font-[family-name:var(--font-heading)] text-2xl font-semibold mt-1',
              counts.overdue > 0 ? 'text-accent-warm' : 'text-text',
            )}
          >
            {counts.overdue}
          </p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">Done</p>
          <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text mt-1">
            {counts.done}
          </p>
        </div>
      </div>

      <div className="mb-4 sm:w-56">
        <SelectMenu
          ariaLabel="Filter by status"
          value={statusFilter}
          onValueChange={setStatusFilter}
          options={[
            { value: 'open', label: 'Open (not done)' },
            { value: 'all', label: 'All statuses' },
            ...ACC_STATUS_OPTIONS,
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldCheck className="mx-auto mb-3 text-text-dim" size={28} />
            <p className="text-text font-medium">Nothing to do here</p>
            <p className="text-sm text-text-muted mt-1">You have no tasks in this view.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((task) => {
            const meta = ACC_STATUS_META[task.status]
            return (
              <button
                key={task.id}
                onClick={() => open(task)}
                className="w-full text-left rounded-[var(--radius-lg)] border border-border bg-surface hover:border-border-hover transition-colors px-5 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-text truncate">{task.title}</p>
                    {task.description && (
                      <p className="text-sm text-text-muted mt-0.5 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    {task.deadline && (
                      <p
                        className={cn(
                          'flex items-center gap-1.5 text-xs mt-2',
                          isAccOverdue(task) ? 'text-accent-warm font-medium' : 'text-text-dim',
                        )}
                      >
                        <CalendarClock size={13} /> Due {formatDate(task.deadline)}
                      </p>
                    )}
                  </div>
                  <Badge variant={meta?.variant ?? 'draft'}>{meta?.label ?? task.status}</Badge>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Modal
        open={!!openTask}
        onClose={() => setOpenTask(null)}
        title={openTask?.title}
        size="lg"
      >
        {openTask && (
          <div className="space-y-5">
            {openTask.description && (
              <p className="text-sm text-text-muted whitespace-pre-wrap">{openTask.description}</p>
            )}
            {openTask.deadline && (
              <p
                className={cn(
                  'flex items-center gap-1.5 text-sm',
                  isAccOverdue(openTask) ? 'text-accent-warm font-medium' : 'text-text-dim',
                )}
              >
                <CalendarClock size={14} /> Due {formatDate(openTask.deadline)}
              </p>
            )}

            <div className="sm:w-56">
              <SelectMenu
                label="Status"
                value={openTask.status}
                onValueChange={changeStatus}
                options={ACC_STATUS_OPTIONS}
              />
            </div>

            <div>
              <Textarea
                label="Outcome"
                placeholder="Record what happened / what was delivered when this task is done…"
                value={outcomeDraft}
                onChange={(e) => setOutcomeDraft(e.target.value)}
                rows={3}
              />
              <div className="flex justify-end mt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={savingOutcome}
                  onClick={saveOutcome}
                  disabled={outcomeDraft.trim() === (openTask.outcome ?? '')}
                >
                  Save outcome
                </Button>
              </div>
            </div>

            {profile?.id && (
              <div className="pt-2 border-t border-border">
                <TaskTimeLog taskId={openTask.id} staffId={profile.id} />
              </div>
            )}

            <div className="pt-2 border-t border-border">
              <TaskCollab
                taskId={openTask.id}
                currentUserId={profile?.id ?? null}
                peopleById={peopleById}
                canDeleteAttachment={canDeleteAttachment}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
