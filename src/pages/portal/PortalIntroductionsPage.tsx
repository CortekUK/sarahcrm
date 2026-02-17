import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuth } from '../../providers/AuthProvider'
import { Card, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Avatar } from '../../components/ui/Avatar'
import { formatDate } from '../../lib/utils'
import { Handshake } from 'lucide-react'
import type { Database } from '../../types/database'

type IntroStatus = Database['public']['Enums']['intro_status']

interface IntroRow {
  id: string
  status: IntroStatus
  match_score: number | null
  match_reason: string | null
  outcome: string | null
  created_at: string
  other_member_id: string
  other: {
    first_name: string | null
    last_name: string | null
    company_name: string | null
    avatar_url: string | null
    job_title: string | null
  }
  tags: string[]
}

const introVariant: Record<IntroStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  suggested: 'draft', approved: 'upcoming', sent: 'info', accepted: 'active', completed: 'active', declined: 'urgent',
}

const statusLabels: Record<IntroStatus, string> = {
  suggested: 'Suggested', approved: 'Approved', sent: 'Sent', accepted: 'Accepted', completed: 'Completed', declined: 'Declined',
}

export function PortalIntroductionsPage() {
  const { user } = useAuth()
  const [intros, setIntros] = useState<IntroRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id) fetchIntros(user.id)
  }, [user?.id])

  async function fetchIntros(userId: string) {
    // Get member ID
    const { data: memberData } = await supabase
      .from('members')
      .select('id')
      .eq('profile_id', userId)
      .single()

    if (!memberData) { setLoading(false); return }
    const memberId = memberData.id

    // Fetch intros from both sides
    const [introsARes, introsBRes] = await Promise.all([
      supabase
        .from('introductions')
        .select('id, status, match_score, match_reason, outcome, created_at, member_b_id, members!introductions_member_b_id_fkey(profiles(first_name, last_name, company_name, avatar_url, job_title))')
        .eq('member_a_id', memberId)
        .order('created_at', { ascending: false }),
      supabase
        .from('introductions')
        .select('id, status, match_score, match_reason, outcome, created_at, member_a_id, members!introductions_member_a_id_fkey(profiles(first_name, last_name, company_name, avatar_url, job_title))')
        .eq('member_b_id', memberId)
        .order('created_at', { ascending: false }),
    ])

    // Collect other member IDs for tag resolution
    const allIntros: IntroRow[] = []
    const otherMemberIds: string[] = []

    for (const row of (introsARes.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const m = row.members as { profiles: { first_name: string | null; last_name: string | null; company_name: string | null; avatar_url: string | null; job_title: string | null } } | undefined
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
        other: m ? m.profiles : { first_name: null, last_name: null, company_name: null, avatar_url: null, job_title: null },
        tags: [],
      })
    }
    for (const row of (introsBRes.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const m = row.members as { profiles: { first_name: string | null; last_name: string | null; company_name: string | null; avatar_url: string | null; job_title: string | null } } | undefined
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
        other: m ? m.profiles : { first_name: null, last_name: null, company_name: null, avatar_url: null, job_title: null },
        tags: [],
      })
    }

    // Fetch tags for all other members
    if (otherMemberIds.length > 0) {
      const { data: mtData } = await supabase
        .from('member_tags')
        .select('member_id, tags(name)')
        .in('member_id', otherMemberIds)

      if (mtData) {
        const tagsByMember: Record<string, string[]> = {}
        for (const row of mtData as unknown as Array<{ member_id: string; tags: { name: string } }>) {
          if (!tagsByMember[row.member_id]) tagsByMember[row.member_id] = []
          tagsByMember[row.member_id].push(row.tags.name)
        }
        for (const intro of allIntros) {
          intro.tags = tagsByMember[intro.other_member_id] ?? []
        }
      }
    }

    allIntros.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setIntros(allIntros)
    setLoading(false)
  }

  const activeIntros = useMemo(
    () => intros.filter((i) => !['completed', 'declined'].includes(i.status)),
    [intros]
  )
  const pastIntros = useMemo(
    () => intros.filter((i) => ['completed', 'declined'].includes(i.status)),
    [intros]
  )

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12">
        <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
        <span className="text-sm text-text-muted">Loading introductions...</span>
      </div>
    )
  }

  function IntroCard({ intro }: { intro: IntroRow }) {
    const otherName = `${intro.other.first_name ?? ''} ${intro.other.last_name ?? ''}`.trim()

    return (
      <Card>
        <CardContent className="py-5">
          <div className="flex gap-4">
            <Avatar
              name={otherName || '?'}
              src={intro.other.avatar_url}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-1">
                <div>
                  <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-text">
                    {otherName || 'Unknown'}
                  </h3>
                  {intro.other.company_name && (
                    <p className="text-sm text-text-muted">{intro.other.company_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {intro.match_score != null && (
                    <span className="text-sm font-semibold text-gold">
                      {Math.round(intro.match_score * 100)}%
                    </span>
                  )}
                  <Badge variant={introVariant[intro.status]} dot>
                    {statusLabels[intro.status]}
                  </Badge>
                </div>
              </div>

              {/* Tags */}
              {intro.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {intro.tags.slice(0, 5).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-[0.6875rem] rounded-full bg-surface-2 text-text-muted border border-border"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Match reason */}
              {intro.match_reason && (
                <p className="text-sm text-text-muted mt-3 leading-relaxed">
                  {intro.match_reason}
                </p>
              )}

              {/* Status-specific messages */}
              {intro.status === 'accepted' && (
                <div className="mt-3 px-3 py-2 rounded-[var(--radius-md)] bg-[rgba(91,123,106,0.06)] border border-[rgba(91,123,106,0.15)]">
                  <p className="text-sm text-[#5B7B6A]">
                    Introduction in progress — we'll follow up soon.
                  </p>
                </div>
              )}

              {intro.status === 'sent' && (
                <div className="mt-3 px-3 py-2 rounded-[var(--radius-md)] bg-gold-muted border border-border-gold">
                  <p className="text-sm text-gold">
                    Introduction sent — waiting for a response.
                  </p>
                </div>
              )}

              {/* Outcome (completed) */}
              {intro.status === 'completed' && intro.outcome && (
                <div className="mt-3 px-3 py-2 rounded-[var(--radius-md)] bg-surface-2 border border-border">
                  <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">
                    Outcome
                  </p>
                  <p className="text-sm text-text-muted">{intro.outcome}</p>
                </div>
              )}

              {/* Date */}
              <p className="text-xs text-text-dim mt-3">{formatDate(intro.created_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          Introductions
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Your curated introductions to fellow members
        </p>
      </div>

      {intros.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Handshake size={32} className="text-text-dim mx-auto mb-3" strokeWidth={1} />
            <p className="text-text-dim mb-1">No introductions yet</p>
            <p className="text-xs text-text-dim">
              We'll match you with members who share your interests and needs
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Active introductions */}
          {activeIntros.length > 0 && (
            <div>
              <h2 className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-4">
                Active ({activeIntros.length})
              </h2>
              <div className="space-y-4">
                {activeIntros.map((intro) => (
                  <IntroCard key={intro.id} intro={intro} />
                ))}
              </div>
            </div>
          )}

          {/* Past introductions */}
          {pastIntros.length > 0 && (
            <div>
              <h2 className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-4">
                Past ({pastIntros.length})
              </h2>
              <div className="space-y-4">
                {pastIntros.map((intro) => (
                  <IntroCard key={intro.id} intro={intro} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
