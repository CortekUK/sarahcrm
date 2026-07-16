'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { IntroOutcomeForm } from '@/components/admin/IntroOutcomeForm'
import { formatDate, cn } from '@/lib/utils'
import { ArrowLeft, ArrowRight, Check, X as XIcon } from 'lucide-react'
import type { Database } from '@/types/database'

type IntroStatus = Database['public']['Enums']['intro_status']

interface IntroDetail {
  id: string
  status: IntroStatus
  match_score: number | null
  match_reason: string | null
  request_reason: string | null
  desired_outcome: string | null
  matching_tags: string[] | null
  suggested_at: string
  approved_at: string | null
  approved_by: string | null
  sent_at: string | null
  accepted_at: string | null
  followed_up_at: string | null
  outcome: string | null
  business_converted: boolean
  estimated_value_pence: number | null
  meeting_held_at: string | null
  proposal_sent_at: string | null
  deal_status: 'won' | 'lost' | null
  deal_closed_at: string | null
  revenue_pence: number | null
  commission_pence: number | null
  testimonial_obtained: boolean
  testimonial_note: string | null
  event_id: string | null
  member_a_id: string
  member_b_id: string
  email_a_sent_at: string | null
  email_b_sent_at: string | null
  email_a_scheduled_at: string | null
  email_b_scheduled_at: string | null
  member_a_response: Database['public']['Enums']['intro_response']
  member_b_response: Database['public']['Enums']['intro_response']
  member_a_response_note: string | null
  member_b_response_note: string | null
  member_a: {
    id: string
    company_name: string | null
    agreement_commission_pct: number | null
    profiles: {
      first_name: string | null
      last_name: string | null
      avatar_url: string | null
      company_name: string | null
    }
  }
  member_b: {
    id: string
    company_name: string | null
    agreement_commission_pct: number | null
    profiles: {
      first_name: string | null
      last_name: string | null
      avatar_url: string | null
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

const LIFECYCLE_STEPS: { key: IntroStatus; label: string }[] = [
  { key: 'suggested', label: 'Suggested' },
  { key: 'approved', label: 'Approved' },
  { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'completed', label: 'Completed' },
]

const STATUS_ORDER: Record<IntroStatus, number> = {
  suggested: 0,
  approved: 1,
  scheduled: 1,
  sent: 2,
  accepted: 3,
  completed: 4,
  declined: -1,
}

function memberName(profiles: { first_name: string | null; last_name: string | null } | null): string {
  if (!profiles) return 'Unknown'
  return `${profiles.first_name ?? ''} ${profiles.last_name ?? ''}`.trim() || 'Unnamed'
}

function getTimestamp(intro: IntroDetail, step: IntroStatus): string | null {
  switch (step) {
    case 'suggested': return intro.suggested_at
    case 'approved': return intro.approved_at
    case 'sent': return intro.sent_at
    case 'accepted': return intro.accepted_at
    // No dedicated `completed_at` column — completion is recorded on
    // `followed_up_at` when the outcome is saved (see saveOutcome).
    case 'completed': return intro.followed_up_at
    default: return null
  }
}

export function IntroductionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [intro, setIntro] = useState<IntroDetail | null>(null)
  const [tagNames, setTagNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)

  useEffect(() => {
    if (id) fetchIntro(id)
  }, [id])

  async function fetchIntro(introId: string) {
    setLoading(true)
    const { data, error } = await supabase
      .from('introductions')
      .select(`
        *,
        member_a:members!introductions_member_a_id_fkey(
          id, company_name, agreement_commission_pct,
          profiles(first_name, last_name, avatar_url, company_name)
        ),
        member_b:members!introductions_member_b_id_fkey(
          id, company_name, agreement_commission_pct,
          profiles(first_name, last_name, avatar_url, company_name)
        ),
        events(title)
      `)
      .eq('id', introId)
      .single()

    if (!error && data) {
      const d = data as unknown as IntroDetail
      setIntro(d)

      // Resolve matching_tags UUIDs to names
      if (d.matching_tags && d.matching_tags.length > 0) {
        const { data: tags } = await supabase
          .from('tags')
          .select('name')
          .in('id', d.matching_tags)
        setTagNames(tags?.map((t) => t.name) ?? [])
      } else {
        setTagNames([])
      }
    }
    setLoading(false)
  }

  // Sending is owned by the compose-and-send flow (which actually emails
  // each side and stamps email_a/b_sent_at). The only status changes safe
  // to make from here are the genuinely-manual ones: declining, and
  // recording an outcome (which completes the intro).
  async function decline() {
    if (!intro || !id) return
    setAdvancing(true)
    await supabase
      .from('introductions')
      .update({ status: 'declined' })
      .eq('id', id)
    await fetchIntro(id)
    setAdvancing(false)
  }

  if (loading || !intro) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading introduction...</span>
        </div>
      </div>
    )
  }

