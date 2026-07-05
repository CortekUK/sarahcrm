'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SelectMenu } from '@/components/ui/SelectMenu'
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
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Loader2, Plus, Trash2, BellRing } from 'lucide-react'
import type { Database } from '@/types/database'

type RequestRow = Database['public']['Tables']['concierge_requests']['Row']

interface AdminProfile {
  id: string
  first_name: string | null
  last_name: string | null
}

interface MemberLite {
  id: string
  first_name: string | null
  last_name: string | null
}

type BadgeVariant = 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Enquiry', variant: 'draft' },
  assigned: { label: 'Assigned', variant: 'info' },
  sourcing: { label: 'Sourcing', variant: 'info' },
  quoted: { label: 'Quote sent', variant: 'upcoming' },
  accepted: { label: 'Accepted', variant: 'upcoming' },
  booked: { label: 'Booked', variant: 'active' },
  delivered: { label: 'Delivered', variant: 'active' },
  feedback: { label: 'Feedback', variant: 'active' },
  declined: { label: 'Declined', variant: 'urgent' },
  cancelled: { label: 'Cancelled', variant: 'urgent' },
}

const PRIORITY_META: Record<string, { label: string; variant: BadgeVariant }> = {
  low: { label: 'Low', variant: 'draft' },
  medium: { label: 'Medium', variant: 'upcoming' },
  high: { label: 'High', variant: 'urgent' },
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Enquiry' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'sourcing', label: 'Sourcing' },
  { value: 'quoted', label: 'Quote sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'booked', label: 'Booked' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'declined', label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
]
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]
const REQUEST_TYPE_OPTIONS = [
  'Travel',
  'Holidays',
  'Private Events',
  'Luxury Goods',
  'Fashion',
  'Sports & Events Tickets',
  'Private Aviation',
  'Transfers',
  'Private Lounges',
  'Venue Finding',
  'Other',
].map((t) => ({ value: t, label: t }))

// Closed states — no longer in the active pipeline.
const CLOSED = new Set(['delivered', 'feedback', 'declined', 'cancelled'])

function personName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  if (!p) return '—'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed'
}

// Pounds string → integer pence (null when blank). Kept lenient so the
// staff can paste "1500" or "1,500.50".
function poundsToPence(v: string): number | null {
  const cleaned = v.replace(/[£,\s]/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  if (Number.isNaN(n)) return null
  return Math.round(n * 100)
}
function penceToPounds(pence: number | null): string {
  if (pence == null) return ''
  return (pence / 100).toString()
}

// Read-only field for the "What the member asked for" summary block.
function MemberAsk({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.1em] text-text-dim mb-1">{label}</p>
      <p className={cn('text-sm', highlight ? 'font-medium text-text tabular-nums' : 'text-text-muted')}>
        {value.trim() || '—'}
      </p>
    </div>
  )
}

const emptyForm = {
  member_id: '',
  request_type: 'Travel',
  description: '',
  event_name: '',
  location: '',
  dates: '',
  guests: '',
  budget: '',
  status: 'pending',
  priority: 'medium',
  assigned_to: '',
  supplier_name: '',
  supplier_cost: '',
  sale_price: '',
  commission: '',
  quoted_amount: '',
  notes: '',
}

