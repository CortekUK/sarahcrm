'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { formatDate } from '@/lib/utils'
import { Plus, Search, Inbox } from 'lucide-react'
import { CreateIntroductionModal } from './CreateIntroductionModal'
import { IntroComposeModal, type ComposeMember } from './IntroComposeModal'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/lib/hooks/use-toast'
import type { Database } from '@/types/database'

type IntroStatus = Database['public']['Enums']['intro_status']
type IntroResponse = Database['public']['Enums']['intro_response']

interface IntroRow {
  id: string
  status: IntroStatus
  match_score: number | null
  match_reason: string | null
  suggested_at: string
  event_id: string | null
  requested_by: string | null
  member_a_id: string
  member_b_id: string
  member_a_response: IntroResponse
  member_b_response: IntroResponse
  member_a: {
    profiles: {
      first_name: string | null
      last_name: string | null
      company_name: string | null
    }
  }
  member_b: {
    profiles: {
      first_name: string | null
      last_name: string | null
      company_name: string | null
    }
  }
  events: { title: string } | null
}

const introStatusBadge: Record<IntroStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  suggested: 'draft',
  approved: 'upcoming',
  sent: 'info',
  scheduled: 'upcoming',
  accepted: 'active',
  completed: 'active',
  declined: 'urgent',
}

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'suggested', label: 'Suggested' },
  { value: 'approved', label: 'Approved' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'completed', label: 'Completed' },
  { value: 'declined', label: 'Declined' },
]

function memberName(profiles: { first_name: string | null; last_name: string | null } | null): string {
  if (!profiles) return 'Unknown'
  return `${profiles.first_name ?? ''} ${profiles.last_name ?? ''}`.trim() || 'Unnamed'
}

function responseLabel(r: IntroResponse): string {
  return r === 'accepted' ? 'accepted' : r === 'declined' ? 'declined' : 'pending'
}

