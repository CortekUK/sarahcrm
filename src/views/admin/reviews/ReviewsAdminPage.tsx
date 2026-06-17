'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
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
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { formatDateTime, cn } from '@/lib/utils'
import {
  Quote,
  Search,
  Mail,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Archive,
  Trash2,
  CalendarDays,
  Reply,
} from 'lucide-react'
import type { Database } from '@/types/database'

type ReviewRow = Database['public']['Tables']['reviews']['Row']
type ReviewStatus = 'pending' | 'approved' | 'rejected'

// Reviews public surface lives at /reviews. Flushing it on any
// approval/rejection/active-toggle so admin sees their moderation
// take effect immediately rather than after the 60s ISR window.
function flushReviewsPage() {
  void fetch('/api/admin/revalidate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths: ['/reviews'] }),
  }).catch(() => {})
}

const STATUS_OPTIONS: { value: ReviewStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const statusBadge: Record<ReviewStatus, 'active' | 'upcoming' | 'urgent' | 'draft'> = {
  pending: 'upcoming',
  approved: 'active',
  rejected: 'urgent',
}

interface EventLite {
  title: string | null
}

interface ReviewWithEvent extends ReviewRow {
  events: EventLite | null
}

function fullName(r: Pick<ReviewRow, 'first_name' | 'last_name'>) {
  return `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown'
}

export function ReviewsAdminPage() {
  const confirm = useConfirm()
  const [rows, setRows] = useState<ReviewWithEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ReviewWithEvent | null>(null)

  useEffect(() => {
    fetchRows()
  }, [])

  async function fetchRows() {
    setLoading(true)
    const { data, error } = await supabase
      .from('reviews')
      .select('*, events(title)')
      .order('created_at', { ascending: false })
    if (error) {
      toast({ title: 'Failed to load reviews', description: error.message, variant: 'destructive' })
    } else {
      setRows((data ?? []) as unknown as ReviewWithEvent[])
    }
    setLoading(false)
  }

  const counts = useMemo(
    () => ({
      total: rows.length,
      pending: rows.filter((r) => r.status === 'pending').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
    }),
    [rows],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!term) return true
      const name = fullName(r).toLowerCase()
      return (
        name.includes(term) ||
        (r.email ?? '').toLowerCase().includes(term) ||
        (r.company ?? '').toLowerCase().includes(term) ||
        (r.body ?? '').toLowerCase().includes(term)
      )
    })
  }, [rows, search, statusFilter])

  async function updateStatus(id: string, next: ReviewStatus) {
    const now = new Date().toISOString()
    const patch: Partial<ReviewRow> = {
      status: next,
      reviewed_at: now,
      ...(next === 'approved' ? { approved_at: now, is_active: true } : {}),
    }
    const { error } = await supabase.from('reviews').update(patch).eq('id', id)
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' })
      return
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setSelected((prev) => (prev?.id === id ? { ...prev, ...patch } : prev))
    flushReviewsPage()
    toast({
      title:
        next === 'approved'
          ? 'Review approved & published'
          : next === 'rejected'
            ? 'Review rejected'
            : 'Returned to pending',
    })
  }

  async function toggleActive(review: ReviewWithEvent, next: boolean) {
    setRows((prev) => prev.map((r) => (r.id === review.id ? { ...r, is_active: next } : r)))
    setSelected((prev) => (prev?.id === review.id ? { ...prev, is_active: next } : prev))
    const { error } = await supabase
      .from('reviews')
      .update({ is_active: next })
      .eq('id', review.id)
    if (error) {
      setRows((prev) =>
        prev.map((r) => (r.id === review.id ? { ...r, is_active: !next } : r)),
      )
      toast({ title: 'Failed', description: error.message, variant: 'destructive' })
      return
    }
    flushReviewsPage()
  }

  async function saveNotes(id: string, notes: string) {
    const { error } = await supabase
      .from('reviews')
      .update({ admin_notes: notes })
      .eq('id', id)
    if (error) {
      toast({ title: 'Could not save notes', description: error.message, variant: 'destructive' })
      return
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, admin_notes: notes } : r)))
    setSelected((prev) => (prev?.id === id ? { ...prev, admin_notes: notes } : prev))
  }

  async function handleDelete(review: ReviewWithEvent) {
    const ok = await confirm({
      title: 'Delete this review?',
      description:
        'The review is permanently removed. To hide without deleting, switch it to inactive instead.',
      tone: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    const { error } = await supabase.from('reviews').delete().eq('id', review.id)
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' })
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== review.id))
    setSelected(null)
    flushReviewsPage()
    toast({ title: 'Review deleted' })
  }

  function buildMailto(review: ReviewWithEvent): string {
    const subject = `Re: Your review of The Club`
    const greeting = `Hi ${review.first_name ?? 'there'},\n\nThank you for sharing your review — `
    const quoted =
      `\n\n— — —\nOn ${formatDateTime(review.created_at)} you wrote:\n` +
      review.body
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')
    const body = `${greeting}\n\nWith warmth,\nThe Club by Sarah Restrick${quoted}`
    const params = new URLSearchParams({ subject, body })
    return `mailto:${review.email}?${params.toString().replace(/\+/g, '%20')}`
  }

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Reviews"
        description="Member and guest reviews submitted via /share-your-experience. Approve to publish to the public /reviews page. The active toggle hides an approved review without rejecting it (e.g. while you ask the reviewer about a photo or detail)."
        meta={
          <span className="text-xs text-text-dim">
            {counts.total} total · {counts.pending} pending · {counts.approved} approved
          </span>
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile label="Total" value={counts.total} icon={<Quote size={14} />} tone="neutral" />
        <StatTile
          label="Pending"
          value={counts.pending}
          icon={<Clock size={14} />}
          tone={counts.pending > 0 ? 'warn' : 'neutral'}
        />
        <StatTile
          label="Approved"
          value={counts.approved}
          icon={<CheckCircle2 size={14} />}
          tone="success"
        />
        <StatTile
          label="Rejected"
          value={counts.rejected}
          icon={<XCircle size={14} />}
          tone="neutral"
        />
      </div>

      {/* Filters */}
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
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-text-dim">Loading…</div>
          ) : filtered.length === 0 ? (
            <AdminEmptyState
              icon={Quote}
              title={statusFilter === 'pending' ? 'No reviews waiting' : 'No reviews match'}
              description={
                statusFilter === 'pending'
                  ? 'When someone submits via /share-your-experience their review will appear here.'
                  : 'Try a different filter or clear your search.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>From</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const eventTitle = r.events?.title ?? null
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(r)}
                    >
                      <TableCell>
                        <p className="font-medium text-text">{fullName(r)}</p>
                        <p className="text-xs text-text-dim truncate max-w-[220px]">
                          {r.email}
                          {r.company ? ` · ${r.company}` : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        {eventTitle ? (
                          <span className="text-text-muted text-xs">{eventTitle}</span>
                        ) : (
                          <span className="text-text-dim text-xs italic">General</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[360px]">
                        <p className="text-sm text-text-muted truncate">{r.body}</p>
                      </TableCell>
                      <TableCell className="text-text-muted text-xs whitespace-nowrap">
                        {formatDateTime(r.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusBadge[(r.status as ReviewStatus) ?? 'pending']}
                          dot
                          className="capitalize"
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <ActiveToggle
                          active={r.is_active}
                          onChange={(next) => toggleActive(r, next)}
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

      {selected && (
        <ReviewDetailModal
          review={selected}
          onClose={() => setSelected(null)}
          onStatusChange={(next) => updateStatus(selected.id, next)}
          onActiveToggle={(next) => toggleActive(selected, next)}
          onNotesChange={(notes) => saveNotes(selected.id, notes)}
          onReply={() => window.open(buildMailto(selected), '_blank')}
          onDelete={() => handleDelete(selected)}
        />
      )}
    </div>
  )
}

// ─── Detail modal ────────────────────────────────────────────────

function ReviewDetailModal({
  review,
  onClose,
  onStatusChange,
  onActiveToggle,
  onNotesChange,
  onReply,
  onDelete,
}: {
  review: ReviewWithEvent
  onClose: () => void
  onStatusChange: (next: ReviewStatus) => void
  onActiveToggle: (next: boolean) => void
  onNotesChange: (notes: string) => void
  onReply: () => void
  onDelete: () => void
}) {
  const [notes, setNotes] = useState(review.admin_notes ?? '')
  const status = (review.status as ReviewStatus) ?? 'pending'

  useEffect(() => {
    if (notes === (review.admin_notes ?? '')) return
    const t = setTimeout(() => onNotesChange(notes), 700)
    return () => clearTimeout(t)
  }, [notes, review.admin_notes, onNotesChange])

  const eventTitle = review.events?.title ?? null

  return (
    <Modal open onClose={onClose} title={fullName(review)} size="xl">
      <div className="space-y-6">
        {/* Top row: status badges + meta */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={statusBadge[status]} dot className="capitalize">
              {status}
            </Badge>
            {status === 'approved' && (
              <Badge variant={review.is_active ? 'active' : 'draft'} dot>
                {review.is_active ? 'live' : 'hidden'}
              </Badge>
            )}
            {eventTitle && (
              <Badge variant="info">
                <CalendarDays size={10} className="mr-1" />
                {eventTitle}
              </Badge>
            )}
          </div>
          <p className="text-xs text-text-dim">{formatDateTime(review.created_at)}</p>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ContactBlock icon={<Mail size={13} />} label="Email">
            <a
              href={`mailto:${review.email}`}
              className="text-text hover:text-gold transition-colors"
            >
              {review.email}
            </a>
          </ContactBlock>
          {review.company && (
            <ContactBlock icon={<Building2 size={13} />} label="Company">
              <span className="text-text">
                {review.title ? `${review.title}, ` : ''}
                {review.company}
              </span>
            </ContactBlock>
          )}
        </div>

        {/* Review body */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted mb-2">
            The review
          </p>
          <div className="bg-surface-2 border border-border rounded-md p-4 text-sm text-text whitespace-pre-wrap leading-relaxed">
            {review.body}
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

        {/* Moderation trail */}
        {(review.approved_at || review.reviewed_at) && (
          <div className="text-xs text-text-dim space-y-1">
            {review.approved_at && (
              <p>
                Approved <span className="text-text-muted">{formatDateTime(review.approved_at)}</span>
              </p>
            )}
            {review.reviewed_at && review.reviewed_at !== review.approved_at && (
              <p>
                Reviewed <span className="text-text-muted">{formatDateTime(review.reviewed_at)}</span>
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          {status !== 'approved' && (
            <Button onClick={() => onStatusChange('approved')}>
              <CheckCircle2 size={14} />
              Approve &amp; publish
            </Button>
          )}
          {status !== 'rejected' && (
            <Button variant="secondary" onClick={() => onStatusChange('rejected')}>
              <XCircle size={14} />
              Reject
            </Button>
          )}
          {status === 'approved' && (
            <Button variant="secondary" onClick={() => onActiveToggle(!review.is_active)}>
              <Archive size={14} />
              {review.is_active ? 'Hide from public' : 'Show on public'}
            </Button>
          )}
          {status !== 'pending' && (
            <Button variant="ghost" onClick={() => onStatusChange('pending')}>
              Return to pending
            </Button>
          )}
          <Button variant="ghost" onClick={onReply}>
            <Reply size={14} />
            Reply via email
          </Button>
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

// ─── StatTile ─────────────────────────────────────────────────────

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
