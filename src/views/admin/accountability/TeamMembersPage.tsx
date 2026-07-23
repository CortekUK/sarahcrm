'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { StatCard } from '@/components/ui/StatCard'
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
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { toast } from '@/lib/hooks/use-toast'
import { Loader2, Plus, Users, Mail } from 'lucide-react'
import { personName } from '@/lib/accountability'

interface StaffRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  job_title: string | null
  role: string
  staff_status: string
}

const ROLE_LABEL: Record<string, string> = {
  team_member: 'Team member',
  freelancer: 'Freelancer',
}

// Inline editable £/hour rate. Saved (upserted into staff_rates) on blur or
// Enter — only when the value actually changed. Rates live in an admin-only
// table, never on the world-readable profiles row.
function RateCell({
  staffId,
  initial,
  adminId,
}: {
  staffId: string
  initial: number | null
  adminId: string | null
}) {
  const [value, setValue] = useState(initial != null ? String(initial) : '')
  const [saved, setSaved] = useState(initial != null ? String(initial) : '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (value === saved) return
    const trimmed = value.trim()
    const rate = trimmed === '' ? null : Number(trimmed)
    if (rate != null && (!Number.isFinite(rate) || rate < 0)) {
      toast({ title: 'Enter a valid rate', variant: 'destructive' })
      setValue(saved)
      return
    }
    setBusy(true)
    const { error } = await supabase.from('staff_rates').upsert(
      {
        staff_id: staffId,
        hourly_rate: rate,
        updated_by: adminId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'staff_id' },
    )
    setBusy(false)
    if (error) {
      toast({ title: 'Could not save rate', description: error.message, variant: 'destructive' })
      setValue(saved)
      return
    }
    setSaved(value)
    toast({ title: 'Rate saved' })
  }

  return (
    <div className="w-28">
      <Input
        type="number"
        min="0"
        step="0.5"
        inputMode="decimal"
        prefix="£"
        placeholder="—"
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

const emptyForm = {
  first_name: '',
  last_name: '',
  email: '',
  role: 'team_member',
  job_title: '',
  send_invite: true,
}

export function TeamMembersPage() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [ratesById, setRatesById] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [staffRes, ratesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, email, job_title, role, staff_status')
        .in('role', ['team_member', 'freelancer'])
        .order('first_name', { ascending: true }),
      supabase.from('staff_rates').select('staff_id, hourly_rate'),
    ])
    if (staffRes.data) setStaff(staffRes.data as StaffRow[])
    if (ratesRes.data) {
      const map: Record<string, number | null> = {}
      for (const r of ratesRes.data) map[r.staff_id] = r.hourly_rate
      setRatesById(map)
    }
    setLoading(false)
  }

  const counts = useMemo(() => {
    const active = staff.filter((s) => s.staff_status === 'active').length
    return { total: staff.length, active, inactive: staff.length - active }
  }, [staff])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return staff
    return staff.filter((s) =>
      `${s.first_name ?? ''} ${s.last_name ?? ''} ${s.email ?? ''} ${s.job_title ?? ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [staff, query])

  function openNew() {
    setForm({ ...emptyForm })
    setModalOpen(true)
  }

  async function createStaff() {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      toast({ title: 'First name, last name and email are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/team/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          role: form.role,
          job_title: form.job_title.trim() || null,
          send_invite: form.send_invite,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not add team member', description: json.error, variant: 'destructive' })
        return
      }
      toast({
        title: 'Team member added',
        description: json.invite_sent
          ? 'A sign-in invite has been emailed to them.'
          : `No invite email was sent — ${json.invite_error ?? 'reason unknown'} You can use "Send login" to try again.`,
        variant: json.invite_sent ? undefined : 'destructive',
      })
      setModalOpen(false)
      load()
    } catch (e) {
      toast({
        title: 'Could not add team member',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(s: StaffRow, next: boolean) {
    const status = next ? 'active' : 'inactive'
    setStaff((prev) => prev.map((x) => (x.id === s.id ? { ...x, staff_status: status } : x)))
    const { error } = await supabase
      .from('profiles')
      .update({ staff_status: status })
      .eq('id', s.id)
    if (error) {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' })
      load()
    }
  }

  async function resendInvite(s: StaffRow) {
    setBusyId(s.id)
    try {
      const res = await fetch('/api/admin/team/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: s.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not send login', description: json.error, variant: 'destructive' })
        return
      }
      toast({ title: 'Login details sent', description: `Emailed to ${json.email}.` })
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading team members…
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Team Members"
        description="Staff and freelancers with their own limited logins. They see only their own accountability tasks — nothing else in the CRM."
        actions={
          <Button icon={<Plus size={15} />} onClick={openNew}>
            Add team member
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-5 mb-6">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Active" value={counts.active} changeType="positive" changeText="can sign in" />
        <StatCard
          label="Inactive"
          value={counts.inactive}
          changeType={counts.inactive > 0 ? 'negative' : 'neutral'}
        />
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search team…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-16">
              <AdminEmptyState
                icon={Users}
                title="No team members yet"
                description="Add a team member or freelancer to give them a login and start assigning accountability tasks."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Job title</TableHead>
                  <TableHead>Rate (£/h)</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} className="hover:bg-transparent">
                    <TableCell className="font-medium text-text">{personName(s)}</TableCell>
                    <TableCell className="text-text-muted">{s.email ?? '—'}</TableCell>
                    <TableCell className="text-text-muted">{s.job_title ?? '—'}</TableCell>
                    <TableCell>
                      <RateCell
                        staffId={s.id}
                        initial={ratesById[s.id] ?? null}
                        adminId={profile?.id ?? null}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="info">{ROLE_LABEL[s.role] ?? s.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <ActiveToggle
                        active={s.staff_status === 'active'}
                        onChange={(next) => toggleActive(s, next)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={
                          busyId === s.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Mail size={14} />
                          )
                        }
                        disabled={busyId === s.id}
                        onClick={() => resendInvite(s)}
                      >
                        Send login
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add team member" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="First name"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
            <Input
              label="Last name"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectMenu
              label="Type"
              value={form.role}
              onValueChange={(v) => setForm({ ...form, role: v })}
              options={[
                { value: 'team_member', label: 'Team member' },
                { value: 'freelancer', label: 'Freelancer' },
              ]}
            />
            <Input
              label="Job title"
              placeholder="e.g. Events Coordinator"
              value={form.job_title}
              onChange={(e) => setForm({ ...form, job_title: e.target.value })}
            />
          </div>
          <p className="text-xs text-text-dim">
            An invite email with a temporary password is sent so they can sign in at the staff
            sign-in page. They can only access their own accountability tasks.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={createStaff}>
              Add & invite
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