export function IntroductionsListPage() {
  const router = useRouter()
  const [intros, setIntros] = useState<IntroRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Approve flow → compose & send
  const [compose, setCompose] = useState<{
    introId: string
    a: ComposeMember
    b: ComposeMember
    matchReason: string | null
  } | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  // Reject flow
  const [rejecting, setRejecting] = useState<IntroRow | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectNotify, setRejectNotify] = useState(true)
  const [rejectMessage, setRejectMessage] = useState('')
  const [rejectSubmitting, setRejectSubmitting] = useState(false)

  useEffect(() => {
    fetchIntros()
  }, [])

  // Member-initiated requests awaiting Sarah's decision.
  const requests = useMemo(
    () => intros.filter((i) => i.status === 'suggested' && i.requested_by),
    [intros],
  )

  function requesterAndOther(intro: IntroRow) {
    const aIsRequester = intro.requested_by === intro.member_a_id
    const requester = aIsRequester ? intro.member_a : intro.member_b
    const other = aIsRequester ? intro.member_b : intro.member_a
    const requesterId = aIsRequester ? intro.member_a_id : intro.member_b_id
    const otherId = aIsRequester ? intro.member_b_id : intro.member_a_id
    return { requester, other, requesterId, otherId }
  }

  async function approveRequest(intro: IntroRow) {
    setApprovingId(intro.id)
    try {
      const res = await fetch('/api/admin/introductions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ introduction_id: intro.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not approve', description: json.error, variant: 'destructive' })
        return
      }
      setCompose({
        introId: json.introduction_id,
        a: json.member_a as ComposeMember,
        b: json.member_b as ComposeMember,
        matchReason: intro.match_reason,
      })
    } finally {
      setApprovingId(null)
    }
  }

  function openReject(intro: IntroRow) {
    setRejecting(intro)
    setRejectNote('')
    setRejectNotify(true)
    setRejectMessage('')
  }

  async function submitReject() {
    if (!rejecting) return
    setRejectSubmitting(true)
    try {
      const res = await fetch('/api/admin/introductions/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          introduction_id: rejecting.id,
          note: rejectNote || undefined,
          notify: rejectNotify,
          message: rejectMessage || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not reject', description: json.error, variant: 'destructive' })
        return
      }
      toast({ title: 'Request declined', description: json.emailed ? 'The member was notified.' : undefined })
      setRejecting(null)
      fetchIntros()
    } finally {
      setRejectSubmitting(false)
    }
  }

  async function fetchIntros() {
    const { data, error } = await supabase
      .from('introductions')
      .select(`
        id,
        status,
        match_score,
        match_reason,
        suggested_at,
        event_id,
        requested_by,
        member_a_id,
        member_b_id,
        member_a_response,
        member_b_response,
        member_a:members!introductions_member_a_id_fkey(
          profiles(first_name, last_name, company_name)
        ),
        member_b:members!introductions_member_b_id_fkey(
          profiles(first_name, last_name, company_name)
        ),
        events(title)
      `)
      .order('suggested_at', { ascending: false })

    if (!error && data) {
      setIntros(data as unknown as IntroRow[])
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return intros.filter((intro) => {
      if (search) {
        const q = search.toLowerCase()
        const nameA = memberName(intro.member_a?.profiles).toLowerCase()
        const nameB = memberName(intro.member_b?.profiles).toLowerCase()
        const companyA = (intro.member_a?.profiles?.company_name ?? '').toLowerCase()
        const companyB = (intro.member_b?.profiles?.company_name ?? '').toLowerCase()
        if (
          !nameA.includes(q) &&
          !nameB.includes(q) &&
          !companyA.includes(q) &&
          !companyB.includes(q)
        ) {
          return false
        }
      }
      if (statusFilter && intro.status !== statusFilter) return false
      return true
    })
  }, [intros, search, statusFilter])

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading introductions...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
            Introductions
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {intros.length} introduction{intros.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="flex gap-3">
          <Button icon={<Plus size={16} />} onClick={() => setShowCreateModal(true)}>
            Create Introduction
          </Button>
        </div>
      </div>

      {/* Member requests inbox */}
      {requests.length > 0 && (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-border-gold bg-gold-muted/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Inbox size={16} className="text-gold" />
            <h2 className="text-sm font-medium text-text">
              Member requests · {requests.length}
            </h2>
          </div>
          <div className="space-y-2">
            {requests.map((intro) => {
              const { requester, other } = requesterAndOther(intro)
              const reqName = memberName(requester?.profiles ?? null)
              const otherName = memberName(other?.profiles ?? null)
              return (
                <div
                  key={intro.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-surface border border-border p-3"
                >
                  <p className="text-sm text-text">
                    <span className="font-medium">{reqName}</span>
                    <span className="text-text-muted"> would like to meet </span>
                    <span className="font-medium">{otherName}</span>
                  </p>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={approvingId === intro.id}
                      onClick={() => approveRequest(intro)}
                    >
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openReject(intro)}>
                      Reject
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div className="flex-1 min-w-[240px] max-w-sm">
          <div className="relative">
            <Search
              size={16}
              strokeWidth={1.5}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
            />
            <input
              type="text"
              placeholder="Search by member name or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-dim focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]"
            />
          </div>
        </div>
        <div className="w-40">
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-card)]">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-text-dim">
              {search || statusFilter
                ? 'No introductions match your filters'
                : 'No introductions yet'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member A</TableHead>
                <TableHead>Member B</TableHead>
                <TableHead>Match Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Suggested</TableHead>
                <TableHead>Event</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((intro) => {
                const nameA = memberName(intro.member_a?.profiles)
                const nameB = memberName(intro.member_b?.profiles)
                const companyA = intro.member_a?.profiles?.company_name
                const companyB = intro.member_b?.profiles?.company_name

                return (
                  <TableRow
                    key={intro.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/introductions/${intro.id}`)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-text">{nameA}</p>
                        {companyA && (
                          <p className="text-xs text-text-dim">{companyA}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-text">{nameB}</p>
                        {companyB && (
                          <p className="text-xs text-text-dim">{companyB}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {intro.match_score != null ? (
                        <span className="text-gold font-medium">
                          {Math.round(intro.match_score * 100)}%
                        </span>
                      ) : (
                        <span className="text-text-dim">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {intro.status === 'accepted' ? (
                        <Badge variant="active" dot>
                          Ready to connect
                        </Badge>
                      ) : (
                        <Badge variant={introStatusBadge[intro.status]} dot>
                          {intro.status}
                        </Badge>
                      )}
                      {(intro.status === 'sent' ||
                        intro.status === 'accepted' ||
                        intro.status === 'declined') && (
                        <p className="mt-1 text-[11px] text-text-dim">
                          {nameA.split(' ')[0]}: {responseLabel(intro.member_a_response)} ·{' '}
                          {nameB.split(' ')[0]}: {responseLabel(intro.member_b_response)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {formatDate(intro.suggested_at)}
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {intro.events?.title ?? '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Modals */}
      <CreateIntroductionModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false)
          fetchIntros()
        }}
      />

      <IntroComposeModal
        open={Boolean(compose)}
        onClose={() => setCompose(null)}
        introId={compose?.introId ?? null}
        memberA={compose?.a ?? null}
        memberB={compose?.b ?? null}
        matchReason={compose?.matchReason ?? null}
        onSent={() => {
          setCompose(null)
          fetchIntros()
        }}
      />

      <Modal open={Boolean(rejecting)} onClose={() => !rejectSubmitting && setRejecting(null)} title="Reject request">
        {rejecting && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Decline this introduction request. Add an internal note, and optionally send the member a
              short, polite message.
            </p>
            <div>
              <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
                Internal note (admin only)
              </label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={2}
                placeholder="Why are you declining? (optional)"
                className="w-full px-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none focus:border-gold resize-y"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
              <input type="checkbox" checked={rejectNotify} onChange={(e) => setRejectNotify(e.target.checked)} />
              Email the member a polite note
            </label>
            {rejectNotify && (
              <div>
                <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
                  Message to the member (optional — a courteous default is used if blank)
                </label>
                <textarea
                  value={rejectMessage}
                  onChange={(e) => setRejectMessage(e.target.value)}
                  rows={3}
                  placeholder="Leave blank to use the standard polite note."
                  className="w-full px-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none focus:border-gold resize-y"
                />
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setRejecting(null)} disabled={rejectSubmitting}>
                Cancel
              </Button>
              <Button onClick={submitReject} loading={rejectSubmitting}>
                Reject request
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