  const nameA = memberName(intro.member_a?.profiles)
  const nameB = memberName(intro.member_b?.profiles)
  const companyA = intro.member_a?.company_name ?? intro.member_a?.profiles?.company_name
  const companyB = intro.member_b?.company_name ?? intro.member_b?.profiles?.company_name
  const currentOrder = STATUS_ORDER[intro.status]
  const isDeclined = intro.status === 'declined'
  const isCompleted = intro.status === 'completed'
  const isTerminal = isCompleted || isDeclined

  // Real send state, derived from the per-side columns the compose-and-send
  // flow stamps — NOT from `status`. A member only ever sees their intro
  // once THEIR side's email_X_sent_at is set, so this is the source of truth.
  function sendStateLabel(sentAt: string | null, scheduledAt: string | null): { text: string; cls: string } {
    if (sentAt) return { text: `Sent · ${formatDate(sentAt)}`, cls: 'text-accent' }
    if (scheduledAt) return { text: `Scheduled · ${formatDate(scheduledAt)}`, cls: 'text-gold' }
    return { text: 'Not sent', cls: 'text-text-dim' }
  }
  const sendA = sendStateLabel(intro.email_a_sent_at, intro.email_a_scheduled_at)
  const sendB = sendStateLabel(intro.email_b_sent_at, intro.email_b_scheduled_at)
  const eitherSent = Boolean(intro.email_a_sent_at || intro.email_b_sent_at)
  // Both members accepted → ready to record the outcome.
  const bothAccepted =
    intro.member_a_response === 'accepted' && intro.member_b_response === 'accepted'

  return (
    <div className="p-8">
      {/* Back */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push('/dashboard/introductions')}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          Back to Introductions
        </button>
      </div>

      {/* Header card — Members */}
      <Card className="mb-6">
        <CardContent className="py-6">
          <div className="flex items-center gap-6">
            {/* Member A */}
            <div className="flex-1 text-center">
              <div className="flex justify-center mb-2">
                <Avatar
                  src={intro.member_a?.profiles?.avatar_url}
                  name={nameA}
                  size="lg"
                />
              </div>
              <p className="font-medium text-text">{nameA}</p>
              {companyA && <p className="text-sm text-text-muted">{companyA}</p>}
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <ArrowRight size={20} className="text-gold" />
              <Badge variant={introStatusBadge[intro.status]} dot>
                {intro.status}
              </Badge>
              {intro.match_score != null && (
                <span className="text-sm font-medium text-gold">
                  {Math.round(intro.match_score * 100)}% match
                </span>
              )}
            </div>

            {/* Member B */}
            <div className="flex-1 text-center">
              <div className="flex justify-center mb-2">
                <Avatar
                  src={intro.member_b?.profiles?.avatar_url}
                  name={nameB}
                  size="lg"
                />
              </div>
              <p className="font-medium text-text">{nameB}</p>
              {companyB && <p className="text-sm text-text-muted">{companyB}</p>}
            </div>
          </div>

          {/* Match reason */}
          {intro.match_reason && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Match Reason</p>
              <p className="text-sm text-text">{intro.match_reason}</p>
            </div>
          )}

