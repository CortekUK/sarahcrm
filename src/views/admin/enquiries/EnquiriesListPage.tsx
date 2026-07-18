'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Textarea } from '@/components/ui/Textarea'
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
import { formatDateTime, cn } from '@/lib/utils'
import { toast } from '@/lib/hooks/use-toast'
import {
  Inbox,
  Search,
  Mail,
  Phone,
  Building2,
  Reply,
  Clock,
  Check,
  Archive,
  Trash2,
  Tag,
  ListTodo,
  Gauge,
  Sparkles,
  Users,
  TrendingUp,
  ExternalLink,
  Briefcase,
} from 'lucide-react'
import type { Database } from '@/types/database'

type EnquiryRow = Database['public']['Tables']['enquiries']['Row']
type EnquiryStatus = 'new' | 'replied' | 'closed'

interface AdminProfile {
  id: string
  first_name: string | null
  last_name: string | null
}

function personName(p: AdminProfile | undefined): string {
  if (!p) return 'Unassigned'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed'
}

// Readable labels for the stored `source` slugs the intake route writes.
const SOURCE_LABELS: Record<string, string> = {
  contact_form: 'Contact form',
  concierge_form: 'Concierge',
  website: 'Website',
}

const STATUS_OPTIONS: { value: EnquiryStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'replied', label: 'Replied' },
  { value: 'closed', label: 'Closed' },
]

const statusBadge: Record<EnquiryStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  new: 'upcoming',
  replied: 'active',
  closed: 'draft',
}

// Mirrors the public form's SUBJECT_OPTIONS — kept here so the admin
// view can render proper labels for the stored slugs without having to
// import the public form file.
const INTENT_LABELS: Record<string, string> = {
  general: 'General enquiry',
  membership: 'Membership',
  event: 'Upcoming event',
  private_event: 'Private event',
  concierge: 'Concierge',
  sponsorship: 'Sponsorship',
  venue: 'Venue / space hire',
  press: 'Press / media',
}

