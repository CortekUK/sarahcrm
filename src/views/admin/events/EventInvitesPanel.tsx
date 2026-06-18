'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Check, X, MailCheck, Ticket } from 'lucide-react'

// Event invite list — who the team has INVITED, tracked separately from
// bookings. An invitee is 'invited' until they actually book the event (the
// checkout/book routes flip them to 'confirmed' by matching email), or until
// an admin marks them confirmed/declined by hand. The tabs give the
// Invited-vs-Confirmed views Sarah asked for.

type InviteStatus = 'invited' | 'confirmed' | 'declined'

interface InviteRow {
  id: string
  member_id: string | null
  invitee_name: string | null
  invitee_email: string | null
  invitee_company: string | null
  status: string
  booking_id: string | null
  invited_at: string
  members: {
    id: string
    profiles: {
      first_name: string | null
      last_name: string | null
      company_name: string | null
      avatar_url: string | null
    } | null
  } | null
}

interface MemberOption {
  id: string
  name: string
  email: string | null
  company: string | null
}

const TABS: { value: InviteStatus; label: string }[] = [
  { value: 'invited', label: 'Invited' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
]

const statusChip: Record<string, string> = {
  invited: 'bg-[rgba(90,123,150,0.1)] text-[#5A7B96] border border-[rgba(90,123,150,0.25)]',
  confirmed: 'bg-gold-muted text-gold-dark border border-border-gold',
  declined: 'bg-surface-2 text-text-muted border border-border',
}

function inviteName(r: InviteRow): string {
  if (r.member_id) {
    const p = r.members?.profiles
    const full = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim()
    return full || r.invitee_name || p?.company_name || 'Member'
  }
  return r.invitee_name || r.invitee_company || r.invitee_email || 'Invitee'
}

function inviteSub(r: InviteRow): string {
  const bits: string[] = []
  if (r.invitee_email) bits.push(r.invitee_email)
  const company = r.invitee_company || (r.member_id ? r.members?.profiles?.company_name : null)
  if (company) bits.push(company)
  return bits.filter(Boolean).join(' · ')
}

export function EventInvitesPanel({ eventId }: { eventId: string }) {
  const confirm = useConfirm()
  const { user } = useAuth()
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<InviteStatus>('invited')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Add-form state
  const [kind, setKind] = useState<'external' | 'member'>('external')
  const [memberId, setMemberId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')

  useEffect(() => {
    fetchInvites()
  }, [eventId])

  async function fetchInvites() {
    setLoading(true)
    const [inviteRes, memberRes] = await Promise.all([
      supabase
        .from('event_invitations')
        .select(
          'id, member_id, invitee_name, invitee_email, invitee_company, status, booking_id, invited_at, members(id, profiles(first_name, last_name, company_name, avatar_url))',
        )
        .eq('event_id', eventId)
        .order('invited_at', { ascending: true }),
      supabase
        .from('members')
        .select('id, company_name, profiles(first_name, last_name, company_name, email)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500),
    ])

    if (inviteRes.data) setInvites(inviteRes.data as unknown as InviteRow[])
    if (memberRes.data) {
      const opts = (memberRes.data as unknown as Array<{
        id: string
        company_name: string | null
        profiles: { first_name: string | null; last_name: string | null; company_name: string | null; email: string | null } | null
      }>).map((m) => {
        const full = `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim()
        return {
          id: m.id,
          name: full || m.company_name || m.profiles?.company_name || 'Unnamed member',
          email: m.profiles?.email ?? null,
          company: m.company_name || m.profiles?.company_name || null,
        }
      })
      setMembers(opts)
    }
    setLoading(false)
  }

  function resetForm() {
    setKind('external')
    setMemberId('')
    setName('')
    setEmail('')
    setCompany('')
  }

  async function handleAdd() {
    if (kind === 'member' && !memberId) {
      toast({ title: 'Choose a member', description: 'Select who you invited.', variant: 'destructive' })
      return
    }
    if (kind === 'external' && !name.trim() && !email.trim()) {
      toast({ title: 'Add the invitee', description: 'Enter at least a name or email.', variant: 'destructive' })
      return
    }

    // Member invites copy the member's name/email so the booking-time email
    // match (and the list) work the same as external invites.
    const chosen = members.find((m) => m.id === memberId)
    const payload = {
      event_id: eventId,
      member_id: kind === 'member' ? memberId : null,
      invitee_name: kind === 'member' ? chosen?.name ?? null : name.trim() || null,
      invitee_email: kind === 'member' ? chosen?.email ?? null : email.trim() || null,
      invitee_company: kind === 'member' ? chosen?.company ?? null : company.trim() || null,
      status: 'invited',
      created_by: user?.id ?? null,
    }

    setSaving(true)
    const { error } = await supabase.from('event_invitations').insert(payload)
    setSaving(false)
    if (error) {
      toast({
        title: 'Could not add invite',
        description: error.message.includes('duplicate')
          ? 'That email is already on this event’s invite list.'
          : error.message,
        variant: 'destructive',
      })
      return
    }
    toast({ title: 'Invite added' })
    setOpen(false)
    resetForm()
    fetchInvites()
  }

  async function setStatus(r: InviteRow, next: InviteStatus) {
    const prev = invites
    setInvites((list) => list.map((x) => (x.id === r.id ? { ...x, status: next } : x)))
    const { error } = await supabase
      .from('event_invitations')
      .update({ status: next, responded_at: next === 'invited' ? null : new Date().toISOString() })
      .eq('id', r.id)
    if (error) {
      setInvites(prev)
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' })
    }
  }

  async function remove(r: InviteRow) {
    const ok = await confirm({
      title: 'Remove this invite?',
      description: (
        <span>
          <strong className="text-text">{inviteName(r)}</strong> will be removed from this event’s
          invite list. Their booking (if any) is not affected.
        </span>
      ),
      confirmLabel: 'Remove invite',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('event_invitations').delete().eq('id', r.id)
    if (error) {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' })
      return
    }
    setInvites((list) => list.filter((x) => x.id !== r.id))
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { invited: 0, confirmed: 0, declined: 0 }
    for (const r of invites) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [invites])

  const shown = invites.filter((r) => r.status === tab)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Invite list ({invites.length})</CardTitle>
          <p className="mt-1 text-xs text-text-dim">
            Track who you’ve invited — they move to Confirmed automatically when they book.
          </p>
        </div>
        <Button size="sm" icon={<Plus size={15} />} onClick={() => setOpen(true)}>
          Add invite
        </Button>
      </CardHeader>

      {/* Tabs — the Invited vs Confirmed views */}
      <div className="px-5 sm:px-6 flex items-center gap-1.5 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'relative px-3 py-2.5 text-sm transition-colors',
              tab === t.value ? 'text-text' : 'text-text-muted hover:text-text',
            )}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-text-dim">{counts[t.value] ?? 0}</span>
            {tab === t.value && (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-gold rounded-full" />
            )}
          </button>
        ))}
      </div>

      <CardContent className="p-0">
        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-text-dim">Loading invites…</div>
        ) : shown.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <MailCheck size={24} className="mx-auto text-text-dim mb-3" />
            <p className="text-sm text-text-muted">
              {tab === 'invited'
                ? 'No one invited yet'
                : tab === 'confirmed'
                  ? 'No confirmed invitees yet'
                  : 'No declined invitees'}
            </p>
            {tab === 'invited' && (
              <p className="text-xs text-text-dim mt-1">
                Add people you’ve invited — they’ll show as Confirmed once they book.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {shown.map((r) => (
              <div key={r.id} className="px-5 sm:px-6 py-4 flex items-center gap-4">
                <Avatar
                  src={r.member_id ? r.members?.profiles?.avatar_url : undefined}
                  name={inviteName(r)}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text truncate">{inviteName(r)}</p>
                  {inviteSub(r) && <p className="text-xs text-text-dim truncate">{inviteSub(r)}</p>}
                </div>
                <span
                  className={`shrink-0 hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${statusChip[r.status] ?? statusChip.invited}`}
                >
                  {r.status === 'confirmed' && r.booking_id && <Ticket size={11} />}
                  {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                </span>

                {/* Quick actions per current tab */}
                <div className="shrink-0 flex items-center gap-1">
                  {r.status !== 'confirmed' && (
                    <button
                      onClick={() => setStatus(r, 'confirmed')}
                      title="Mark confirmed"
                      className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-text-dim hover:text-[#5C8A6B] hover:bg-surface-2 transition-colors"
                    >
                      <Check size={15} />
                    </button>
                  )}
                  {r.status !== 'declined' && (
                    <button
                      onClick={() => setStatus(r, 'declined')}
                      title="Mark declined"
                      className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-text-dim hover:text-accent-warm hover:bg-surface-2 transition-colors"
                    >
                      <X size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => remove(r)}
                    title="Remove invite"
                    className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-text-dim hover:text-accent-warm hover:bg-surface-2 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add invite modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Add invite" size="md">
        <div className="space-y-5">
          <div className="flex rounded-[var(--radius-md)] border border-border p-1 bg-surface-2">
            {([
              { v: 'external', label: 'External guest' },
              { v: 'member', label: 'Existing member' },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setKind(opt.v)}
                className={`flex-1 px-3 py-2 text-sm rounded-[var(--radius-sm)] transition-colors ${
                  kind === opt.v ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {kind === 'member' ? (
            <Select
              label="Member"
              placeholder="Choose a member…"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              options={members.map((m) => ({
                value: m.id,
                label: m.company ? `${m.name} — ${m.company}` : m.name,
              }))}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Name" placeholder="e.g. Jane Doe" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Company (optional)" placeholder="e.g. Acme" value={company} onChange={(e) => setCompany(e.target.value)} />
              <Input
                label="Email"
                type="email"
                hint="Used to auto-confirm them when they book."
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sm:col-span-2"
              />
            </div>
          )}
        </div>
        <div className="-mx-6 -mb-4 mt-6 px-6 py-4 border-t border-border flex items-center justify-end gap-3 bg-surface rounded-b-[var(--radius-xl)]">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleAdd} loading={saving}>
            Add invite
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
