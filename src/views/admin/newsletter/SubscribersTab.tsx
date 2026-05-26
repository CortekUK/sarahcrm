'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate, cn } from '@/lib/utils'
import { Users, Search, Plus, UserX, RotateCcw, Trash2, Download } from 'lucide-react'
import type { Database } from '@/types/database'

type Subscriber = Database['public']['Tables']['mailing_list']['Row']

type Filter = 'active' | 'unsubscribed' | 'all'

export function SubscribersTab() {
  const confirm = useConfirm()
  const [rows, setRows] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    fetchSubs()
  }, [])

  async function fetchSubs() {
    setLoading(true)
    const { data, error } = await supabase
      .from('mailing_list')
      .select('*')
      .order('subscribed_at', { ascending: false })
    if (error) {
      toast({ title: 'Failed to load subscribers', description: error.message, variant: 'destructive' })
    } else {
      setRows((data ?? []) as Subscriber[])
    }
    setLoading(false)
  }

  const counts = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((r) => !r.unsubscribed_at).length,
      unsubscribed: rows.filter((r) => !!r.unsubscribed_at).length,
    }),
    [rows],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === 'active' && r.unsubscribed_at) return false
      if (filter === 'unsubscribed' && !r.unsubscribed_at) return false
      if (!term) return true
      return (
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term)
      )
    })
  }, [rows, search, filter])

  async function unsubscribe(id: string) {
    const { error } = await supabase
      .from('mailing_list')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' })
      return
    }
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, unsubscribed_at: new Date().toISOString() } : r)),
    )
    toast({ title: 'Marked as unsubscribed' })
  }

  async function resubscribe(id: string) {
    const { error } = await supabase
      .from('mailing_list')
      .update({ unsubscribed_at: null })
      .eq('id', id)
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' })
      return
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, unsubscribed_at: null } : r)))
    toast({ title: 'Re-subscribed' })
  }

  async function remove(row: Subscriber) {
    const ok = await confirm({
      title: `Delete ${row.email}?`,
      description:
        'This permanently removes the subscriber. To keep them on the list but stop sending, use Unsubscribe instead.',
      tone: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    const { error } = await supabase.from('mailing_list').delete().eq('id', row.id)
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' })
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    toast({ title: 'Deleted' })
  }

  function exportCsv() {
    const cols = ['first_name', 'last_name', 'email', 'subscribed_at', 'unsubscribed_at', 'source']
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [cols.join(',')]
    for (const r of filtered) {
      lines.push(cols.map((c) => escape((r as Record<string, unknown>)[c])).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatTile label="Total" value={counts.total} />
        <StatTile label="Active" value={counts.active} tone="success" />
        <StatTile label="Unsubscribed" value={counts.unsubscribed} tone="dim" />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="relative md:max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['active', 'unsubscribed', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md border transition-colors capitalize',
                filter === f
                  ? 'bg-gold-muted text-gold border-gold/40'
                  : 'border-border text-text-muted hover:text-text hover:bg-surface-2',
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="md:ml-auto flex gap-2">
          <Button variant="secondary" onClick={exportCsv}>
            <Download size={14} />
            Export CSV
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={14} />
            Add subscriber
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-text-dim">Loading…</div>
          ) : filtered.length === 0 ? (
            <AdminEmptyState
              icon={Users}
              title={filter === 'active' ? 'No active subscribers yet' : 'No subscribers match'}
              description={
                filter === 'active'
                  ? 'When someone signs up through the footer/homepage form they will appear here.'
                  : 'Try a different filter or clear your search.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const unsubbed = !!r.unsubscribed_at
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-text">
                        {r.first_name} {r.last_name}
                      </TableCell>
                      <TableCell className="text-text-muted">{r.email}</TableCell>
                      <TableCell className="text-text-dim text-xs capitalize">{r.source}</TableCell>
                      <TableCell className="text-text-muted text-xs">
                        {formatDate(r.subscribed_at)}
                      </TableCell>
                      <TableCell>
                        {unsubbed ? (
                          <Badge variant="draft" dot>
                            unsubscribed
                          </Badge>
                        ) : (
                          <Badge variant="active" dot>
                            active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {unsubbed ? (
                            <button
                              type="button"
                              onClick={() => resubscribe(r.id)}
                              className="p-1.5 rounded text-text-dim hover:text-accent hover:bg-surface-2"
                              title="Re-subscribe"
                            >
                              <RotateCcw size={14} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => unsubscribe(r.id)}
                              className="p-1.5 rounded text-text-dim hover:text-accent-warm hover:bg-surface-2"
                              title="Unsubscribe"
                            >
                              <UserX size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => remove(r)}
                            className="p-1.5 rounded text-text-dim hover:text-accent-warm hover:bg-surface-2"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <AddSubscriberModal
          onClose={() => setAddOpen(false)}
          onSaved={(row) => {
            setRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)])
            setAddOpen(false)
          }}
        />
      )}
    </>
  )
}

// ─── Add subscriber modal ────────────────────────────────────────────

function AddSubscriberModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (row: Subscriber) => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setErr('All three fields are required.')
      return
    }
    setSaving(true)
    const { data, error } = await supabase
      .from('mailing_list')
      .upsert(
        {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
          source: 'admin',
          unsubscribed_at: null,
        },
        { onConflict: 'email' },
      )
      .select()
      .single()
    setSaving(false)
    if (error || !data) {
      setErr(error?.message ?? 'Could not save')
      return
    }
    onSaved(data as Subscriber)
    toast({ title: 'Subscriber added' })
  }

  return (
    <Modal open onClose={onClose} title="Add subscriber" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted">First name</label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-text-muted">Last name</label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs text-text-muted">Email</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {err && <p className="text-xs text-accent-warm">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Add
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── StatTile (compact variant for inside tabs) ──────────────────────

function StatTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  tone?: 'neutral' | 'success' | 'dim'
}) {
  const toneClass = {
    neutral: 'text-text',
    success: 'text-accent',
    dim: 'text-text-muted',
  }[tone]
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
          {label}
        </p>
        <p className={cn('font-[family-name:var(--font-heading)] text-2xl font-semibold mt-1', toneClass)}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