function fullName(e: Pick<EnquiryRow, 'first_name' | 'last_name'>): string {
  return `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || 'Unknown'
}

export function EnquiriesListPage() {
  const confirm = useConfirm()
  const [enquiries, setEnquiries] = useState<EnquiryRow[]>([])
  const [admins, setAdmins] = useState<AdminProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<EnquiryStatus | 'all'>('new')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<EnquiryRow | null>(null)
  const [composing, setComposing] = useState<EnquiryRow | null>(null)

  useEffect(() => {
    fetchEnquiries()
  }, [])

  async function fetchEnquiries() {
    setLoading(true)
    // Load enquiries + the admin roster (owners) together — same pattern
    // TasksPage uses to populate its owner dropdown.
    const [enquiriesRes, adminsRes] = await Promise.all([
      supabase.from('enquiries').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, first_name, last_name').eq('role', 'admin'),
    ])
    if (enquiriesRes.error) {
      toast({
        title: 'Failed to load enquiries',
        description: enquiriesRes.error.message,
        variant: 'destructive',
      })
    } else if (enquiriesRes.data) {
      setEnquiries(enquiriesRes.data as EnquiryRow[])
    }
    if (adminsRes.data) setAdmins(adminsRes.data as AdminProfile[])
    setLoading(false)
  }

  async function updateOwner(id: string, ownerId: string | null) {
    // optimistic
    setEnquiries((prev) => prev.map((e) => (e.id === id ? { ...e, assigned_to: ownerId } : e)))
    setSelected((prev) => (prev?.id === id ? { ...prev, assigned_to: ownerId } : prev))
    const { error } = await supabase
      .from('enquiries')
      .update({ assigned_to: ownerId })
      .eq('id', id)
    if (error) {
      toast({ title: 'Could not reassign', description: error.message, variant: 'destructive' })
      fetchEnquiries()
      return
    }
    toast({ title: ownerId ? 'Owner updated' : 'Unassigned' })
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return enquiries.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      if (ownerFilter === 'unassigned' && e.assigned_to) return false
      if (ownerFilter !== 'all' && ownerFilter !== 'unassigned' && e.assigned_to !== ownerFilter)
        return false
      if (!term) return true
      const name = fullName(e).toLowerCase()
      return (
        name.includes(term) ||
        (e.email ?? '').toLowerCase().includes(term) ||
        (e.company ?? '').toLowerCase().includes(term) ||
        (e.message ?? '').toLowerCase().includes(term)
      )
    })
  }, [enquiries, statusFilter, ownerFilter, search])

  const counts = useMemo(
    () => ({
      total: enquiries.length,
      new: enquiries.filter((e) => e.status === 'new').length,
      replied: enquiries.filter((e) => e.status === 'replied').length,
      closed: enquiries.filter((e) => e.status === 'closed').length,
    }),
    [enquiries],
  )

  async function updateStatus(id: string, next: EnquiryStatus) {
    const patch: Partial<EnquiryRow> = {
      status: next,
      reviewed_at: new Date().toISOString(),
    }
    if (next === 'replied') patch.replied_at = new Date().toISOString()
    const { error } = await supabase.from('enquiries').update(patch).eq('id', id)
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' })
      return
    }
    setEnquiries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    setSelected((prev) => (prev?.id === id ? { ...prev, ...patch } : prev))
    toast({
      title:
        next === 'replied'
          ? 'Marked as replied'
          : next === 'closed'
            ? 'Closed'
            : 'Reopened',
    })
  }

  async function saveNotes(id: string, notes: string) {
    const { error } = await supabase
      .from('enquiries')
      .update({ admin_notes: notes })
      .eq('id', id)
    if (error) {
      toast({ title: 'Could not save notes', description: error.message, variant: 'destructive' })
      return
    }
    setEnquiries((prev) => prev.map((e) => (e.id === id ? { ...e, admin_notes: notes } : e)))
    setSelected((prev) => (prev?.id === id ? { ...prev, admin_notes: notes } : prev))
  }

  async function handleDelete(enquiry: EnquiryRow) {
    const ok = await confirm({
      title: 'Delete this enquiry?',
      description: 'The original message will be removed permanently. This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    const { error } = await supabase.from('enquiries').delete().eq('id', enquiry.id)
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' })
      return
    }
    setEnquiries((prev) => prev.filter((e) => e.id !== enquiry.id))
    setSelected(null)
    toast({ title: 'Enquiry deleted' })
  }

  // Run (or re-run) enrichment for one enquiry via the admin route. On success
  // refetch just that row so the freshly-written enrichment fields show up.
  async function runEnrich(id: string): Promise<void> {
    try {
      const res = await fetch('/api/admin/enquiries/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiryId: id }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        status?: string
        error?: string
      }
      if (!res.ok || !json.ok) {
        toast({
          title: 'Enrichment failed',
          description: json.error ?? 'Please try again.',
          variant: 'destructive',
        })
        return
      }
      // Pull the updated row back so all enrichment_* fields refresh.
      const { data } = await supabase.from('enquiries').select('*').eq('id', id).single()
      if (data) {
        const row = data as EnquiryRow
        setEnquiries((prev) => prev.map((e) => (e.id === id ? row : e)))
        setSelected((prev) => (prev?.id === id ? row : prev))
      }
      toast({ title: 'Enrichment complete', description: `Status: ${json.status ?? 'done'}.` })
    } catch (e) {
      toast({
        title: 'Enrichment failed',
        description: e instanceof Error ? e.message : 'Network error.',
        variant: 'destructive',
      })
    }
  }

  // When a reply is sent through the in-app composer, reflect it locally
  // (mark replied + stamp the time) so the inbox updates without a reload.
  function handleReplySent(id: string, repliedAt: string) {
    setEnquiries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'replied', replied_at: repliedAt } : e)),
    )
    setSelected((prev) =>
      prev?.id === id ? { ...prev, status: 'replied', replied_at: repliedAt } : prev,
    )
  }

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Enquiries"
        description="Notes from the public contact form. Read the brief, reply from your own email client — the row is marked replied automatically — and keep a private note for context."
        meta={
          <span className="text-xs text-text-dim">
            {counts.total} total · {counts.new} new · {counts.replied} replied
          </span>
        }
      />

      {/* ── Stat tiles ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile label="Total" value={counts.total} icon={<Inbox size={14} />} tone="neutral" />
        <StatTile
          label="New"
          value={counts.new}
          icon={<Clock size={14} />}
          tone={counts.new > 0 ? 'warn' : 'neutral'}
        />
        <StatTile label="Replied" value={counts.replied} icon={<Check size={14} />} tone="success" />
        <StatTile label="Closed" value={counts.closed} icon={<Archive size={14} />} tone="neutral" />
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="relative md:max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, company, message…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md border transition-colors',
                statusFilter === opt.value
                  ? 'bg-gold-muted text-gold border-gold/40'
                  : 'border-border text-text-muted hover:text-text hover:bg-surface-2',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="sm:w-52">
          <SelectMenu
            ariaLabel="Filter by owner"
            value={ownerFilter}
            onValueChange={setOwnerFilter}
            options={[
              { value: 'all', label: 'All owners' },
              { value: 'unassigned', label: 'Unassigned' },
              ...admins.map((a) => ({ value: a.id, label: personName(a) })),
            ]}
          />
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-text-dim">Loading…</div>
          ) : filtered.length === 0 ? (
            <AdminEmptyState
              icon={Inbox}
              title={statusFilter === 'new' ? 'No new enquiries' : 'No enquiries match'}
              description={
                statusFilter === 'new'
                  ? 'When someone submits the public contact form their note will appear here.'
                  : 'Try a different filter or clear your search.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>From</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => {
                  const name = fullName(e)
                  const intent = e.intent?.[0]
                  return (
                    <TableRow
                      key={e.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(e)}
                    >
                      <TableCell>
                        <p className="font-medium text-text flex items-center gap-1.5">
                          {name}
                          {e.related_task_id && (
                            <Link
                              href="/dashboard/tasks"
                              onClick={(ev) => ev.stopPropagation()}
                              title="Sales follow-up task created"
                              className="text-gold hover:text-gold/80"
                            >
                              <ListTodo size={13} />
                            </Link>
                          )}
                        </p>
                        <p className="text-xs text-text-dim truncate max-w-[220px]">
                          {e.email}
                          {e.company ? ` · ${e.company}` : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        {intent ? (
                          <Badge variant="info" className="whitespace-nowrap">
                            {INTENT_LABELS[intent] ?? intent}
                          </Badge>
                        ) : (
                          <span className="text-text-dim text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ScoreMeter score={e.lead_score} />
                      </TableCell>
                      <TableCell className="text-text-muted text-xs whitespace-nowrap">
                        {e.source ? (SOURCE_LABELS[e.source] ?? e.source) : '—'}
                      </TableCell>
                      {/* Owner dropdown — stop the row click from opening the modal */}
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        <SelectMenu
                          size="sm"
                          ariaLabel="Assign owner"
                          value={e.assigned_to ?? 'none'}
                          onValueChange={(v) => updateOwner(e.id, v === 'none' ? null : v)}
                          options={[
                            { value: 'none', label: 'Unassigned' },
                            ...admins.map((a) => ({ value: a.id, label: personName(a) })),
                          ]}
                          className="w-40"
                        />
                      </TableCell>
                      <TableCell className="text-text-muted text-xs whitespace-nowrap">
                        {formatDateTime(e.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusBadge[(e.status as EnquiryStatus) ?? 'new']}
                          dot
                          className="capitalize"
                        >
                          {e.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected && (
        <EnquiryDetailModal
          enquiry={selected}
          onClose={() => setSelected(null)}
          onStatusChange={(next) => updateStatus(selected.id, next)}
          onNotesChange={(notes) => saveNotes(selected.id, notes)}
          onReply={() => setComposing(selected)}
          onDelete={() => handleDelete(selected)}
          onEnrich={() => runEnrich(selected.id)}
        />
      )}

      {composing && (
        <ReplyComposeModal
          enquiry={composing}
          onClose={() => setComposing(null)}
          onSent={(repliedAt) => {
            handleReplySent(composing.id, repliedAt)
            setComposing(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Reply composer ────────────────────────────────────────────────
// In-app reply sent through the branded Resend pipeline (no external
// mail client). Pre-filled with a sensible subject and a warm greeting.

function ReplyComposeModal({
  enquiry,
  onClose,
  onSent,
}: {
  enquiry: EnquiryRow
  onClose: () => void
  onSent: (repliedAt: string) => void
}) {
  const [subject, setSubject] = useState('Re: Your enquiry to The Club')
  const [body, setBody] = useState(
    `Hi ${enquiry.first_name ?? 'there'},\n\nThank you for reaching out — `,
  )
  const [sending, setSending] = useState(false)

  async function send() {
    if (!subject.trim() || !body.trim()) {
      toast({ title: 'Subject and message are required', variant: 'destructive' })
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/admin/enquiries/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiry_id: enquiry.id, subject, body }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        warning?: string
        replied_at?: string
      }
      if (!res.ok || !json.ok) {
        toast({
          title: 'Could not send reply',
          description: json.error ?? 'Please try again.',
          variant: 'destructive',
        })
        return
      }
      toast({
        title: 'Reply sent',
        description: json.warning ?? `Emailed ${enquiry.email}.`,
      })
      onSent(json.replied_at ?? new Date().toISOString())
    } catch (e) {
      toast({
        title: 'Could not send reply',
        description: e instanceof Error ? e.message : 'Network error.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Reply via email" size="lg">
      <div className="space-y-4">
        <div className="border border-border rounded-md px-3 py-2.5 bg-surface-2/40">
          <div className="flex items-center gap-1.5 text-text-muted mb-1">
            <Mail size={13} />
            <span className="text-[10px] font-medium uppercase tracking-[0.16em]">To</span>
          </div>
          <p className="text-sm text-text">
            {fullName(enquiry)} · {enquiry.email}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted mb-2">
            Subject
          </p>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted mb-2">
            Message
          </p>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Write your reply — it's sent as a branded Club email."
          />
          <p className="text-xs text-text-dim mt-1.5">
            Sent through The Club&apos;s branded email. The enquiry is marked replied on send.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending}>
            <Reply size={14} />
            {sending ? 'Sending…' : 'Send reply'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Detail modal ──────────────────────────────────────────────────

function EnquiryDetailModal({
  enquiry,
  onClose,
  onStatusChange,
  onNotesChange,
  onReply,
  onDelete,
  onEnrich,
}: {
  enquiry: EnquiryRow
  onClose: () => void
  onStatusChange: (next: EnquiryStatus) => void
  onNotesChange: (notes: string) => void
  onReply: () => void
  onDelete: () => void
  onEnrich: () => Promise<void>
}) {
  const [notes, setNotes] = useState(enquiry.admin_notes ?? '')
  const [enriching, setEnriching] = useState(false)
  const status = (enquiry.status as EnquiryStatus) ?? 'new'

  async function handleEnrich() {
    setEnriching(true)
    try {
      await onEnrich()
    } finally {
      setEnriching(false)
    }
  }

  // Persist notes ~700ms after the admin stops typing.
  useEffect(() => {
    if (notes === (enquiry.admin_notes ?? '')) return
    const t = setTimeout(() => onNotesChange(notes), 700)
    return () => clearTimeout(t)
  }, [notes, enquiry.admin_notes, onNotesChange])

  const intent = enquiry.intent?.[0]
  const name = fullName(enquiry)

  return (
    <Modal open onClose={onClose} title={name} size="xl">
      <div className="space-y-6">
        {/* Top row: status + meta */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={statusBadge[status]} dot className="capitalize">
              {status}
            </Badge>
            {intent && (
              <Badge variant="info">
                <Tag size={10} className="mr-1" />
                {INTENT_LABELS[intent] ?? intent}
              </Badge>
            )}
          </div>
          <p className="text-xs text-text-dim">{formatDateTime(enquiry.created_at)}</p>
        </div>

        {/* Contact details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ContactBlock icon={<Mail size={13} />} label="Email">
            <a
              href={`mailto:${enquiry.email}`}
              className="text-text hover:text-gold transition-colors"
            >
              {enquiry.email}
            </a>
          </ContactBlock>
          {enquiry.phone && (
            <ContactBlock icon={<Phone size={13} />} label="Phone">
              <a
                href={`tel:${enquiry.phone}`}
                className="text-text hover:text-gold transition-colors"
              >
                {enquiry.phone}
              </a>
            </ContactBlock>
          )}
          {enquiry.company && (
            <ContactBlock icon={<Building2 size={13} />} label="Company">
              <span className="text-text">{enquiry.company}</span>
            </ContactBlock>
          )}
        </div>

        {/* Lead score + routing */}
        {typeof enquiry.lead_score === 'number' && (
          <div className="border border-border rounded-md px-4 py-3 bg-surface-2/40">
            <div className="flex items-center gap-1.5 text-text-muted mb-2.5">
              <Gauge size={13} />
              <span className="text-[10px] font-medium uppercase tracking-[0.16em]">
                Lead score
              </span>
              {enquiry.source && (
                <span className="ml-auto text-[11px] text-text-dim">
                  via {SOURCE_LABELS[enquiry.source] ?? enquiry.source}
                </span>
              )}
            </div>
            <ScoreMeter score={enquiry.lead_score} />
            {Array.isArray(enquiry.score_reasons) && enquiry.score_reasons.length > 0 && (
              <ul className="mt-3 space-y-1">
                {(enquiry.score_reasons as string[]).map((r, i) => (
                  <li key={i} className="text-xs text-text-muted flex items-start gap-1.5">
                    <span className="text-gold mt-0.5">·</span>
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Company / person enrichment */}
        <EnrichmentPanel
          enquiry={enquiry}
          enriching={enriching}
          onEnrich={handleEnrich}
        />

        {/* Message */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted mb-2">
            Their message
          </p>
          <div className="bg-surface-2 border border-border rounded-md p-4 text-sm text-text whitespace-pre-wrap leading-relaxed">
            {enquiry.message}
          </div>
        </div>

        {/* Admin notes */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted mb-2">
            Private notes
          </p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal context — only visible to the team."
            rows={3}
          />
        </div>

        {/* Reply timestamps */}
        {(enquiry.replied_at || enquiry.reviewed_at) && (
          <div className="text-xs text-text-dim space-y-1">
            {enquiry.replied_at && (
              <p>
                Replied <span className="text-text-muted">{formatDateTime(enquiry.replied_at)}</span>
              </p>
            )}
            {enquiry.reviewed_at && enquiry.reviewed_at !== enquiry.replied_at && (
              <p>
                Reviewed <span className="text-text-muted">{formatDateTime(enquiry.reviewed_at)}</span>
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <Button onClick={onReply}>
            <Reply size={14} />
            Reply via email
          </Button>
          {status !== 'replied' && (
            <Button variant="secondary" onClick={() => onStatusChange('replied')}>
              <Check size={14} />
              Mark replied
            </Button>
          )}
          {status !== 'closed' && (
            <Button variant="secondary" onClick={() => onStatusChange('closed')}>
              <Archive size={14} />
              Close
            </Button>
          )}
          {status !== 'new' && (
            <Button variant="ghost" onClick={() => onStatusChange('new')}>
              Reopen
            </Button>
          )}
          <div className="ml-auto">
            <Button variant="ghost" onClick={onDelete}>
              <Trash2 size={14} className="text-accent-warm" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Enrichment panel — Apollo (or any provider) company + person data ──

const ENRICHMENT_LABELS: Record<string, string> = {
  enriched: 'Enriched',
  partial: 'Company found',
  no_domain: 'No business domain',
  not_found: 'Not found',
  failed: 'Enrichment failed',
}

const ENRICHMENT_BADGE: Record<string, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  enriched: 'active',
  partial: 'info',
  no_domain: 'draft',
  not_found: 'draft',
  failed: 'urgent',
}

function EnrichmentPanel({
  enquiry,
  enriching,
  onEnrich,
}: {
  enquiry: EnquiryRow
  enriching: boolean
  onEnrich: () => void
}) {
  const hasCompany =
    !!enquiry.company_website ||
    !!enquiry.company_industry ||
    !!enquiry.company_linkedin_url ||
    enquiry.company_employee_count != null ||
    !!enquiry.company_revenue_printed
  const hasPerson =
    !!enquiry.person_title || !!enquiry.person_seniority || !!enquiry.person_linkedin_url
  const st = enquiry.enrichment_status

  return (
    <div className="border border-border rounded-md px-4 py-3 bg-surface-2/40">
      <div className="flex items-center gap-1.5 text-text-muted mb-3">
        <Sparkles size={13} />
        <span className="text-[10px] font-medium uppercase tracking-[0.16em]">
          Lead enrichment
        </span>
        {st && (
          <Badge variant={ENRICHMENT_BADGE[st] ?? 'info'} className="ml-1 capitalize">
            {ENRICHMENT_LABELS[st] ?? st}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          {enquiry.enriched_at && (
            <span className="text-[11px] text-text-dim">
              {enquiry.enrichment_source ? `${enquiry.enrichment_source} · ` : ''}
              {formatDateTime(enquiry.enriched_at)}
            </span>
          )}
          <Button size="sm" variant="secondary" onClick={onEnrich} disabled={enriching}>
            <Sparkles size={13} />
            {enriching ? 'Enriching…' : enquiry.enriched_at ? 'Re-enrich' : 'Enrich'}
          </Button>
        </div>
      </div>

      {!hasCompany && !hasPerson ? (
        <p className="text-xs text-text-dim">
          {st === 'no_domain'
            ? 'A personal/free email — no company domain to enrich against.'
            : st
              ? 'No enrichment data was found.'
              : 'Not yet enriched. Run enrichment to pull company and person details.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {enquiry.company_industry && (
            <EnrichFact icon={<Building2 size={12} />} label="Industry" value={enquiry.company_industry} />
          )}
          {enquiry.company_employee_count != null && (
            <EnrichFact
              icon={<Users size={12} />}
              label="Employees"
              value={enquiry.company_employee_count.toLocaleString()}
            />
          )}
          {enquiry.company_revenue_printed && (
            <EnrichFact
              icon={<TrendingUp size={12} />}
              label="Est. revenue"
              value={`$${enquiry.company_revenue_printed}`}
            />
          )}
          {(enquiry.person_seniority || enquiry.person_title) && (
            <EnrichFact
              icon={<Briefcase size={12} />}
              label="Seniority"
              value={
                [enquiry.person_title, enquiry.person_seniority]
                  .filter(Boolean)
                  .join(' · ') || '—'
              }
            />
          )}
          {(enquiry.company_website || enquiry.company_linkedin_url || enquiry.person_linkedin_url) && (
            <div className="md:col-span-2 flex flex-wrap items-center gap-3 pt-1">
              {enquiry.company_website && (
                <EnrichLink href={enquiry.company_website} label="Website" />
              )}
              {enquiry.company_linkedin_url && (
                <EnrichLink href={enquiry.company_linkedin_url} label="Company LinkedIn" />
              )}
              {enquiry.person_linkedin_url && (
                <EnrichLink href={enquiry.person_linkedin_url} label="Person LinkedIn" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EnrichFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-text-muted">{icon}</span>
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted">
        {label}
      </span>
      <span className="text-text ml-auto">{value}</span>
    </div>
  )
}

function EnrichLink({ href, label }: { href: string; label: string }) {
  const url = href.startsWith('http') ? href : `https://${href}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-gold hover:text-gold/80 transition-colors"
    >
      {label}
      <ExternalLink size={11} />
    </a>
  )
}

