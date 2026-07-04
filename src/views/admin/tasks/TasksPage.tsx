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
import { toast } from '@/lib/hooks/use-toast'
import { formatDate, formatDateTime, cn } from '@/lib/utils'
import { Loader2, Plus, Trash2, ListTodo, MessageSquare } from 'lucide-react'
import type { Database } from '@/types/database'

type TaskRow = Database['public']['Tables']['tasks']['Row']
type CommentRow = Database['public']['Tables']['task_comments']['Row']

interface AdminProfile {
  id: string
  first_name: string | null
  last_name: string | null
}

const STATUS_META: Record<
  string,
  { label: string; variant: 'active' | 'upcoming' | 'draft' | 'urgent' | 'info' }
> = {
  todo: { label: 'To do', variant: 'draft' },
  in_progress: { label: 'In progress', variant: 'info' },
  blocked: { label: 'Blocked', variant: 'urgent' },
  done: { label: 'Done', variant: 'active' },
}

const PRIORITY_META: Record<
  string,
  { label: string; variant: 'active' | 'upcoming' | 'draft' | 'urgent' | 'info' }
> = {
  low: { label: 'Low', variant: 'draft' },
  medium: { label: 'Medium', variant: 'upcoming' },
  high: { label: 'High', variant: 'urgent' },
}

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]
const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'sales', label: 'Sales' },
  { value: 'events', label: 'Events' },
  { value: 'admin', label: 'Admin' },
]

function personName(p: AdminProfile | undefined): string {
  if (!p) return 'Unassigned'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed'
}

function isOverdue(t: TaskRow): boolean {
  if (!t.due_date || t.status === 'done') return false
  return t.due_date < new Date().toISOString().slice(0, 10)
}

const emptyForm = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  category: 'general',
  assigned_to: '',
  due_date: '',
}

