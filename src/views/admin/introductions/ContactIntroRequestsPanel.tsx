'use client'

// "Wider network" requests — members asking to be introduced to a CRM contact
// from the portal directory. Sits beside the member→member requests on the
// Introductions page. Admins see the contact's full CRM details here (members
// only ever saw name / company / role). Status updates only — no email.

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { apiClient, getApiErrorMessage } from '@/lib/http'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import { SECTOR_LABELS } from '@/lib/contacts/sectors'
import type { ContactIntroStatus } from '@/lib/directory/types'
import { ExternalLink, Globe2 } from 'lucide-react'
import { IntroHistoryBadge, useIntroHistory } from './IntroHistoryBadge'

interface ContactIntroRequest {
  id: string
  status: ContactIntroStatus
  reason: string | null
  desired_outcome: string | null
  admin_note: string | null
  handled_at: string | null
  created_at: string
  contact: {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
    company_name: string | null
    job_title: string | null
    phone: string | null
    linkedin_url: string | null
    website: string | null
    sector: string | null
    city: string | null
    location: string | null
  } | null
  requester: {
    id: string
    company_name: string | null
    profiles: { first_name: string | null; last_name: string | null; email: string | null } | null
  } | null
}

type Action = Exclude<ContactIntroStatus, 'pending'>

const ACTION_LABEL: Record<Action, string> = {
  approved: 'Approve',
  declined: 'Decline',
  completed: 'Mark completed',
}

const STATUS_BADGE: Record<ContactIntroStatus, 'draft' | 'upcoming' | 'urgent' | 'active'> = {
  pending: 'draft',
  approved: 'upcoming',
  declined: 'urgent',
  completed: 'active',
}

const KEY = ['admin', 'contact-intro-requests'] as const

