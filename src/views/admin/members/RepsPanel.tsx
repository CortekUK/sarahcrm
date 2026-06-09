'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { Plus, UserMinus, Star, Users } from 'lucide-react'

// Representatives roster for a business / partner membership. Each rep is
// a members row whose parent_member_id is this account, so they each have
// their own portal login and share the company's tier; billing stays on
// the parent. Lives on the member detail page, shown only for business /
// partner accounts that are themselves a parent (not a rep).

interface RepRow {
  id: string
  is_primary_rep: boolean
  rep_role: string | null
  membership_status: string
  profiles: {
    first_name: string | null
    last_name: string | null
    email: string | null
    avatar_url: string | null
  } | null
}

function repName(r: RepRow): string {
  const p = r.profiles
  return `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || p?.email || 'Unnamed'
}

const statusVariant: Record<string, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  active: 'active',
  pending: 'upcoming',
  paused: 'info',
  expired: 'draft',
  cancelled: 'urgent',
}

export function RepsPanel({
  parentMemberId,
  companyName,
}: {
  parentMemberId: string
  companyName: string | null
}) {
  const confirm = useConfirm()
  const [reps, setReps] = useState<RepRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)
  const [sendInvite, setSendInvite] = useState(true)

  useEffect(() => {
    fetchReps()
  }, [parentMemberId])

  async function fetchReps() {
    setLoading(true)
    const { data } = await supabase
      .from('members')
      .select('id, is_primary_rep, rep_role, membership_status, profiles(first_name, last_name, email, avatar_url)')
      .eq('parent_member_id', parentMemberId)
      .is('deleted_at', null)
      .order('is_primary_rep', { ascending: false })
      .order('created_at', { ascending: true })
    if (data) setReps(data as unknown as RepRow[])
    setLoading(false)
  }

  function resetForm() {
    setFirstName('')
    setLastName('')
    setEmail('')
    setRole('')
    setIsPrimary(false)
    setSendInvite(true)
  }

  async function handleAdd() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast({ title: 'Missing details', description: 'First name, last name and email are required.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/members/add-rep', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          parent_member_id: parentMemberId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          rep_role: role.trim() || undefined,
          is_primary: isPrimary,
          send_invite: sendInvite,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not add representative', description: json.error, variant: 'destructive' })
        return
      }
      toast({
        title: 'Representative added',
        description: json.invite_sent ? `${firstName} ${lastName} — invite email sent.` : `${firstName} ${lastName} added.`,
      })
      setOpen(false)
      resetForm()
      fetchReps()
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(r: RepRow) {
    const ok = await confirm({
      title: `Remove ${repName(r)}?`,
      description: (
        <span>
          Their membership will be set to <strong className="text-text">cancelled</strong> and their
          portal access revoked. The company account and its other representatives are unaffected.
        </span>
      ),
      confirmLabel: 'Remove representative',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase
      .from('members')
      .update({ membership_status: 'cancelled' })
      .eq('id', r.id)
    if (error) {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' })
      return
    }
    setReps((list) =>
      list.map((row) => (row.id === r.id ? { ...row, membership_status: 'cancelled' } : row)),
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Representatives ({reps.filter((r) => r.membership_status !== 'cancelled').length})</CardTitle>
          <p className="mt-1 text-xs text-text-dim">
            People who share {companyName ? `${companyName}'s` : 'this'} business membership. Each gets
            their own portal login; billing stays on this account.
          </p>
        </div>
        <Button size="sm" icon={<Plus size={15} />} onClick={() => setOpen(true)}>
          Add rep
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-text-dim">Loading…</div>
        ) : reps.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Users size={24} className="mx-auto text-text-dim mb-3" />
            <p className="text-sm text-text-muted">No representatives yet</p>
            <p className="text-xs text-text-dim mt-1">
              Add colleagues who should have their own login under this membership.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {reps.map((r) => (
              <div key={r.id} className="px-5 sm:px-6 py-4 flex items-center gap-4">
                <Avatar src={r.profiles?.avatar_url} name={repName(r)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text truncate flex items-center gap-2">
                    {repName(r)}
                    {r.is_primary_rep && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gold">
                        <Star size={11} className="fill-gold" /> Primary
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-text-dim truncate">
                    {r.rep_role ? `${r.rep_role} · ` : ''}
                    {r.profiles?.email}
                  </p>
                </div>
                <Badge variant={statusVariant[r.membership_status] ?? 'draft'} dot>
                  {r.membership_status}
                </Badge>
                <Link
                  href={`/dashboard/members/${r.id}`}
                  className="text-xs text-text-dim hover:text-gold transition-colors shrink-0"
                >
                  Open
                </Link>
                {r.membership_status !== 'cancelled' && (
                  <button
                    onClick={() => handleRemove(r)}
                    className="shrink-0 w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-text-dim hover:text-accent-warm hover:bg-surface-2 transition-colors"
                    aria-label="Remove representative"
                  >
                    <UserMinus size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Modal open={open} onClose={() => setOpen(false)} title="Add representative" size="md">
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            label="Role at the business (optional)"
            placeholder="e.g. Marketing Director"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
          <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-gold"
            />
            Make this the primary contact for the account
          </label>
          <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-gold"
            />
            Send them a branded set-password invite now
          </label>
        </div>
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleAdd} loading={saving}>
            Add representative
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