export function TasksPage() {
  const confirm = useConfirm()
  const { profile } = useAuth()
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [admins, setAdmins] = useState<AdminProfile[]>([])
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [query, setQuery] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  const [comments, setComments] = useState<CommentRow[]>([])
  const [newComment, setNewComment] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [tasksRes, adminsRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, first_name, last_name').eq('role', 'admin'),
    ])
    if (tasksRes.data) setTasks(tasksRes.data)
    if (adminsRes.data) setAdmins(adminsRes.data as AdminProfile[])
    setLoading(false)
  }

  const adminById = useMemo(() => {
    const map: Record<string, AdminProfile> = {}
    for (const a of admins) map[a.id] = a
    return map
  }, [admins])

  const counts = useMemo(() => {
    let open = 0
    let inProgress = 0
    let overdue = 0
    let done = 0
    for (const t of tasks) {
      if (t.status === 'done') done++
      else open++
      if (t.status === 'in_progress') inProgress++
      if (isOverdue(t)) overdue++
    }
    return { open, inProgress, overdue, done }
  }, [tasks])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((t) => {
      if (statusFilter === 'open' && t.status === 'done') return false
      if (statusFilter !== 'open' && statusFilter !== 'all' && t.status !== statusFilter) return false
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
      if (q && !`${t.title} ${t.description ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, statusFilter, categoryFilter, query])

  function openNew() {
    setEditingId(null)
    setForm({ ...emptyForm })
    setComments([])
    setNewComment('')
    setModalOpen(true)
  }

  async function openEdit(task: TaskRow) {
    setEditingId(task.id)
    setForm({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      category: task.category,
      assigned_to: task.assigned_to ?? '',
      due_date: task.due_date ?? '',
    })
    setComments([])
    setNewComment('')
    setModalOpen(true)
    const { data } = await supabase
      .from('task_comments')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true })
    if (data) setComments(data)
  }

  async function saveTask() {
    const title = form.title.trim()
    if (!title) {
      toast({ title: 'Title required', variant: 'destructive' })
      return
    }
    setSaving(true)
    const payload = {
      title,
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      category: form.category,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || null,
      completed_at: form.status === 'done' ? new Date().toISOString() : null,
    }

    if (editingId) {
      const { error } = await supabase.from('tasks').update(payload).eq('id', editingId)
      setSaving(false)
      if (error) {
        toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Task updated' })
    } else {
      const { error } = await supabase
        .from('tasks')
        .insert({ ...payload, created_by: profile?.id ?? null })
      setSaving(false)
      if (error) {
        toast({ title: 'Could not create', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Task created' })
    }
    setModalOpen(false)
    load()
  }

  async function quickStatus(task: TaskRow, status: string) {
    const completed_at = status === 'done' ? new Date().toISOString() : null
    // optimistic
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status, completed_at } : t)),
    )
    const { error } = await supabase
      .from('tasks')
      .update({ status, completed_at })
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
      description: 'The task and all its comments are permanently removed. This cannot be undone.',
      confirmLabel: 'Delete task',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('tasks').delete().eq('id', editingId)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    setModalOpen(false)
    toast({ title: 'Task deleted' })
    load()
  }

  async function addComment() {
    const body = newComment.trim()
    if (!body || !editingId) return
    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id: editingId, body, author_id: profile?.id ?? null })
      .select('*')
      .single()
    if (error) {
      toast({ title: 'Could not add comment', description: error.message, variant: 'destructive' })
      return
    }
    if (data) setComments((c) => [...c, data])
    setNewComment('')
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading tasks…
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Tasks"
        description="Sales, events and admin tasks — with an owner, a deadline and a clear status. If it isn’t in the system, it doesn’t exist."
        actions={
          <Button icon={<Plus size={15} />} onClick={openNew}>
            New task
          </Button>
        }
      />

      {/* Stat tiles */}
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="sm:w-44">
          <SelectMenu
            ariaLabel="Filter by status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={[
              { value: 'open', label: 'Open (not done)' },
              { value: 'all', label: 'All statuses' },
              ...STATUS_OPTIONS,
            ]}
          />
        </div>
        <div className="sm:w-44">
          <SelectMenu
            ariaLabel="Filter by category"
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            options={[{ value: 'all', label: 'All categories' }, ...CATEGORY_OPTIONS]}
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
                icon={ListTodo}
                title="No tasks here"
                description="Create a task to start tracking work — every commitment with an owner and a deadline."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Task</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((task) => (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer"
                    onClick={() => openEdit(task)}
                  >
                    <TableCell className="max-w-[320px]">
                      <p className="font-medium text-text truncate">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-text-dim truncate">{task.description}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-text-muted capitalize">{task.category}</TableCell>
                    <TableCell className="text-text-muted">
                      {task.assigned_to ? personName(adminById[task.assigned_to]) : '—'}
                    </TableCell>
                    <TableCell>
                      {task.due_date ? (
                        <span className={cn(isOverdue(task) && 'text-accent-warm font-medium')}>
                          {formatDate(task.due_date)}
                        </span>
                      ) : (
                        <span className="text-text-dim">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_META[task.priority]?.variant ?? 'draft'}>
                        {PRIORITY_META[task.priority]?.label ?? task.priority}
                      </Badge>
                    </TableCell>
                    {/* Quick status change — stop row click from also opening the modal */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <SelectMenu
                        size="sm"
                        ariaLabel="Change status"
                        value={task.status}
                        onValueChange={(v) => quickStatus(task, v)}
                        options={STATUS_OPTIONS}
                        className="w-36"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit task' : 'New task'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g. Follow up with Soho Farmhouse on Q3 dates"
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
              value={form.assigned_to || 'none'}
              onValueChange={(v) => setForm({ ...form, assigned_to: v === 'none' ? '' : v })}
              options={[
                { value: 'none', label: 'Unassigned' },
                ...admins.map((a) => ({ value: a.id, label: personName(a) })),
              ]}
            />
            <DateField
              label="Due date"
              value={form.due_date}
              onChange={(v) => setForm({ ...form, due_date: v })}
            />
            <SelectMenu
              label="Category"
              value={form.category}
              onValueChange={(v) => setForm({ ...form, category: v })}
              options={CATEGORY_OPTIONS}
            />
            <SelectMenu
              label="Priority"
              value={form.priority}
              onValueChange={(v) => setForm({ ...form, priority: v })}
              options={PRIORITY_OPTIONS}
            />
            <SelectMenu
              label="Status"
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v })}
              options={STATUS_OPTIONS}
            />
          </div>

          {/* Comments — only for existing tasks */}
          {editingId && (
            <div className="pt-2 border-t border-border">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-text-dim mb-3">
                <MessageSquare size={13} /> Comments
              </p>
              <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="text-sm text-text-dim italic">No comments yet.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2">
                      <p className="text-sm text-text whitespace-pre-wrap">{c.body}</p>
                      <p className="text-[11px] text-text-dim mt-1">
                        {c.author_id ? personName(adminById[c.author_id]) : 'Someone'} ·{' '}
                        {formatDateTime(c.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a comment…"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addComment()}
                />
                <Button variant="secondary" onClick={addComment} disabled={!newComment.trim()}>
                  Post
                </Button>
              </div>
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
                {editingId ? 'Save changes' : 'Create task'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