          {/* The requesting member's own words (only when they requested it) */}
          {intro.request_reason && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Member&apos;s reason</p>
              <p className="text-sm text-text whitespace-pre-line">{intro.request_reason}</p>
            </div>
          )}
          {intro.desired_outcome && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Desired outcome</p>
              <p className="text-sm text-text whitespace-pre-line">{intro.desired_outcome}</p>
            </div>
          )}

          {/* Member responses (notes are for The Club only) */}
          {(intro.status === 'sent' ||
            intro.status === 'accepted' ||
            intro.status === 'declined' ||
            intro.status === 'completed') && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(
                [
                  { m: intro.member_a, resp: intro.member_a_response, note: intro.member_a_response_note },
                  { m: intro.member_b, resp: intro.member_b_response, note: intro.member_b_response_note },
                ] as const
              ).map((side, i) => {
                const name =
                  `${side.m?.profiles?.first_name ?? ''} ${side.m?.profiles?.last_name ?? ''}`.trim() ||
                  'Member'
                return (
                  <div key={i} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-medium text-text">{name}</p>
                      <Badge
                        variant={
                          side.resp === 'accepted'
                            ? 'active'
                            : side.resp === 'declined'
                              ? 'urgent'
                              : 'draft'
                        }
                        dot
                      >
                        {side.resp === 'accepted'
                          ? 'Accepted'
                          : side.resp === 'declined'
                            ? 'Declined'
                            : 'Awaiting reply'}
                      </Badge>
                    </div>
                    {side.note ? (
                      <p className="text-sm text-text-muted italic">“{side.note}”</p>
                    ) : (
                      <p className="text-xs text-text-dim">No note left.</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Matching tags */}
          {tagNames.length > 0 && (
            <div className="mt-3">
              <div className="flex flex-wrap gap-1.5">
                {tagNames.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 text-xs rounded-full bg-gold-muted text-gold border border-border-gold"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Event */}
          {intro.events && (
            <div className="mt-3 text-sm text-text-muted">
              Event: <span className="text-text">{intro.events.title}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          {isDeclined ? (
            <div className="flex items-center gap-3 py-4">
              <div className="w-8 h-8 rounded-full bg-[rgba(196,105,74,0.1)] flex items-center justify-center">
                <XIcon size={16} className="text-accent-warm" />
              </div>
              <div>
                <p className="font-medium text-accent-warm">Declined</p>
                <p className="text-xs text-text-dim">This introduction was declined</p>
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              {LIFECYCLE_STEPS.map((step, index) => {
                const stepOrder = STATUS_ORDER[step.key]
                const isPast = currentOrder > stepOrder
                const isCurrent = currentOrder === stepOrder
                const isFuture = currentOrder < stepOrder
                const timestamp = getTimestamp(intro, step.key)
                const isLast = index === LIFECYCLE_STEPS.length - 1

                return (
                  <div key={step.key} className="flex gap-4">
                    {/* Line + indicator */}
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                          isPast && 'bg-accent text-white',
                          isCurrent && 'bg-gold text-white',
                          isFuture && 'bg-surface-2 text-text-dim'
                        )}
                      >
                        {isPast ? (
                          <Check size={14} />
                        ) : isCurrent ? (
                          <div className="w-2 h-2 bg-ink rounded-full animate-pulse" />
                        ) : (
                          <div className="w-2 h-2 bg-text-dim/30 rounded-full" />
                        )}
                      </div>
                      {!isLast && (
                        <div
                          className={cn(
                            'w-0.5 h-8',
                            isPast ? 'bg-accent' : 'bg-border'
                          )}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="pb-4 pt-1">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          isPast && 'text-text',
                          isCurrent && 'text-gold',
                          isFuture && 'text-text-dim'
                        )}
                      >
                        {step.label}
                      </p>
                      {isPast && timestamp && (
                        <p className="text-xs text-text-dim">{formatDate(timestamp)}</p>
                      )}
                      {isCurrent && (
                        <p className="text-xs text-gold">Current step</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sending — read-only. Status here is DERIVED from the per-side
          email columns the compose-and-send flow stamps. Sending itself
          happens in that flow (it emails each member individually and is
          the only thing the member portal reacts to), so we never flip
          "sent" from this page. */}
      {!isTerminal && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Sending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-text-dim">Email to {nameA}</p>
                <p className={cn('text-sm font-medium', sendA.cls)}>{sendA.text}</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-text-dim">Email to {nameB}</p>
                <p className={cn('text-sm font-medium', sendB.cls)}>{sendB.text}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-text-muted">
              {eitherSent
                ? 'Need to re-send, schedule the other side, or edit the message? Use the compose-and-send flow on either member’s profile.'
                : 'This introduction hasn’t been sent yet. Open the compose-and-send flow on either member’s profile to email each side and (optionally) schedule it.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                icon={<ArrowRight size={14} />}
                onClick={() => router.push(`/dashboard/members/${intro.member_a_id}`)}
              >
                Open {nameA}&apos;s profile
              </Button>
              <Button
                variant="ghost"
                icon={<ArrowRight size={14} />}
                onClick={() => router.push(`/dashboard/members/${intro.member_b_id}`)}
              >
                Open {nameB}&apos;s profile
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual actions — declining is the only safe status flip from here. */}
      {!isTerminal && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {bothAccepted && (
              <p className="mb-3 text-sm text-text-muted">
                Both members accepted — record the outcome below once you&apos;ve connected them.
              </p>
            )}
            <Button
              variant="ghost"
              onClick={decline}
              loading={advancing}
              icon={<XIcon size={14} />}
            >
              Decline introduction
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Outcome pipeline — recordable once not declined. Deciding a deal
          (won/lost) completes the intro and stamps followed_up_at. Shared
          with the member matches panel via IntroOutcomeForm. */}
      {!isDeclined && (
        <Card>
          <CardHeader>
            <CardTitle>Outcome</CardTitle>
          </CardHeader>
          <CardContent>
            {isCompleted && intro.followed_up_at && (
              <p className="mb-4 text-xs text-text-dim">
                Completed {formatDate(intro.followed_up_at)}.
              </p>
            )}
            <IntroOutcomeForm
              introId={intro.id}
              initial={{
                outcome: intro.outcome,
                meeting_held_at: intro.meeting_held_at,
                proposal_sent_at: intro.proposal_sent_at,
                deal_status: intro.deal_status,
                estimated_value_pence: intro.estimated_value_pence,
                revenue_pence: intro.revenue_pence,
                commission_pence: intro.commission_pence,
                testimonial_obtained: intro.testimonial_obtained,
                testimonial_note: intro.testimonial_note,
                followed_up_at: intro.followed_up_at,
              }}
              agreementCommissionPct={
                intro.member_a.agreement_commission_pct ??
                intro.member_b.agreement_commission_pct
              }
              onSaved={() => fetchIntro(intro.id)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
