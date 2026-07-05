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
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus, Search, Inbox, Sparkles, TrendingUp } from 'lucide-react'
import { CreateIntroductionModal } from './CreateIntroductionModal'
import { IntroComposeModal, type ComposeMember } from './IntroComposeModal'
import { Modal } from '@/components/ui/Modal'
import { StatCard } from '@/components/ui/StatCard'
import { toast } from '@/lib/hooks/use-toast'
import { buildIntroReport } from '@/lib/introductions/reporting'
import type { Database } from '@/types/database'

type IntroStatus = Database['public']['Enums']['intro_status']
type IntroResponse = Database['public']['Enums']['intro_response']

interface IntroRow {
  id: string
  status: IntroStatus
  match_score: number | null
  match_reason: string | null
  request_reason: string | null
  desired_outcome: string | null
  suggested_at: string
  event_id: string | null
  requested_by: string | null
  member_a_id: string
  member_b_id: string
  member_a_response: IntroResponse
  member_b_response: IntroResponse
  // Commercial-outcome fields feeding the Insights / reporting section.
  sent_at: string | null
  meeting_held_at: string | null
  deal_status: string | null
  revenue_pence: number | null
  member_a: {
    sector: string | null
    profiles: {
      first_name: string | null
      last_name: string | null
      company_name: string | null
    }
  }
  member_b: {
    sector: string | null
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
  // AI suggestion generation + dismissal
  const [generating, setGenerating] = useState(false)
  const [dismissingId, setDismissingId] = useState<string | null>(null)

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

  // AI-generated suggestions awaiting review (no requester = engine-created).
  const aiSuggestions = useMemo(
    () => intros.filter((i) => i.status === 'suggested' && !i.requested_by),
    [intros],
  )

  // Insights / reporting — aggregate every introduction into the dashboard
  // metrics the client doc calls for (revenue generated, ROI by member/sector).
  const report = useMemo(() => {
    const memberMap = new Map<string, { id: string; name: string; sector: string | null }>()
    for (const i of intros) {
      memberMap.set(i.member_a_id, {
        id: i.member_a_id,
        name: memberName(i.member_a?.profiles ?? null),
        sector: i.member_a?.sector ?? null,
      })
      memberMap.set(i.member_b_id, {
        id: i.member_b_id,
        name: memberName(i.member_b?.profiles ?? null),
        sector: i.member_b?.sector ?? null,
      })
    }
    return buildIntroReport(
      intros.map((i) => ({
        member_a_id: i.member_a_id,
        member_b_id: i.member_b_id,
        requested_by: i.requested_by,
        status: i.status,
        sent_at: i.sent_at,
        meeting_held_at: i.meeting_held_at,
        deal_status: i.deal_status,
        revenue_pence: i.revenue_pence,
      })),
      [...memberMap.values()],
    )
  }, [intros])

  async function generateSuggestions() {
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/introductions/generate-suggestions', {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not generate', description: json.error, variant: 'destructive' })
        return
      }
      const n = json.created as number
      toast({
        title: n > 0 ? `${n} suggestion${n === 1 ? '' : 's'} generated` : 'No new suggestions',
        description:
          n > 0
            ? 'Review them below and approve or dismiss.'
            : 'Every strong match already has an introduction.',
      })
      await fetchIntros()
    } finally {
      setGenerating(false)
    }
  }

  async function dismissSuggestion(intro: IntroRow) {
    setDismissingId(intro.id)
    try {
      const res = await fetch('/api/admin/introductions/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ introduction_id: intro.id, notify: false }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not dismiss', description: json.error, variant: 'destructive' })
        return
      }
      await fetchIntros()
    } finally {
      setDismissingId(null)
    }
  }

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
        request_reason,
        desired_outcome,
        suggested_at,
        event_id,
        requested_by,
        member_a_id,
        member_b_id,
        member_a_response,
        member_b_response,
        sent_at,
        meeting_held_at,
        deal_status,
        revenue_pence,
        member_a:members!introductions_member_a_id_fkey(
          sector,
          profiles(first_name, last_name, company_name)
        ),
        member_b:members!introductions_member_b_id_fkey(
          sector,
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
          <Button
            variant="secondary"
            icon={<Sparkles size={16} />}
            loading={generating}
            onClick={generateSuggestions}
          >
            Generate suggestions
          </Button>
          <Button icon={<Plus size={16} />} onClick={() => setShowCreateModal(true)}>
            Create Introduction
          </Button>
        </div>
      </div>

      {/* Insights — revenue generated by introductions + ROI breakdowns */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-gold" />
          <h2 className="text-sm font-medium text-text">Insights</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Introductions Requested" value={report.totalRequested} />
          <StatCard label="Introductions Made" value={report.totalMade} />
          <StatCard label="Meetings Created" value={report.meetingsHeld} />
          <StatCard label="Opportunities Created" value={report.dealsWon} />
          <StatCard label="Total Introductions" value={report.totalIntroductions} />
          <StatCard
            label="Revenue Generated"
            value={formatCurrency(report.revenuePence)}
            changeText="from introductions"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* ROI by member */}
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
            <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
              ROI by Member
            </p>
            {report.byMember.length === 0 ? (
              <p className="text-sm text-text-dim">No introduction revenue recorded yet.</p>
            ) : (
              <div className="space-y-1.5">
                {report.byMember.map((row, i) => (
                  <div
                    key={row.key}
                    className="flex items-center justify-between rounded-[var(--radius-md)] bg-surface-2 border border-border px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-text">
                      <span className="text-text-dim mr-1.5">{i + 1}.</span>
                      {row.label}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-gold">
                      {formatCurrency(row.revenuePence)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* ROI by industry sector */}
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
            <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
              ROI by Industry Sector
            </p>
            {report.bySector.length === 0 ? (
              <p className="text-sm text-text-dim">No introduction revenue recorded yet.</p>
            ) : (
              <div className="space-y-1.5">
                {report.bySector.map((row, i) => (
                  <div
                    key={row.key}
                    className="flex items-center justify-between rounded-[var(--radius-md)] bg-surface-2 border border-border px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-text">
                      <span className="text-text-dim mr-1.5">{i + 1}.</span>
                      {row.label}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-gold">
                      {formatCurrency(row.revenuePence)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text">
                      <span className="font-medium">{reqName}</span>
                      <span className="text-text-muted"> would like to meet </span>
                      <span className="font-medium">{otherName}</span>
                    </p>
                    {intro.request_reason && (
                      <p className="mt-1 text-xs text-text-muted">
                        <span className="text-text-dim">Reason:</span> {intro.request_reason}
                      </p>
                    )}
                    {intro.desired_outcome && (
                      <p className="mt-0.5 text-xs text-text-muted">
                        <span className="text-text-dim">Desired outcome:</span> {intro.desired_outcome}
                      </p>
                    )}
                  </div>
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

      {/* AI suggestions inbox */}
      {aiSuggestions.length > 0 && (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-border-gold bg-gold-muted/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-gold-light to-gold text-white shadow-[0_2px_6px_rgba(184,151,90,0.35)]">
              <Sparkles size={11} strokeWidth={1.75} />
            </div>
            <h2 className="text-sm font-medium text-text">
              Suggested introductions · {aiSuggestions.length}
            </h2>
          </div>
          <div className="space-y-2">
            {aiSuggestions.map((intro) => {
              const nameA = memberName(intro.member_a?.profiles ?? null)
              const nameB = memberName(intro.member_b?.profiles ?? null)
              return (
                <div
                  key={intro.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-surface border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text">
                      <span className="font-medium">{nameA}</span>
                      <span className="text-text-muted"> &amp; </span>
                      <span className="font-medium">{nameB}</span>
                      {intro.match_score != null && (
                        <span className="ml-2 text-gold font-medium">
                          {Math.round(intro.match_score * 100)}%
                        </span>
                      )}
                    </p>
                    {intro.match_reason && (
                      <p className="text-xs text-text-dim italic mt-0.5">{intro.match_reason}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={approvingId === intro.id}
                      onClick={() => approveRequest(intro)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={dismissingId === intro.id}
                      onClick={() => dismissSuggestion(intro)}
                    >
                      Dismiss
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
