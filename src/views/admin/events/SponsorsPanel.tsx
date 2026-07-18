'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Avatar } from '@/components/ui/Avatar'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, Handshake, Copy, Send, Check, Ticket, Settings2 } from 'lucide-react'
import { SponsorManageModal, type ManageSponsor } from './SponsorManageModal'

// Sponsorship management for a single event. Lives on the event detail page.
//
// Each sponsor carries two amounts:
//   • amount_pence       — what they INVEST as a sponsor (revenue, tracked here)
//   • event_price_pence  — what they PAY to attend (their personal ticket rate)
//
// Sponsors are usually external companies (not members), so we store their
// contact details directly. Every sponsor gets a unique booking link
// (/events/<slug>?s=<token>) that Sarah sends with a chosen email template —
// opening it shows the public event page at the sponsor's reserved rate.

type SponsorStatus = 'proposed' | 'confirmed' | 'invoiced' | 'paid' | 'declined'

interface SponsorRow {
  id: string
  package_name: string
  amount_pence: number
  event_price_pence: number | null
  status: string
  showcase_slot: string | null
  brand_alignment: string | null
  booking_token: string
  proposal_html: string | null
  roi_report_html: string | null
  roi_reach: number | null
  invite_sent_at: string | null
  member_id: string | null
  sponsor_name: string | null
  sponsor_email: string | null
  sponsor_company: string | null
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

interface TemplateOption {
  id: string
  name: string
}

const STATUS_OPTIONS: { value: SponsorStatus; label: string }[] = [
  { value: 'proposed', label: 'Proposed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' },
  { value: 'declined', label: 'Declined' },
]

function memberName(s: SponsorRow): string {
  if (s.member_id) {
    const p = s.members?.profiles
    const full = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim()
    return full || p?.company_name || 'Unknown member'
  }
  return s.sponsor_name || s.sponsor_company || s.sponsor_email || 'Unnamed sponsor'
}

function sponsorSubtitle(s: SponsorRow): string {
  const bits = [s.package_name]
  if (s.member_id) {
    if (s.sponsor_company || s.members?.profiles?.company_name) {
      bits.push((s.sponsor_company ?? s.members?.profiles?.company_name) as string)
    }
  } else if (s.sponsor_company) {
    bits.push(s.sponsor_company)
  }
  if (s.showcase_slot) bits.push(s.showcase_slot)
  return bits.filter(Boolean).join(' · ')
}

export function SponsorsPanel({
  eventId,
  eventSlug,
  defaultAmountPence,
  defaultTicketPence,
}: {
  eventId: string
  eventSlug: string
  defaultAmountPence: number
  defaultTicketPence: number
}) {
  const confirm = useConfirm()
  const [sponsors, setSponsors] = useState<SponsorRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Add-form state
  const [kind, setKind] = useState<'external' | 'member'>('external')
  const [memberId, setMemberId] = useState('')
  const [sponsorName, setSponsorName] = useState('')
  const [sponsorEmail, setSponsorEmail] = useState('')
  const [sponsorCompany, setSponsorCompany] = useState('')
  const [packageName, setPackageName] = useState('')
  const [amount, setAmount] = useState(
    defaultAmountPence > 0 ? String(defaultAmountPence / 100) : '',
  )
  const [ticket, setTicket] = useState(
    defaultTicketPence > 0 ? String(defaultTicketPence / 100) : '',
  )
  const [status, setStatus] = useState<SponsorStatus>('proposed')
  const [showcaseSlot, setShowcaseSlot] = useState('')
  const [brandAlignment, setBrandAlignment] = useState('')

  // Manage-modal state (delivery checklist + proposal/ROI + portal link)
  const [manageFor, setManageFor] = useState<ManageSponsor | null>(null)

  // Invite-modal state
  const [inviteFor, setInviteFor] = useState<SponsorRow | null>(null)
  const [inviteTemplateId, setInviteTemplateId] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchSponsors()
  }, [eventId])

  async function fetchSponsors() {
    setLoading(true)
    const [sponsorRes, memberRes, templateRes] = await Promise.all([
      supabase
        .from('sponsorships')
        .select(
          'id, package_name, amount_pence, event_price_pence, status, showcase_slot, brand_alignment, booking_token, proposal_html, roi_report_html, roi_reach, invite_sent_at, member_id, sponsor_name, sponsor_email, sponsor_company, members(id, profiles(first_name, last_name, company_name, avatar_url))',
        )
        .eq('event_id', eventId)
        .order('created_at', { ascending: true }),
      supabase
        .from('members')
        .select('id, company_name, profiles(first_name, last_name, company_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('email_templates')
        .select('id, name')
        .eq('is_draft', false)
        .order('updated_at', { ascending: false })
        .limit(200),
    ])

    if (sponsorRes.data) setSponsors(sponsorRes.data as unknown as SponsorRow[])
    if (templateRes.data) setTemplates(templateRes.data as TemplateOption[])
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
    setKind('external')
    setMemberId('')
    setSponsorName('')
    setSponsorEmail('')
    setSponsorCompany('')
    setPackageName('')
    setAmount(defaultAmountPence > 0 ? String(defaultAmountPence / 100) : '')
    setTicket(defaultTicketPence > 0 ? String(defaultTicketPence / 100) : '')
    setStatus('proposed')
    setShowcaseSlot('')
    setBrandAlignment('')
  }

  async function handleAdd() {
    if (kind === 'member' && !memberId) {
      toast({ title: 'Choose a member', description: 'Select which member is sponsoring.', variant: 'destructive' })
      return
    }
    if (kind === 'external' && !sponsorName.trim() && !sponsorCompany.trim()) {
      toast({ title: 'Add a sponsor', description: 'Enter the sponsor’s name or company.', variant: 'destructive' })
      return
    }
    if (!packageName.trim()) {
      toast({ title: 'Add a package name', description: 'e.g. Headline, Drinks reception.', variant: 'destructive' })
      return
    }
    if (!(parseFloat(ticket) > 0)) {
      toast({
        title: 'Set their ticket price',
        description: 'The reserved rate on their booking link must be more than £0.',
        variant: 'destructive',
      })
      return
    }
    const amountPence = Math.round((parseFloat(amount) || 0) * 100)
    const ticketPence = Math.round((parseFloat(ticket) || 0) * 100)
    setSaving(true)
    const { error } = await supabase.from('sponsorships').insert({
      event_id: eventId,
      member_id: kind === 'member' ? memberId : null,
      sponsor_name: kind === 'external' ? sponsorName.trim() || null : null,
      sponsor_email: kind === 'external' ? sponsorEmail.trim() || null : null,
      sponsor_company: kind === 'external' ? sponsorCompany.trim() || null : null,
      package_name: packageName.trim(),
      amount_pence: amountPence,
      event_price_pence: ticketPence,
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
    const prev = sponsors
    setSponsors((s) => s.map((row) => (row.id === id ? { ...row, status: next } : row)))
    const { error } = await supabase.from('sponsorships').update({ status: next }).eq('id', id)
    if (error) {
      setSponsors(prev)
      toast({ title: 'Could not update status', description: error.message, variant: 'destructive' })
    }
  }

  function bookingLink(s: SponsorRow): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/events/${eventSlug}?s=${s.booking_token}`
  }

  async function copyLink(s: SponsorRow) {
    try {
      await navigator.clipboard.writeText(bookingLink(s))
      toast({ title: 'Link copied', description: 'The sponsor’s booking link is on your clipboard.' })
    } catch {
      toast({ title: 'Could not copy', description: bookingLink(s), variant: 'destructive' })
    }
  }

  async function sendInvite() {
    if (!inviteFor || !inviteTemplateId) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/sponsors/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorship_id: inviteFor.id, template_id: inviteTemplateId }),
      })
      const json = (await res.json()) as { ok?: boolean; to?: string; error?: string }
      if (!res.ok || !json.ok) {
        toast({ title: 'Could not send', description: json.error || 'Send failed.', variant: 'destructive' })
        setSending(false)
        return
      }
      toast({ title: 'Invite sent', description: `Sent to ${json.to}.` })
      setInviteFor(null)
      setInviteTemplateId('')
      fetchSponsors()
    } catch (err) {
      toast({
        title: 'Could not send',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
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

  const canEmailInvite = inviteFor
    ? !!(inviteFor.sponsor_email || inviteFor.member_id)
    : false

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Sponsors ({sponsors.length})</CardTitle>
          {committedPence > 0 && (
            <p className="mt-1 text-xs text-text-dim">{formatCurrency(committedPence)} committed</p>
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
              Add a sponsor with their investment and a reserved ticket price, then send them a
              personalised booking link.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sponsors.map((s) => (
              <div key={s.id} className="px-5 sm:px-6 py-4">
                <div className="flex items-center gap-4">
                  <Avatar
                    src={s.member_id ? s.members?.profiles?.avatar_url : undefined}
                    name={memberName(s)}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text truncate">{memberName(s)}</p>
                    <p className="text-xs text-text-dim truncate">{sponsorSubtitle(s)}</p>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-sm text-text">{formatCurrency(s.amount_pence)}</p>
                    <p className="text-[11px] text-text-dim">invest</p>
                  </div>
                  {s.event_price_pence != null && (
                    <div className="text-right shrink-0 hidden md:block">
                      <p className="text-sm text-text inline-flex items-center gap-1">
                        <Ticket size={12} className="text-text-dim" />
                        {formatCurrency(s.event_price_pence)}
                      </p>
                      <p className="text-[11px] text-text-dim">ticket</p>
                    </div>
                  )}
                  <div className="shrink-0 w-[140px]">
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

                {/* Booking link + invite actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-12">
                  <button
                    onClick={() => copyLink(s)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs text-text-muted bg-surface-2 hover:text-text hover:bg-surface-3 transition-colors"
                  >
                    <Copy size={13} /> Copy booking link
                  </button>
                  <button
                    onClick={() => {
                      setInviteFor(s)
                      setInviteTemplateId('')
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs text-gold-dark bg-gold-muted hover:bg-gold-muted/80 transition-colors"
                  >
                    <Send size={13} /> Send invite
                  </button>
                  <button
                    onClick={() =>
                      setManageFor({
                        id: s.id,
                        booking_token: s.booking_token,
                        sponsor_label: memberName(s),
                        proposal_html: s.proposal_html,
                        roi_report_html: s.roi_report_html,
                        roi_reach: s.roi_reach,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs text-text-muted bg-surface-2 hover:text-text hover:bg-surface-3 transition-colors"
                  >
                    <Settings2 size={13} /> Manage
                  </button>
                  {s.invite_sent_at && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-dim">
                      <Check size={12} className="text-[#5C8A6B]" />
                      Invited {new Date(s.invite_sent_at).toLocaleDateString('en-GB')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* ── Add sponsor modal ─────────────────────────────────────── */}
      <Modal open={open} onClose={() => setOpen(false)} title="Add sponsor" size="md">
        <div className="space-y-5">
          {/* Kind toggle */}
          <div className="flex rounded-[var(--radius-md)] border border-border p-1 bg-surface-2">
            {([
              { v: 'external', label: 'External sponsor' },
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
              <Input
                label="Sponsor name"
                placeholder="e.g. Jane Doe"
                value={sponsorName}
                onChange={(e) => setSponsorName(e.target.value)}
              />
              <Input
                label="Company"
                placeholder="e.g. Acme Capital"
                value={sponsorCompany}
                onChange={(e) => setSponsorCompany(e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                hint="Where the invite link is sent."
                placeholder="name@company.com"
                value={sponsorEmail}
                onChange={(e) => setSponsorEmail(e.target.value)}
                className="sm:col-span-2"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Package"
              placeholder="e.g. Headline, Drinks reception"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
            />
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as SponsorStatus)}
              options={STATUS_OPTIONS}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Investment (£)"
              type="number"
              min={0}
              step="0.01"
              hint="What they pay to sponsor."
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Input
              label="Their ticket price (£)"
              type="number"
              min={0}
              step="0.01"
              hint="What they pay to attend — the rate on their personalised booking link."
              value={ticket}
              onChange={(e) => setTicket(e.target.value)}
            />
          </div>

          <Input
            label="Showcase slot (optional)"
            placeholder="e.g. Main stage, Foyer table"
            value={showcaseSlot}
            onChange={(e) => setShowcaseSlot(e.target.value)}
          />
          <Textarea
            label="Brand alignment (optional)"
            hint="Why this sponsor fits the event — for the team's reference."
            rows={3}
            value={brandAlignment}
            onChange={(e) => setBrandAlignment(e.target.value)}
          />
        </div>
        <div className="-mx-6 -mb-4 mt-6 px-6 py-4 border-t border-border flex items-center justify-end gap-3 bg-surface rounded-b-[var(--radius-xl)]">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleAdd} loading={saving}>
            Add sponsor
          </Button>
        </div>
      </Modal>

      {/* ── Send invite modal ─────────────────────────────────────── */}
      <Modal
        open={!!inviteFor}
        onClose={() => setInviteFor(null)}
        title="Send sponsor invite"
        size="md"
      >
        {inviteFor && (
          <div className="space-y-5">
            <p className="text-sm text-text-muted">
              Send <strong className="text-text">{memberName(inviteFor)}</strong> their personalised
              booking link for this event. Pick a template — drop{' '}
              <code className="text-xs px-1 py-0.5 rounded bg-surface-2 text-gold-dark">
                {'{{sponsor_booking_link}}'}
              </code>{' '}
              into any template to place the link.
            </p>

            {!canEmailInvite && (
              <div className="px-3 py-2.5 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
                <p className="text-xs text-accent-warm">
                  This sponsor has no email address. Add one (edit the sponsor) or copy the link and
                  send it yourself.
                </p>
              </div>
            )}

            {templates.length === 0 ? (
              <p className="text-sm text-text-dim">
                No published email templates yet. Create one in Communications → Templates first.
              </p>
            ) : (
              <Select
                label="Email template"
                placeholder="Choose a template…"
                value={inviteTemplateId}
                onChange={(e) => setInviteTemplateId(e.target.value)}
                options={templates.map((t) => ({ value: t.id, label: t.name }))}
              />
            )}

            <div className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-text-dim mb-1">Booking link</p>
              <p className="text-xs text-text-muted break-all">{bookingLink(inviteFor)}</p>
            </div>
          </div>
        )}
        <div className="-mx-6 -mb-4 mt-6 px-6 py-4 border-t border-border flex items-center justify-end gap-3 bg-surface rounded-b-[var(--radius-xl)]">
          <Button variant="secondary" onClick={() => setInviteFor(null)} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={sendInvite}
            loading={sending}
            disabled={!inviteTemplateId || !canEmailInvite}
            icon={<Send size={14} />}
          >
            Send invite
          </Button>
        </div>
      </Modal>

      {/* ── Manage sponsor modal (checklist + proposal/ROI + portal) ─ */}
      <SponsorManageModal sponsor={manageFor} onClose={() => setManageFor(null)} />
    </Card>
  )
}