function personName(p: { first_name: string | null; last_name: string | null } | null | undefined) {
  return `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'Unknown'
}

export function ContactIntroRequestsPanel() {
  const qc = useQueryClient()
  const [showHandled, setShowHandled] = useState(false)
  const [acting, setActing] = useState<{ req: ContactIntroRequest; action: Action } | null>(null)
  const [note, setNote] = useState('')

  const status = showHandled ? 'all' : 'open'
  const { data: requests = [], isLoading } = useQuery({
    queryKey: [...KEY, status],
    queryFn: async () =>
      (
        await apiClient.get<{ requests: ContactIntroRequest[] }>(
          '/api/admin/introductions/contact-requests',
          { params: { status } },
        )
      ).data.requests,
  })

  const update = useMutation({
    mutationFn: async (vars: { id: string; status: Action; note: string }) =>
      (
        await apiClient.patch<{ ok: boolean }>(
          `/api/admin/introductions/contact-requests/${vars.id}`,
          { status: vars.status, note: vars.note || undefined },
        )
      ).data,
    onSuccess: (_data, vars) => {
      toast({
        title:
          vars.status === 'approved'
            ? 'Request approved'
            : vars.status === 'declined'
              ? 'Request declined'
              : 'Marked completed',
      })
      setActing(null)
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['admin', 'intro-history'] })
    },
    onError: (e) =>
      toast({
        title: 'Could not update',
        description: getApiErrorMessage(e, 'Please try again.'),
        variant: 'destructive',
      }),
  })

  const historyQuery = useIntroHistory(
    requests.map((r) => r.requester?.id ?? '').filter(Boolean),
  )

  function openAction(req: ContactIntroRequest, action: Action) {
    setNote(req.admin_note ?? '')
    setActing({ req, action })
  }

  if (isLoading || (requests.length === 0 && !showHandled)) {
    return null
  }

  return (
    <div className="mb-6 rounded-[var(--radius-lg)] border border-border-gold bg-gold-muted/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Globe2 size={16} className="text-gold shrink-0" />
          <h2 className="text-sm font-medium text-text truncate">
            Wider network requests · {requests.length}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowHandled((v) => !v)}
          className="text-xs text-text-muted hover:text-gold transition-colors"
        >
          {showHandled ? 'Show open only' : 'Show handled too'}
        </button>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-text-dim px-1 py-2">No wider-network requests yet.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => {
            const c = req.contact
            const reqName = personName(req.requester?.profiles)
            const contactName = personName(c)
            const details = [
              c?.job_title,
              c?.company_name,
              c?.sector && c.sector !== 'unsegmented' ? SECTOR_LABELS[c.sector] ?? c.sector : null,
              c?.city || c?.location,
            ].filter(Boolean)
            return (
              <div
                key={req.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-md)] bg-surface border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info">Wider network</Badge>
                    <Badge variant={STATUS_BADGE[req.status]} dot>
                      {req.status}
                    </Badge>
                    <span className="text-[11px] text-text-dim">{formatDate(req.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-text break-words">
                    <span className="font-medium">{reqName}</span>
                    <span className="text-text-muted"> would like to meet </span>
                    <span className="font-medium">{contactName}</span>
                    {c && (
                      <Link
                        href={`/dashboard/contacts?contact=${c.id}`}
                        className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-gold hover:underline"
                      >
                        contact record <ExternalLink size={10} />
                      </Link>
                    )}
                  </p>
                  {details.length > 0 && (
                    <p className="mt-0.5 text-xs text-text-dim break-words">{details.join(' · ')}</p>
                  )}
                  {c && (c.email || c.phone || c.linkedin_url) && (
                    <p className="mt-0.5 text-xs text-text-dim break-all">
                      {[c.email, c.phone].filter(Boolean).join(' · ')}
                      {c.linkedin_url && (
                        <>
                          {(c.email || c.phone) && ' · '}
                          <a
                            href={c.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gold hover:underline"
                          >
                            LinkedIn
                          </a>
                        </>
                      )}
                    </p>
                  )}
                  {req.reason && (
                    <p className="mt-1 text-xs text-text-muted">
                      <span className="text-text-dim">Reason:</span> {req.reason}
                    </p>
                  )}
                  {req.desired_outcome && (
                    <p className="mt-0.5 text-xs text-text-muted">
                      <span className="text-text-dim">Desired outcome:</span> {req.desired_outcome}
                    </p>
                  )}
                  {req.admin_note && (
                    <p className="mt-0.5 text-xs text-text-muted">
                      <span className="text-text-dim">Note:</span> {req.admin_note}
                    </p>
                  )}
                  {req.requester && (
                    <IntroHistoryBadge
                      className="mt-1.5"
                      name={reqName}
                      history={historyQuery.data?.[req.requester.id]}
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {req.status === 'pending' && (
                    <Button size="sm" variant="secondary" onClick={() => openAction(req, 'approved')}>
                      Approve
                    </Button>
                  )}
                  {(req.status === 'pending' || req.status === 'approved') && (
                    <Button size="sm" variant="secondary" onClick={() => openAction(req, 'completed')}>
                      Mark completed
                    </Button>
                  )}
                  {(req.status === 'pending' || req.status === 'approved') && (
                    <Button size="sm" variant="ghost" onClick={() => openAction(req, 'declined')}>
                      Decline
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={Boolean(acting)}
        onClose={() => !update.isPending && setActing(null)}
        title={acting ? `${ACTION_LABEL[acting.action]} request` : undefined}
      >
        {acting && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              {personName(acting.req.requester?.profiles)} → {personName(acting.req.contact)}.
              {acting.action === 'completed' &&
                ' It will count in the member’s introduction history.'}{' '}
              No email is sent — let the member know personally.
            </p>
            <Textarea
              label="Internal note (admin only)"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setActing(null)} disabled={update.isPending}>
                Cancel
              </Button>
              <Button
                loading={update.isPending}
                onClick={() =>
                  update.mutate({ id: acting.req.id, status: acting.action, note: note.trim() })
                }
              >
                {ACTION_LABEL[acting.action]}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