function ContactBlock({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-border rounded-md px-3 py-2.5 bg-surface-2/40">
      <div className="flex items-center gap-1.5 text-text-muted mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-[0.16em]">{label}</span>
      </div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

// ─── ScoreMeter — compact colour-scaled lead-score readout ───────────
// >=70 hot (gold) · 40–69 warm (blue) · <70 cool (dim). Number + mini bar.

function scoreTone(score: number): { text: string; bar: string } {
  if (score >= 70) return { text: 'text-gold', bar: 'bg-gold' }
  if (score >= 40) return { text: 'text-accent-blue', bar: 'bg-accent-blue' }
  return { text: 'text-text-dim', bar: 'bg-text-dim' }
}

function ScoreMeter({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="text-text-dim text-xs">—</span>
  }
  const tone = scoreTone(score)
  return (
    <div className="flex items-center gap-2 min-w-[76px]">
      <span
        className={cn(
          'font-[family-name:var(--font-label)] text-xs font-semibold tabular-nums w-6',
          tone.text,
        )}
      >
        {score}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={cn('h-full rounded-full', tone.bar)}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  )
}

// ─── StatTile (local copy — matches the pattern used across admin pages) ──

function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  tone?: 'neutral' | 'success' | 'warn'
}) {
  const toneClass = {
    neutral: 'text-text-muted',
    success: 'text-accent',
    warn: 'text-gold',
  }[tone]
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-1.5">
          <span className={toneClass}>{icon}</span>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
            {label}
          </p>
        </div>
        <p className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-semibold text-text mt-2">
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