export function ConciergePage() {
  const confirm = useConfirm()
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [admins, setAdmins] = useState<AdminProfile[]>([])
  const [members, setMembers] = useState<MemberLite[]>([])
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [typeFilter, setTypeFilter] = useState<string>('all')
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
    const [reqRes, adminsRes, membersRes] = await Promise.all([
      supabase
        .from('concierge_requests')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, first_name, last_name').eq('role', 'admin'),
      supabase.from('members').select('id, profiles(first_name, last_name)').is('deleted_at', null),
    ])
    if (reqRes.data) setRequests(reqRes.data)
    if (adminsRes.data) setAdmins(adminsRes.data as AdminProfile[])
    if (membersRes.data) {
      setMembers(
        membersRes.data.map((m) => {
          const p = (m as { profiles: { first_name: string | null; last_name: string | null } | null })
            .profiles
          return { id: m.id, first_name: p?.first_name ?? null, last_name: p?.last_name ?? null }
        }),
      )
    }
    setLoading(false)
  }

  const adminById = useMemo(() => {
    const map: Record<string, AdminProfile> = {}
    for (const a of admins) map[a.id] = a
    return map
  }, [admins])

  const memberById = useMemo(() => {
    const map: Record<string, MemberLite> = {}
    for (const m of members) map[m.id] = m
    return map
  }, [members])

  const counts = useMemo(() => {
    let open = 0
    let quoting = 0
    let delivered = 0
    let commission = 0
    for (const r of requests) {
      if (!CLOSED.has(r.status)) open++
      if (r.status === 'quoted' || r.status === 'accepted' || r.status === 'booked') quoting++
      if (r.status === 'delivered' || r.status === 'feedback') delivered++
      if (r.commission_pence) commission += r.commission_pence
    }
    return { open, quoting, delivered, commission }
  }, [requests])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return requests.filter((r) => {
      if (statusFilter === 'open' && CLOSED.has(r.status)) return false
      if (statusFilter !== 'open' && statusFilter !== 'all' && r.status !== statusFilter) return false
      if (typeFilter !== 'all' && r.request_type !== typeFilter) return false
      if (q) {
        const member = memberById[r.member_id]
        const hay = `${r.request_type} ${r.description ?? ''} ${r.event_name ?? ''} ${r.location ?? ''} ${personName(member)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [requests, statusFilter, typeFilter, query, memberById])

  function openNew() {
    setEditingId(null)
    setForm({ ...emptyForm, member_id: members[0]?.id ?? '' })
    setModalOpen(true)
  }

  function openEdit(r: RequestRow) {
    setEditingId(r.id)
    setForm({
      member_id: r.member_id,
      request_type: r.request_type,
      description: r.description ?? '',
      event_name: r.event_name ?? '',
      location: r.location ?? '',
      dates: r.dates ?? '',
      guests: r.guests != null ? String(r.guests) : '',
      budget: penceToPounds(r.budget_pence),
      status: r.status,
      priority: r.priority ?? 'medium',
      assigned_to: r.assigned_to ?? '',
      supplier_name: r.supplier_name ?? '',
      supplier_cost: penceToPounds(r.supplier_cost_pence),
      sale_price: penceToPounds(r.sale_price_pence),
      commission: penceToPounds(r.commission_pence),
      quoted_amount: penceToPounds(r.quoted_amount_pence),
      notes: r.notes ?? '',
    })
    setModalOpen(true)
  }

  const formMargin = useMemo(() => {
    const sale = poundsToPence(form.sale_price)
    const cost = poundsToPence(form.supplier_cost)
    if (sale == null || cost == null) return null
    return sale - cost
  }, [form.sale_price, form.supplier_cost])

  async function save() {
    if (!form.member_id) {
      toast({ title: 'Member required', variant: 'destructive' })
      return
    }
    setSaving(true)
    const guests = form.guests.trim() ? parseInt(form.guests, 10) : null
    const payload = {
      member_id: form.member_id,
      request_type: form.request_type,
      description: form.description.trim() || null,
      event_name: form.event_name.trim() || null,
      location: form.location.trim() || null,
      dates: form.dates.trim() || null,
      guests: guests != null && !Number.isNaN(guests) ? guests : null,
      budget_pence: poundsToPence(form.budget),
      status: form.status,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      supplier_name: form.supplier_name.trim() || null,
      supplier_cost_pence: poundsToPence(form.supplier_cost),
      sale_price_pence: poundsToPence(form.sale_price),
      commission_pence: poundsToPence(form.commission),
      quoted_amount_pence: poundsToPence(form.quoted_amount),
      notes: form.notes.trim() || null,
      delivered_at:
        form.status === 'delivered' || form.status === 'feedback'
          ? new Date().toISOString()
          : null,
    }

    if (editingId) {
      const { error } = await supabase
        .from('concierge_requests')
        .update(payload)
        .eq('id', editingId)
      setSaving(false)
      if (error) {
        toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Request updated' })
    } else {
      const { error } = await supabase.from('concierge_requests').insert(payload)
      setSaving(false)
      if (error) {
        toast({ title: 'Could not create', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Request created' })
    }
    setModalOpen(false)
    load()
  }

  async function quickStatus(r: RequestRow, status: string) {
    const delivered_at =
      status === 'delivered' || status === 'feedback'
        ? r.delivered_at ?? new Date().toISOString()
        : r.delivered_at
    setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, status, delivered_at } : x)))
    const { error } = await supabase
      .from('concierge_requests')
      .update({ status, delivered_at })
      .eq('id', r.id)
    if (error) {
      toast({ title: 'Could not update status', description: error.message, variant: 'destructive' })
      load()
    }
  }

  async function remove() {
    if (!editingId) return
    const ok = await confirm({
      title: 'Delete this request?',
      description: 'The concierge request is permanently removed. This cannot be undone.',
      confirmLabel: 'Delete request',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('concierge_requests').delete().eq('id', editingId)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    setModalOpen(false)
    toast({ title: 'Request deleted' })
    load()
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading concierge requests…
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Concierge"
        description="Lifestyle requests worked through the pipeline — sourcing, quoting, margin and commission, from enquiry to feedback."
        actions={
          <Button icon={<Plus size={15} />} onClick={openNew}>
            New request
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard label="Open" value={counts.open} changeText="in the pipeline" changeType="neutral" />
        <StatCard
          label="Quoting / booking"
          value={counts.quoting}
          changeText="awaiting or in delivery"
          changeType="neutral"
        />
        <StatCard label="Delivered" value={counts.delivered} changeText="fulfilled" changeType="positive" />
        <StatCard
          label="Commission"
          value={formatCurrency(counts.commission)}
          changeText="tracked to date"
          changeType="positive"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="sm:w-48">
          <SelectMenu
            ariaLabel="Filter by status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={[
              { value: 'open', label: 'Open (in pipeline)' },
              { value: 'all', label: 'All statuses' },
              ...STATUS_OPTIONS,
            ]}
          />
        </div>
        <div className="sm:w-48">
          <SelectMenu
            ariaLabel="Filter by type"
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={[{ value: 'all', label: 'All types' }, ...REQUEST_TYPE_OPTIONS]}
          />
        </div>
        <div className="flex-1">
          <Input
            placeholder="Search requests…"
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
                icon={BellRing}
                title="No concierge requests here"
                description="Log a member's lifestyle request to start working it through the pipeline — sourcing, quote, booking and delivery."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Request</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const margin =
                    r.sale_price_pence != null && r.supplier_cost_pence != null
                      ? r.sale_price_pence - r.supplier_cost_pence
                      : null
                  return (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => openEdit(r)}>
                      <TableCell className="max-w-[320px]">
                        <p className="font-medium text-text truncate">{r.request_type}</p>
                        <p className="text-xs text-text-dim truncate">
                          {r.event_name || r.description || r.location || '—'}
                        </p>
                      </TableCell>
                      <TableCell className="text-text-muted">
                        {personName(memberById[r.member_id])}
                      </TableCell>
                      <TableCell className="text-text-muted">
                        {r.assigned_to ? personName(adminById[r.assigned_to]) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={PRIORITY_META[r.priority ?? 'medium']?.variant ?? 'draft'}>
                          {PRIORITY_META[r.priority ?? 'medium']?.label ?? r.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {margin != null ? (
                          <span
                            className={cn(
                              'tabular-nums',
                              margin < 0 ? 'text-accent-warm' : 'text-text',
                            )}
                          >
                            {formatCurrency(margin)}
                          </span>
                        ) : (
                          <span className="text-text-dim">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <SelectMenu
                          size="sm"
                          ariaLabel="Change status"
                          value={r.status}
                          onValueChange={(v) => quickStatus(r, v)}
                          options={STATUS_OPTIONS}
                          className="w-40"
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit request' : 'New concierge request'}
        size="lg"
      >
        <div className="space-y-4">
          {editingId && (
            <div className="rounded-lg border border-border bg-surface-2 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-dim mb-3">
                What the member asked for
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                <MemberAsk label="Request type" value={form.request_type} />
                <MemberAsk label="Event / occasion" value={form.event_name} />
                <MemberAsk label="Location" value={form.location} />
                <MemberAsk label="Dates" value={form.dates} />
                <MemberAsk label="Guests" value={form.guests} />
                <MemberAsk
                  label="Budget"
                  value={
                    poundsToPence(form.budget) != null
                      ? formatCurrency(poundsToPence(form.budget) as number)
                      : ''
                  }
                  highlight
                />
              </div>
              {form.description.trim() && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-text-dim mb-1">Brief</p>
                  <p className="text-sm text-text-muted whitespace-pre-wrap">{form.description}</p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectMenu
              label="Member"
              value={form.member_id || 'none'}
              onValueChange={(v) => setForm({ ...form, member_id: v === 'none' ? '' : v })}
              options={[
                { value: 'none', label: 'Select a member…' },
                ...members.map((m) => ({ value: m.id, label: personName(m) })),
              ]}
            />
            <SelectMenu
              label="Request type"
              value={form.request_type}
              onValueChange={(v) => setForm({ ...form, request_type: v })}
              options={REQUEST_TYPE_OPTIONS}
            />
          </div>

          <Textarea
            label="Description"
            placeholder="What the member is asking for — the brief in their words."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Event / occasion"
              placeholder="e.g. Wimbledon final"
              value={form.event_name}
              onChange={(e) => setForm({ ...form, event_name: e.target.value })}
            />
            <Input
              label="Location"
              placeholder="e.g. London"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
            <Input
              label="Dates"
              placeholder="e.g. 12–14 July"
              value={form.dates}
              onChange={(e) => setForm({ ...form, dates: e.target.value })}
            />
            <Input
              label="Guests"
              type="number"
              placeholder="e.g. 4"
              value={form.guests}
              onChange={(e) => setForm({ ...form, guests: e.target.value })}
            />
          </div>

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
            <SelectMenu
              label="Priority"
              value={form.priority}
              onValueChange={(v) => setForm({ ...form, priority: v })}
              options={PRIORITY_OPTIONS}
            />
          </div>

          {/* Commercials — internal only. Status lives here so it stays in the
              admin's working area and gets updated as the deal progresses. */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-dim mb-3">
              Sourcing & commercials
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <SelectMenu
                label="Status"
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
                options={STATUS_OPTIONS}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Supplier"
                placeholder="e.g. Quintessentially"
                value={form.supplier_name}
                onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
              />
              <Input
                label="Budget (£)"
                placeholder="Member's budget"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              />
              <Input
                label="Supplier cost (£)"
                value={form.supplier_cost}
                onChange={(e) => setForm({ ...form, supplier_cost: e.target.value })}
              />
              <Input
                label="Sale price (£)"
                value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
              />
              <Input
                label="Quoted to member (£)"
                value={form.quoted_amount}
                onChange={(e) => setForm({ ...form, quoted_amount: e.target.value })}
              />
              <Input
                label="Commission (£)"
                value={form.commission}
                onChange={(e) => setForm({ ...form, commission: e.target.value })}
              />
            </div>
            {formMargin != null && (
              <p className="mt-3 text-sm text-text-muted">
                Margin:{' '}
                <span
                  className={cn(
                    'font-medium tabular-nums',
                    formMargin < 0 ? 'text-accent-warm' : 'text-text',
                  )}
                >
                  {formatCurrency(formMargin)}
                </span>
              </p>
            )}
          </div>

          <Textarea
            label="Internal notes"
            placeholder="Working notes — never shown to the member."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
          />

          <div className="flex items-center justify-between pt-2">
            {editingId ? (
              <Button
                variant="ghost"
                icon={<Trash2 size={14} />}
                className="text-accent-warm"
                onClick={remove}
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
              <Button loading={saving} onClick={save}>
                {editingId ? 'Save changes' : 'Create request'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
