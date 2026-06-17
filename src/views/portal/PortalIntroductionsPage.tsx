'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'
import { formatDate } from '@/lib/utils'
import { Handshake } from 'lucide-react'
import {
  PortalBadge,
  PortalButton,
  PortalCard,
  PortalEmptyState,
  PortalLoading,
  PortalPageHeader,
  type PortalBadgeVariant,
} from '@/components/portal/PortalChrome'
import { toast } from '@/lib/hooks/use-toast'
import type { Database } from '@/types/database'

type IntroStatus = Database['public']['Enums']['intro_status']
type IntroResponse = Database['public']['Enums']['intro_response']

interface IntroRow {
  id: string
  status: IntroStatus
  match_score: number | null
  match_reason: string | null
  outcome: string | null
  created_at: string
  other_member_id: string
  mineRequest: boolean
  mySent: boolean
  myResponse: IntroResponse
  otherResponse: IntroResponse
  other: {
    first_name: string | null
    last_name: string | null
    company_name: string | null
    avatar_url: string | null
    job_title: string | null
  }
  tags: string[]
}

// A member sees an introduction once THEIR side's email was actually sent
// (mySent) — so "sent to one, not the other" is respected — or it's their own
// pending request. Pre-send team states (approved/scheduled) stay hidden.

const introVariant: Record<IntroStatus, PortalBadgeVariant> = {
  suggested: 'draft',
  approved: 'upcoming',
  sent: 'info',
  scheduled: 'upcoming',
  accepted: 'active',
  completed: 'active',
  declined: 'urgent',
}

const statusLabels: Record<IntroStatus, string> = {
  suggested: 'Suggested',
  approved: 'Approved',
  sent: 'Sent',
  scheduled: 'Scheduled',
  accepted: 'Accepted',
  completed: 'Completed',
  declined: 'Declined',
}

