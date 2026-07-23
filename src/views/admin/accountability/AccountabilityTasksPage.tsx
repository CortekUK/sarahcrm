'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { DateField } from '@/components/ui/DateField'
import { Textarea } from '@/components/ui/Textarea'
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
import { TaskCollab } from '@/components/accountability/TaskCollab'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate, cn } from '@/lib/utils'
import { Loader2, Plus, Trash2, ShieldCheck } from 'lucide-react'
import {
  type AccTaskRow,
  type PersonLite,
  ACC_STATUS_META,
  ACC_STATUS_OPTIONS,
  personName,
  isAccOverdue,
} from '@/lib/accountability'

const emptyForm = {
  title: '',
  description: '',
  owner_id: '',
  deadline: '',
  status: 'not_started',
  outcome: '',
  event_id: '',
}

interface EventLite {
  id: string
  title: string
  start_date: string
}

export function AccountabilityTasksPage() {
  const confirm = useConfirm()
  const { profile } = useAuth()
  const [tasks, setTasks] = useState<AccTaskRow[]>([])
  const [staff, setStaff] = useState<PersonLite[]>([])
  const [people, setPeople] = useState<PersonLite[]>([])
  const [events, setEvents] = useState<EventLite[]>([])
  const [loading, setLoading] = useState(true)

  const [ownerFilter, setOwnerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('open')
  const [query, setQuery] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [tasksRes, staffRes, peopleRes, eventsRes] = await Promise.all([
      supabase
        .from('accountability_tasks')
        .select('*')
        .order('deadline', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('role', ['team_member', 'freelancer'])
        .eq('staff_status', 'active'),
      supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('role', ['admin', 'team_member', 'freelancer']),
      supabase
        .from('events')
        .select('id, title, start_date')
        .order('start_date', { ascending: false }),
    ])
    if (tasksRes.data) setTasks(tasksRes.data)
    if (staffRes.data) setStaff(staffRes.data as PersonLite[])
    if (peopleRes.data) setPeople(peopleRes.data as PersonLite[])
    if (eventsRes.data) setEvents(eventsRes.data as EventLite[])
    setLoading(false)
  }

  const peopleById = useMemo(() => {
    const map: Record<string, PersonLite> = {}
    for (const p of people) map[p.id] = p
    return map
  }, [people])

  const counts = useMemo(() => {
    let open = 0
    let inProgress = 0
    let overdue = 0
    let done = 0
    for (const t of tasks) {
      if (t.status === 'done') done++
      else open++
      if (t.status === 'in_progress') inProgress++
      if (isAccOverdue(t)) overdue++
    }
    return { open, inProgress, overdue, done }
  }, [tasks])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((t) => {
      if (statusFilter === 'open' && t.status === 'done') return false
      if (statusFilter !== 'open' && statusFilter !== 'all' && t.status !== statusFilter)
        return false
      if (ownerFilter !== 'all' && t.owner_id !== ownerFilter) return false
      if (q && !`${t.title} ${t.description ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, statusFilter, ownerFilter, query])

  function openNew() {
    setEditingId(null)
    setForm({ ...emptyForm, owner_id: staff[0]?.id ?? '' })
    setModalOpen(true)
  }

  function openEdit(task: AccTaskRow) {
    setEditingId(task.id)
    setForm({
      title: task.title,
      description: task.description ?? '',
      owner_id: task.owner_id,
      deadline: task.deadline ? task.deadline.slice(0, 10) : '',
      status: task.status,
      outcome: task.outcome ?? '',
      event_id: task.event_id ?? '',
    })
    setModalOpen(true)
  }

  async function saveTask() {
    const title = form.title.trim()
    if (!title) {
      toast({ title: 'Title required', variant: 'destructive' })
      return
    }
    if (!form.owner_id) {
      toast({ title: 'An owner is required', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = {
      title,
      description: form.description.trim() || null,
      owner_id: form.owner_id,
      deadline: form.deadline || null,
      status: form.status,
      outcome: form.outcome.trim() || null,
      event_id: form.event_id || null,
    }

    if (editingId) {
      const { error } = await supabase
        .from('accountability_tasks')
        .update(payload)
        .eq('id', editingId)
      setSaving(false)
      if (error) {
        toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Task updated' })
    } else {
      const { error } = await supabase
        .from('accountability_tasks')
        .insert({ ...payload, created_by: profile?.id ?? null })
      setSaving(false)
      if (error) {
        toast({ title: 'Could not create', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Task assigned' })
    }
    setModalOpen(false)
    load()
  }

  async function quickStatus(task: AccTaskRow, status: string) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)))
    const { error } = await supabase
      .from('accountability_tasks')
      .update({ status })
      .eq('id', task.id)
    if (error) {
      toast({ title: 'Could not update status', description: error.message, variant: 'destructive' })
      load()
    }
  }

  async function deleteTask() {
    if (!editingId) return
    const ok = await confirm({
      title: 'Delete this task?',
      description:
        'The task and all its comments, attachments and activity history are permanently removed. This cannot be undone.',
      confirmLabel: 'Delete task',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('accountability_tasks').delete().eq('id', editingId)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    setModalOpen(false)
    toast({ title: 'Task deleted' })
    load()
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading accountability tasks…
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Accountability"
        description="Every commitment with a single owner, a deadline and a clear status — plus a full comment thread, attachments and activity history. Total transparency."
        actions={
          <Button
            icon={<Plus size={15} />}
            onClick={openNew}
            disabled={staff.length === 0}
          >
            Assign task
          </Button>
        }
      />

      {staff.length === 0 && (
        <div className="mb-6 px-4 py-3 rounded-[var(--radius-md)] bg-gold-muted border border-border-gold">
          <p className="text-sm text-text">
            Add a team member first (Accountability → Team Members) before assigning tasks.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard label="Open" value={counts.open} changeText="not yet done" changeType="neutral" />
        <StatCard
          label="In progress"
          value={counts.inProgress}
          changeText="being worked on"
          changeType="neutral"
        />
        <StatCard
          label="Overdue"
          value={counts.overdue}
          changeText={counts.overdue > 0 ? 'past deadline' : 'all on time'}
          changeType={counts.overdue > 0 ? 'negative' : 'positive'}
        />
        <StatCard label="Done" value={counts.done} changeText="completed" changeType="positive" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="sm:w-48">
          <SelectMenu
            ariaLabel="Filter by owner"
            value={ownerFilter}
            onValueChange={setOwnerFilter}
            options={[
              { value: 'all', label: 'All owners' },
              ...staff.map((s) => ({ value: s.id, label: personName(s) })),
            ]}
          />
        </div>
        <div className="sm:w-48">
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
        <div className="flex-1">
          <Input
            placeholder="Search tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-16">
              <AdminEmptyState
                icon={ShieldCheck}
                title="No accountability tasks here"
                description="Assign a task to a team member to start tracking it — with an owner, a deadline and full transparency."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Task</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((task) => (
                  <TableRow key={task.id} className="cursor-pointer" onClick={() => openEdit(task)}>
                    <TableCell className="max-w-[360px]">
                      <p className="font-medium text-text truncate">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-text-dim truncate">{task.description}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {personName(peopleById[task.owner_id])}
                    </TableCell>
                    <TableCell>
                      {task.deadline ? (
                        <span className={cn(isAccOverdue(task) && 'text-accent-warm font-medium')}>
                          {formatDate(task.deadline)}
                        </span>
                      ) : (
                        <span className="text-text-dim">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <SelectMenu
                        size="sm"
                        ariaLabel="Change status"
                        value={task.status}
                        onValueChange={(v) => quickStatus(task, v)}
                        options={ACC_STATUS_OPTIONS}
                        className="w-40"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Task' : 'Assign task'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g. Confirm florist for the September dinner"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Textarea
            label="Description"
            placeholder="Context, links, what done looks like…"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectMenu
              label="Owner"
              value={form.owner_id || 'none'}
              onValueChange={(v) => setForm({ ...form, owner_id: v === 'none' ? '' : v })}
              options={[
                { value: 'none', label: 'Select a team member' },
                ...staff.map((s) => ({ value: s.id, label: personName(s) })),
              ]}
            />
            <DateField
              label="Deadline"
              value={form.deadline}
              onChange={(v) => setForm({ ...form, deadline: v })}
            />
            <SelectMenu
              label="Status"
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v })}
              options={ACC_STATUS_OPTIONS}
            />
            <SelectMenu
              label="Event (optional)"
              value={form.event_id || 'none'}
              onValueChange={(v) => setForm({ ...form, event_id: v === 'none' ? '' : v })}
              options={[
                { value: 'none', label: 'No event' },
                ...events.map((ev) => ({
                  value: ev.id,
                  label: `${ev.title} · ${formatDate(ev.start_date)}`,
                })),
              ]}
            />
          </div>
          <Textarea
            label="Outcome"
            placeholder="Record the outcome when this task is closed…"
            value={form.outcome}
            onChange={(e) => setForm({ ...form, outcome: e.target.value })}
            rows={2}
          />

          {editingId && (
            <div className="pt-2 border-t border-border">
              <TaskCollab
                taskId={editingId}
                currentUserId={profile?.id ?? null}
                peopleById={peopleById}
                canDeleteAttachment={() => true}
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {editingId ? (
              <Button
                variant="ghost"
                icon={<Trash2 size={14} />}
                className="text-accent-warm"
                onClick={deleteTask}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button loading={saving} onClick={saveTask}>
                {editingId ? 'Save changes' : 'Assign task'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
