'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Avatar } from '@/components/ui/Avatar'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, Handshake } from 'lucide-react'

// Sponsorship management for a single event. Lives on the event detail
// page so the team can see who is sponsoring, attach a package + amount,
// and track each sponsor's status from a proposal through to confirmed.
// The sponsorships table links event ↔ member; we join member → profiles
// for names. Revenue here is reported separately from ticket revenue.

type SponsorStatus = 'proposed' | 'confirmed' | 'invoiced' | 'paid' | 'declined'

interface SponsorRow {
  id: string
  package_name: string
  amount_pence: number
  status: string
  showcase_slot: string | null
  brand_alignment: string | null
  member_id: string
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
  company: string | null
}

const STATUS_OPTIONS: { value: SponsorStatus; label: string }[] = [
  { value: 'proposed', label: 'Proposed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' },
  { value: 'declined', label: 'Declined' },
]

const statusVariant: Record<string, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  proposed: 'draft',
  confirmed: 'upcoming',
  invoiced: 'info',
  paid: 'active',
  declined: 'urgent',
}

function memberName(s: SponsorRow): string {
  const p = s.members?.profiles
  const full = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim()
  return full || p?.company_name || 'Unknown member'
}

export function SponsorsPanel({
  eventId,
  defaultAmountPence,
}: {
  eventId: string
  defaultAmountPence: number
}) {
  const confirm = useConfirm()
  const [sponsors, setSponsors] = useState<SponsorRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Add-form state
  const [memberId, setMemberId] = useState('')
  const [packageName, setPackageName] = useState('')
  const [amount, setAmount] = useState(
    defaultAmountPence > 0 ? String(defaultAmountPence / 100) : '',
  )
  const [status, setStatus] = useState<SponsorStatus>('proposed')
  const [showcaseSlot, setShowcaseSlot] = useState('')
  const [brandAlignment, setBrandAlignment] = useState('')

  useEffect(() => {
    fetchSponsors()
  }, [eventId])

  async function fetchSponsors() {
    setLoading(true)
    const [sponsorRes, memberRes] = await Promise.all([
      supabase
        .from('sponsorships')
        .select(
          'id, package_name, amount_pence, status, showcase_slot, brand_alignment, member_id, members(id, profiles(first_name, last_name, company_name, avatar_url))',
        )
        .eq('event_id', eventId)
        .order('created_at', { ascending: true }),
      supabase
        .from('members')
        .select('id, company_name, profiles(first_name, last_name, company_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500),
    ])

    if (sponsorRes.data) setSponsors(sponsorRes.data as unknown as SponsorRow[])
    if (memberRes.data) {
      const opts = (memberRes.data as unknown as Array<{
        id: string
        company_name: string | null
        profiles: { first_name: string | null; last_name: string | null; company_name: string | null } | null
      }>).map((m) => {
        const full = `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim()
        const company = m.company_name || m.profiles?.company_name || null
        return { id: m.id, name: full || company || 'Unnamed member', company }
      })
      setMembers(opts)
    }
    setLoading(false)
  }

  function resetForm() {
    setMemberId('')
    setPackageName('')
    setAmount(defaultAmountPence > 0 ? String(defaultAmountPence / 100) : '')
    setStatus('proposed')
    setShowcaseSlot('')
    setBrandAlignment('')
  }

  async function handleAdd() {
    if (!memberId) {
      toast({ title: 'Choose a member', description: 'Select which member is sponsoring.', variant: 'destructive' })
      return
    }
    if (!packageName.trim()) {
      toast({ title: 'Add a package name', description: 'e.g. Headline, Drinks reception.', variant: 'destructive' })
      return
    }
    const amountPence = Math.round((parseFloat(amount) || 0) * 100)
    setSaving(true)
    const { error } = await supabase.from('sponsorships').insert({
      event_id: eventId,
      member_id: memberId,
      package_name: packageName.trim(),
      amount_pence: amountPence,
      status,
      showcase_slot: showcaseSlot.trim() || null,
      brand_alignment: brandAlignment.trim() || null,
    })
    setSaving(false)
    if (error) {
      toast({ title: 'Could not add sponsor', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Sponsor added' })
    setOpen(false)
    resetForm()
    fetchSponsors()
  }

  async function handleStatusChange(id: string, next: string) {
    // Optimistic — flip locally, persist, roll back on error.
    const prev = sponsors
    setSponsors((s) => s.map((row) => (row.id === id ? { ...row, status: next } : row)))
    const { error } = await supabase.from('sponsorships').update({ status: next }).eq('id', id)
    if (error) {
      setSponsors(prev)
      toast({ title: 'Could not update status', description: error.message, variant: 'destructive' })
    }
  }

  async function handleRemove(s: SponsorRow) {
    const ok = await confirm({
      title: 'Remove this sponsor?',
      description: (
        <span>
          <strong className="text-text">{memberName(s)}</strong> — {s.package_name} (
          {formatCurrency(s.amount_pence)}) will be removed from this event. This cannot be undone.
        </span>
      ),
      confirmLabel: 'Remove sponsor',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('sponsorships').delete().eq('id', s.id)
    if (error) {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' })
      return
    }
    setSponsors((list) => list.filter((row) => row.id !== s.id))
  }

  // Confirmed-or-better counts toward expected sponsorship revenue.
  const committedPence = sponsors
    .filter((s) => ['confirmed', 'invoiced', 'paid'].includes(s.status))
    .reduce((sum, s) => sum + s.amount_pence, 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Sponsors ({sponsors.length})</CardTitle>
          {committedPence > 0 && (
            <p className="mt-1 text-xs text-text-dim">
              {formatCurrency(committedPence)} committed
            </p>
          )}
        </div>
        <Button size="sm" icon={<Plus size={15} />} onClick={() => setOpen(true)}>
          Add sponsor
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-text-dim">Loading sponsors…</div>
        ) : sponsors.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Handshake size={24} className="mx-auto text-text-dim mb-3" />
            <p className="text-sm text-text-muted">No sponsors yet</p>
            <p className="text-xs text-text-dim mt-1">
              Attach a member and a package to start tracking sponsorship for this event.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sponsors.map((s) => (
              <div
                key={s.id}
                className="px-5 sm:px-6 py-4 flex items-center gap-4"
              >
                <Avatar
                  src={s.members?.profiles?.avatar_url}
                  name={memberName(s)}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text truncate">{memberName(s)}</p>
                  <p className="text-xs text-text-dim truncate">
                    {s.package_name}
                    {s.showcase_slot ? ` · ${s.showcase_slot}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <p className="text-sm text-text">{formatCurrency(s.amount_pence)}</p>
                </div>
                <div className="shrink-0 w-[150px]">
                  <Select
                    options={STATUS_OPTIONS}
                    value={s.status}
                    onChange={(e) => handleStatusChange(s.id, e.target.value)}
                  />
                </div>
                <button
                  onClick={() => handleRemove(s)}
                  className="shrink-0 w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-text-dim hover:text-accent-warm hover:bg-surface-2 transition-colors"
                  aria-label="Remove sponsor"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Modal open={open} onClose={() => setOpen(false)} title="Add sponsor" size="md">
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Package"
              placeholder="e.g. Headline, Drinks reception"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
            />
            <Input
              label="Amount (£)"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as SponsorStatus)}
              options={STATUS_OPTIONS}
            />
            <Input
              label="Showcase slot (optional)"
              placeholder="e.g. Main stage, Foyer table"
              value={showcaseSlot}
              onChange={(e) => setShowcaseSlot(e.target.value)}
            />
          </div>
          <Textarea
            label="Brand alignment (optional)"
            hint="Why this sponsor fits the event — for the team's reference."
            rows={3}
            value={brandAlignment}
            onChange={(e) => setBrandAlignment(e.target.value)}
          />
        </div>
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleAdd} loading={saving}>
            Add sponsor
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