export function PortalIntroductionsPage() {
  const { user } = useAuth()
  const [intros, setIntros] = useState<IntroRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'requested' | 'active' | 'past'>('all')

  useEffect(() => {
    if (user?.id) fetchIntros(user.id)
  }, [user?.id])

  async function respond(introId: string, response: IntroResponse, note: string) {
    const res = await fetch('/api/portal/introductions/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ introduction_id: introId, response, note: note || undefined }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(json.error || 'Could not save your response.')
    }
    if (user?.id) await fetchIntros(user.id)
  }

  async function fetchIntros(userId: string) {
    const { data: memberData } = await supabase
      .from('members')
      .select('id')
      .eq('profile_id', userId)
      .single()

    if (!memberData) {
      setLoading(false)
      return
    }
    const memberId = memberData.id

    const [introsARes, introsBRes] = await Promise.all([
      supabase
        .from('introductions')
        .select(
          'id, status, match_score, match_reason, outcome, created_at, requested_by, member_a_response, member_b_response, email_a_sent_at, email_b_sent_at, member_b_id, members!introductions_member_b_id_fkey(profiles(first_name, last_name, company_name, avatar_url, job_title))',
        )
        .eq('member_a_id', memberId)
        .order('created_at', { ascending: false }),
      supabase
        .from('introductions')
        .select(
          'id, status, match_score, match_reason, outcome, created_at, requested_by, member_a_response, member_b_response, email_a_sent_at, email_b_sent_at, member_a_id, members!introductions_member_a_id_fkey(profiles(first_name, last_name, company_name, avatar_url, job_title))',
        )
        .eq('member_b_id', memberId)
        .order('created_at', { ascending: false }),
    ])

    const allIntros: IntroRow[] = []
    const otherMemberIds: string[] = []

    for (const row of (introsARes.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const m = row.members as
        | { profiles: { first_name: string | null; last_name: string | null; company_name: string | null; avatar_url: string | null; job_title: string | null } }
        | undefined
      const otherId = row.member_b_id as string
      otherMemberIds.push(otherId)
      allIntros.push({
        id: row.id as string,
        status: row.status as IntroStatus,
        match_score: row.match_score as number | null,
        match_reason: row.match_reason as string | null,
        outcome: row.outcome as string | null,
        created_at: row.created_at as string,
        other_member_id: otherId,
        mineRequest: (row.requested_by as string | null) === memberId,
        mySent: Boolean(row.email_a_sent_at),
        myResponse: (row.member_a_response as IntroResponse) ?? 'pending',
        otherResponse: (row.member_b_response as IntroResponse) ?? 'pending',
        other: m
          ? m.profiles
          : { first_name: null, last_name: null, company_name: null, avatar_url: null, job_title: null },
        tags: [],
      })
    }
    for (const row of (introsBRes.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const m = row.members as
        | { profiles: { first_name: string | null; last_name: string | null; company_name: string | null; avatar_url: string | null; job_title: string | null } }
        | undefined
      const otherId = row.member_a_id as string
      otherMemberIds.push(otherId)
      allIntros.push({
        id: row.id as string,
        status: row.status as IntroStatus,
        match_score: row.match_score as number | null,
        match_reason: row.match_reason as string | null,
        outcome: row.outcome as string | null,
        created_at: row.created_at as string,
        other_member_id: otherId,
        mineRequest: (row.requested_by as string | null) === memberId,
        mySent: Boolean(row.email_b_sent_at),
        myResponse: (row.member_b_response as IntroResponse) ?? 'pending',
        otherResponse: (row.member_a_response as IntroResponse) ?? 'pending',
        other: m
          ? m.profiles
          : { first_name: null, last_name: null, company_name: null, avatar_url: null, job_title: null },
        tags: [],
      })
    }

    if (otherMemberIds.length > 0) {
      const { data: mtData } = await supabase
        .from('member_tags')
        .select('member_id, tags(name)')
        .in('member_id', otherMemberIds)

      if (mtData) {
        const tagsByMember: Record<string, string[]> = {}
        for (const row of mtData as unknown as Array<{
          member_id: string
          tags: { name: string }
        }>) {
          if (!tagsByMember[row.member_id]) tagsByMember[row.member_id] = []
          tagsByMember[row.member_id].push(row.tags.name)
        }
        for (const intro of allIntros) {
          intro.tags = tagsByMember[intro.other_member_id] ?? []
        }
      }
    }

    allIntros.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    // Visible if MY email was actually sent, or it's my own pending request.
    setIntros(allIntros.filter((i) => i.mySent || (i.status === 'suggested' && i.mineRequest)))
    setLoading(false)
  }

  const requestedIntros = useMemo(
    () => intros.filter((i) => !i.mySent && i.status === 'suggested' && i.mineRequest),
    [intros],
  )
  const pastIntros = useMemo(
    () => intros.filter((i) => i.mySent && ['completed', 'declined'].includes(i.status)),
    [intros],
  )
  const activeIntros = useMemo(
    () => intros.filter((i) => i.mySent && !['completed', 'declined'].includes(i.status)),
    [intros],
  )

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
        <PortalLoading label="Loading introductions" />
      </div>
    )
  }

  function RespondBlock({ intro, otherFirst }: { intro: IntroRow; otherFirst: string }) {
    const [note, setNote] = useState('')
    const [submitting, setSubmitting] = useState<IntroResponse | null>(null)

    async function handle(response: IntroResponse) {
      setSubmitting(response)
      try {
        await respond(intro.id, response, note)
        toast({
          title: response === 'accepted' ? 'Introduction accepted' : 'Introduction declined',
          description:
            response === 'accepted'
              ? `The Club will connect you with ${otherFirst} once you've both accepted.`
              : 'Thanks for letting us know.',
        })
      } catch (e) {
        toast({
          title: 'Something went wrong',
          description: e instanceof Error ? e.message : 'Please try again.',
          variant: 'destructive',
        })
        setSubmitting(null)
      }
    }

    return (
      <div className="mt-4 px-4 py-4 border-l-2 border-bronze/55 bg-bronze/[0.06]">
        <p className="font-[family-name:var(--font-editorial)] italic text-[13px] text-bronze-light mb-3">
          Would you like us to introduce you to {otherFirst}?
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Add a private note for The Club (optional)…"
          className="w-full px-3 py-2 bg-ink/40 text-ivory text-[13px] rounded-md border border-graphite-line/55 outline-none focus:border-bronze/55 resize-y mb-3"
        />
        <div className="flex gap-3">
          <PortalButton
            size="sm"
            variant="primary"
            loading={submitting === 'accepted'}
            disabled={submitting !== null}
            onClick={() => handle('accepted')}
          >
            Yes, introduce us
          </PortalButton>
          <PortalButton
            size="sm"
            variant="secondary"
            loading={submitting === 'declined'}
            disabled={submitting !== null}
            onClick={() => handle('declined')}
          >
            No, thank you
          </PortalButton>
        </div>
      </div>
    )
  }

  function IntroCard({ intro }: { intro: IntroRow }) {
    const otherName = `${intro.other.first_name ?? ''} ${intro.other.last_name ?? ''}`.trim()

    return (
      <PortalCard className="p-6 lg:p-7">
        <div className="flex gap-5">
          <Avatar name={otherName || '?'} src={intro.other.avatar_url} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-[17px] text-ivory leading-tight">
                  {otherName || 'Unknown'}
                </h3>
                {(intro.other.job_title || intro.other.company_name) && (
                  <p className="mt-1 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.22em] text-slate-haze">
                    {[intro.other.job_title, intro.other.company_name].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {intro.match_score != null && (
                  <span className="font-[family-name:var(--font-display)] text-[15px] text-bronze-light tabular-nums">
                    {Math.round(intro.match_score * 100)}%
                  </span>
                )}
                <PortalBadge variant={introVariant[intro.status]} dot>
                  {statusLabels[intro.status]}
                </PortalBadge>
              </div>
            </div>

            {/* Tags */}
            {intro.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {intro.tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-[0.18em] rounded-full border border-graphite-line/55 bg-graphite/40 text-ivory-soft/85"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Match reason */}
            {intro.match_reason && (
              <p className="mt-4 font-[family-name:var(--font-editorial)] italic text-[13.5px] leading-[1.7] text-ivory-soft/90">
                {intro.match_reason}
              </p>
            )}

            {/* My own pending request, awaiting The Club */}
            {intro.status === 'suggested' && (
              <div className="mt-4 px-4 py-3 border-l-2 border-bronze/55 bg-bronze/[0.06]">
                <p className="font-[family-name:var(--font-editorial)] italic text-[13px] text-bronze-light">
                  Requested — with The Club for review.
                </p>
              </div>
            )}

            {/* Response — accept / decline once my email has been sent */}
            {intro.status === 'suggested' ? null : intro.mySent &&
              intro.myResponse === 'pending' ? (
              <RespondBlock intro={intro} otherFirst={intro.other.first_name || 'this member'} />
            ) : (
              <div className="mt-4 space-y-2">
                {intro.myResponse === 'accepted' && (
                  <p className="font-[family-name:var(--font-editorial)] italic text-[13px] text-emerald-200">
                    You accepted this introduction.
                  </p>
                )}
                {intro.myResponse === 'declined' && (
                  <p className="font-[family-name:var(--font-editorial)] italic text-[13px] text-rose-300/90">
                    You declined this introduction.
                  </p>
                )}
                {/* The other member's response — status only, never their note */}
                {intro.myResponse === 'accepted' && intro.status !== 'completed' && (
                  <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.24em] text-slate-haze">
                    {intro.otherResponse === 'accepted'
                      ? `${intro.other.first_name || 'They'} accepted too`
                      : intro.otherResponse === 'declined'
                        ? `${intro.other.first_name || 'They'} declined`
                        : `Waiting for ${intro.other.first_name || 'them'} to respond`}
                  </p>
                )}
                {intro.status === 'accepted' && (
                  <div className="px-4 py-3 border-l-2 border-emerald-500/60 bg-emerald-900/15">
                    <p className="font-[family-name:var(--font-editorial)] italic text-[13px] text-emerald-200">
                      You both accepted — The Club will connect you shortly.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Outcome (completed) */}
            {intro.status === 'completed' && intro.outcome && (
              <div className="mt-4 px-4 py-3 border border-graphite-line/55 bg-graphite/40">
                <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light/85 mb-1.5">
                  Outcome
                </p>
                <p className="font-[family-name:var(--font-editorial)] italic text-[13.5px] leading-[1.65] text-ivory-soft">
                  {intro.outcome}
                </p>
              </div>
            )}

            {/* Date */}
            <p className="mt-4 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.28em] text-slate-dim">
              {formatDate(intro.created_at)}
            </p>
          </div>
        </div>
      </PortalCard>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
      <PortalPageHeader
        eyebrow="By Invitation"
        title="Introductions."
        subtitle="Curated by The Club. We make each introduction by hand, only when we think you'll value the conversation."
      />

      {intros.length === 0 ? (
        <PortalEmptyState
          icon={<Handshake size={18} strokeWidth={1.5} />}
          title="No introductions yet."
          description="We'll match you with members who share your interests and ambitions."
        />
      ) : (
        <>
          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 mb-8">
            {(
              [
                { key: 'all', label: 'All', count: intros.length },
                { key: 'requested', label: 'Requested', count: requestedIntros.length },
                { key: 'active', label: 'Active', count: activeIntros.length },
                { key: 'past', label: 'Past', count: pastIntros.length },
              ] as const
            ).map((chip) => {
              const selected = filter === chip.key
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilter(chip.key)}
                  className={
                    selected
                      ? 'px-4 py-1.5 rounded-full border border-bronze bg-bronze/15 text-bronze-light font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em]'
                      : 'px-4 py-1.5 rounded-full border border-graphite-line/60 text-ivory/70 hover:text-bronze-light hover:border-bronze/50 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em]'
                  }
                >
                  {chip.label} · {chip.count}
                </button>
              )
            })}
          </div>

          {(() => {
            const list =
              filter === 'requested'
                ? requestedIntros
                : filter === 'active'
                  ? activeIntros
                  : filter === 'past'
                    ? pastIntros
                    : intros
            if (list.length === 0) {
              return <p className="text-sm text-slate-haze italic">Nothing here yet.</p>
            }
            return (
              <div className="space-y-4">
                {list.map((intro) => (
                  <IntroCard key={intro.id} intro={intro} />
                ))}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
