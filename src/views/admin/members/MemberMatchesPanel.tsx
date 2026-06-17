'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Sparkles, HelpCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { scoreMatches, type MatchCandidate, type MatchResult } from '@/lib/introductions/matching'
import { IntroComposeModal, type ComposeMember } from '@/views/admin/introductions/IntroComposeModal'

interface WhyFact { label: string; value: string }
interface WhyData {
  reasoning: { summary: string; points: string[] }
  target: { name: string; facts: WhyFact[] }
  other: { name: string; facts: WhyFact[] }
}

const CATEGORY_STYLES: Record<string, string> = {
  industry: 'bg-gold-muted text-gold border border-border-gold',
  interest: 'bg-[rgba(90,123,150,0.1)] text-[#5A7B96] border border-[rgba(90,123,150,0.25)]',
  need: 'bg-[rgba(111,143,122,0.1)] text-[#5C8A6B] border border-[rgba(111,143,122,0.3)]',
  service: 'bg-surface-2 text-text-muted border border-border',
}

interface SideInitial {
  sentAt: string | null
  scheduledAt: string | null
  response?: 'pending' | 'accepted' | 'declined'
}

interface ComposeState {
  introId: string
  a: ComposeMember
  b: ComposeMember
  matchReason: string | null
  otherId: string
  initial: { a: SideInitial; b: SideInitial } | null
}

// Per-recipient status of one email in an introduction.
interface SideStatus {
  sent: boolean
  scheduledAt: string | null
  response: 'pending' | 'accepted' | 'declined'
  note: string | null
}

// An existing introduction involving this member — stays visible always,
// tracking each side independently.
interface ActiveIntro {
  introId: string
  other: MatchCandidate
  score: number | null
  matchReason: string | null
  status: string
  createdAt: string
  target: SideStatus // the email to THIS member
  otherSide: SideStatus // the email to the other member
  outcome: string | null
  estimatedValuePence: number | null
  businessConverted: boolean
}

// All introductions with one counterpart, newest first.
interface IntroGroup {
  other: MatchCandidate
  items: ActiveIntro[]
}

function sideLabel(s: SideStatus): { text: string; cls: string } {
  if (s.response === 'accepted') return { text: 'Accepted', cls: 'text-accent' }
  if (s.response === 'declined') return { text: 'Declined', cls: 'text-accent-warm' }
  if (s.sent) return { text: 'Sent · awaiting reply', cls: 'text-gold' }
  if (s.scheduledAt) return { text: `Scheduled · ${s.scheduledAt}`, cls: 'text-gold' }
  return { text: 'Not sent', cls: 'text-text-dim' }
}

export function MemberMatchesPanel({
  memberId,
  memberName,
  refreshKey,
}: {
  memberId: string
  memberName: string
  refreshKey: number
}) {
  const [results, setResults] = useState<MatchResult[]>([])
  const [groups, setGroups] = useState<IntroGroup[]>([])
  const [historyGroup, setHistoryGroup] = useState<IntroGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [noTags, setNoTags] = useState(false)
  const [compose, setCompose] = useState<ComposeState | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  // Outcome capture (after both accept)
  const [outcomeIntro, setOutcomeIntro] = useState<ActiveIntro | null>(null)
  const [outcomeText, setOutcomeText] = useState('')
  const [outcomeValue, setOutcomeValue] = useState('')
  const [outcomeConverted, setOutcomeConverted] = useState(false)
  const [savingOutcome, setSavingOutcome] = useState(false)

  function openOutcome(item: ActiveIntro) {
    setOutcomeIntro(item)
    setOutcomeText(item.outcome ?? '')
    setOutcomeValue(item.estimatedValuePence != null ? String(item.estimatedValuePence / 100) : '')
    setOutcomeConverted(item.businessConverted)
  }

  async function saveOutcome() {
    if (!outcomeIntro) return
    setSavingOutcome(true)
    const pounds = parseFloat(outcomeValue)
    const { error } = await supabase
      .from('introductions')
      .update({
        outcome: outcomeText.trim() || null,
        estimated_value_pence: Number.isFinite(pounds) ? Math.round(pounds * 100) : null,
        business_converted: outcomeConverted,
        status: 'completed',
        followed_up_at: new Date().toISOString(),
      })
      .eq('id', outcomeIntro.introId)
    setSavingOutcome(false)
    if (error) {
      toast({ title: 'Could not save outcome', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Outcome recorded' })
    setOutcomeIntro(null)
    compute()
  }
  // "Why this match?" AI dialog
  const [whyOpen, setWhyOpen] = useState(false)
  const [whyLoading, setWhyLoading] = useState(false)
  const [whyData, setWhyData] = useState<WhyData | null>(null)
  const [whyName, setWhyName] = useState('')

  async function openWhy(match: MatchResult) {
    setWhyOpen(true)
    setWhyLoading(true)
    setWhyData(null)
    setWhyName(match.member.name)
    try {
      const res = await fetch('/api/admin/introductions/why', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, other_id: match.member.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not explain match', description: json.error, variant: 'destructive' })
        setWhyOpen(false)
        return
      }
      setWhyData(json as WhyData)
    } finally {
      setWhyLoading(false)
    }
  }

  const compute = useCallback(async () => {
    setLoading(true)
    setNoTags(false)

    const { data: membersData } = await supabase
      .from('members')
      .select('id, company_name, profiles(first_name, last_name, company_name, email)')
      .eq('membership_status', 'active')
      .is('deleted_at', null)

    const { data: allMemberTags } = await supabase
      .from('member_tags')
      .select('member_id, tag_id, tags(name, category)')

    const { data: existingIntros } = await supabase
      .from('introductions')
      .select(
        'id, status, created_at, member_a_id, member_b_id, match_reason, match_score, email_a_sent_at, email_b_sent_at, email_a_scheduled_at, email_b_scheduled_at, member_a_response, member_b_response, member_a_response_note, member_b_response_note, outcome, estimated_value_pence, business_converted',
      )
      .or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId}`)

    const tagMap = new Map<string, { tagId: string; name: string; category: string }[]>()
    for (const row of (allMemberTags ?? []) as unknown as Array<{
      member_id: string
      tag_id: string
      tags: { name: string; category: string } | null
    }>) {
      if (!row.tags) continue
      const arr = tagMap.get(row.member_id) ?? []
      arr.push({ tagId: row.tag_id, name: row.tags.name, category: row.tags.category })
      tagMap.set(row.member_id, arr)
    }

    const candidates: MatchCandidate[] = ((membersData ?? []) as unknown as Array<{
      id: string
      company_name: string | null
      profiles: { first_name: string | null; last_name: string | null; company_name: string | null; email: string | null } | null
    }>).map((m) => ({
      id: m.id,
      name: `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim() || 'Unnamed',
      company: m.company_name ?? m.profiles?.company_name ?? null,
      email: m.profiles?.email ?? null,
      tags: tagMap.get(m.id) ?? [],
    }))

    // Build the list of existing introductions (always shown) + exclusion set.
    const byId = new Map(candidates.map((c) => [c.id, c]))
    const exclude = new Set<string>()
    const activeList: ActiveIntro[] = []
    for (const intro of (existingIntros ?? []) as unknown as Array<Record<string, unknown>>) {
      const memberAId = intro.member_a_id as string
      const memberBId = intro.member_b_id as string
      const targetIsA = memberAId === memberId
      const otherId = targetIsA ? memberBId : memberAId
      // A pair is represented in the Introductions list (with "Create
      // introduction" to start a fresh one), so never re-suggest them.
      exclude.add(otherId)
      const other = byId.get(otherId)
      if (!other) continue
      const sideOf = (which: 'a' | 'b'): SideStatus => ({
        sent: Boolean(intro[`email_${which}_sent_at`]),
        scheduledAt: (intro[`email_${which}_scheduled_at`] as string | null) ?? null,
        response: (intro[`member_${which}_response`] as SideStatus['response']) ?? 'pending',
        note: (intro[`member_${which}_response_note`] as string | null) ?? null,
      })
      activeList.push({
        introId: intro.id as string,
        other,
        score: (intro.match_score as number | null) ?? null,
        matchReason: (intro.match_reason as string | null) ?? null,
        status: intro.status as string,
        createdAt: (intro.created_at as string) ?? '',
        target: sideOf(targetIsA ? 'a' : 'b'),
        otherSide: sideOf(targetIsA ? 'b' : 'a'),
        outcome: (intro.outcome as string | null) ?? null,
        estimatedValuePence: (intro.estimated_value_pence as number | null) ?? null,
        businessConverted: Boolean(intro.business_converted),
      })
    }

    // Group by counterpart, newest intro first within each group.
    const groupMap = new Map<string, ActiveIntro[]>()
    for (const it of activeList) {
      const arr = groupMap.get(it.other.id) ?? []
      arr.push(it)
      groupMap.set(it.other.id, arr)
    }
    const groupList: IntroGroup[] = [...groupMap.entries()].map(([, items]) => {
      items.sort((x, y) => (y.createdAt > x.createdAt ? 1 : -1))
      return { other: items[0].other, items }
    })
    // Most-recently-touched group first.
    groupList.sort((g1, g2) => (g2.items[0].createdAt > g1.items[0].createdAt ? 1 : -1))
    setGroups(groupList)

    const target = candidates.find((c) => c.id === memberId)
    if (!target || target.tags.length === 0) {
      setNoTags(true)
      setResults([])
      setLoading(false)
      return
    }
    setNoTags(false)
    setResults(scoreMatches(memberId, memberName, candidates, exclude))
    setLoading(false)
  }, [memberId, memberName])

  useEffect(() => {
    compute()
  }, [compute, refreshKey])

  // introId set → operate on that existing introduction (Manage / approve a
  // request). Omitted → create a brand-new introduction for a fresh match.
  async function handleApprove(match: MatchResult, introId?: string) {
    setApprovingId(match.member.id)
    try {
      const res = await fetch('/api/admin/introductions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          introId
            ? { introduction_id: introId }
            : {
                target_member_id: memberId,
                match_member_id: match.member.id,
                match_score: match.score,
                match_reason: match.matchReason,
              },
        ),
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
        matchReason: match.matchReason,
        otherId: match.member.id,
        initial: (json.state as ComposeState['initial']) ?? null,
      })
    } finally {
      setApprovingId(null)
    }
  }

  if (noTags && groups.length === 0) return null

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-gold-light to-gold text-white shadow-[0_3px_10px_rgba(184,151,90,0.35)]">
            <Sparkles size={14} strokeWidth={1.75} />
          </div>
          <CardTitle>Suggested introductions</CardTitle>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-gold-muted text-gold border border-border-gold font-[family-name:var(--font-label)] text-[9px] font-semibold uppercase tracking-[0.18em]">
            AI matched
          </span>
        </div>
        <p className="text-sm text-text-muted mt-1">
          AI surfaced these members as the strongest fits for {memberName}. Tap <span className="text-gold font-medium">Why?</span> to see the reasoning, then Approve to compose and send (or schedule) the introduction.
        </p>
      </CardHeader>
      <CardContent>
        {/* Introductions — one card per person (latest intro), history behind it */}
        {groups.length > 0 && (
          <div className="mb-5">
            <p className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.15em] text-text-muted mb-2">
              Introductions · {groups.length}
            </p>
            <div className="space-y-2">
              {groups.map((group) => {
                const latest = group.items[0]
                const prevCount = group.items.length - 1
                const bothAccepted = latest.target.response === 'accepted' && latest.otherSide.response === 'accepted'
                const anyDeclined = latest.target.response === 'declined' || latest.otherSide.response === 'declined'
                const completed = latest.status === 'completed'
                const terminal = completed || latest.status === 'declined'
                const t = sideLabel(latest.target)
                const o = sideLabel(latest.otherSide)
                return (
                  <div
                    key={group.other.id}
                    className="p-4 bg-surface border border-border-gold rounded-[var(--radius-lg)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <p className="font-medium text-text">{group.other.name}</p>
                          {latest.score != null && (
                            <span className="text-sm font-medium text-gold">{Math.round(latest.score * 100)}%</span>
                          )}
                          {completed ? (
                            <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/25 text-[9px] uppercase tracking-[0.12em]">
                              Completed
                            </span>
                          ) : bothAccepted ? (
                            <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/25 text-[9px] uppercase tracking-[0.12em]">
                              Ready to connect
                            </span>
                          ) : anyDeclined ? (
                            <span className="px-2 py-0.5 rounded-full bg-accent-warm/10 text-accent-warm border border-accent-warm/25 text-[9px] uppercase tracking-[0.12em]">
                              Declined
                            </span>
                          ) : null}
                        </div>
                        {group.other.company && (
                          <p className="text-sm text-text-muted">{group.other.company}</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                        {prevCount > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setHistoryGroup(group)}>
                            Previous · {prevCount}
                          </Button>
                        )}
                        {completed && (
                          <Button size="sm" variant="ghost" onClick={() => openOutcome(latest)}>
                            Edit outcome
                          </Button>
                        )}
                        {bothAccepted && !completed && (
                          <Button size="sm" onClick={() => openOutcome(latest)}>
                            Record outcome
                          </Button>
                        )}
                        {terminal ? (
                          <Button
                            size="sm"
                            loading={approvingId === group.other.id}
                            onClick={() =>
                              handleApprove({ member: group.other, score: latest.score ?? 0, sharedTags: [], matchReason: latest.matchReason ?? '' })
                            }
                          >
                            Create introduction
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={approvingId === group.other.id}
                            onClick={() =>
                              handleApprove(
                                { member: group.other, score: latest.score ?? 0, sharedTags: [], matchReason: latest.matchReason ?? '' },
                                latest.introId,
                              )
                            }
                          >
                            Manage
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* Per-side status */}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="rounded-[var(--radius-md)] bg-surface-2 border border-border px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-text-dim">Email to {memberName}</p>
                        <p className={`text-sm font-medium ${t.cls}`}>{t.text}</p>
                        {latest.target.note && (
                          <p className="mt-1 text-xs text-text-muted italic border-l-2 border-border-gold pl-2">
                            “{latest.target.note}”
                          </p>
                        )}
                      </div>
                      <div className="rounded-[var(--radius-md)] bg-surface-2 border border-border px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-text-dim">Email to {group.other.name}</p>
                        <p className={`text-sm font-medium ${o.cls}`}>{o.text}</p>
                        {latest.otherSide.note && (
                          <p className="mt-1 text-xs text-text-muted italic border-l-2 border-border-gold pl-2">
                            “{latest.otherSide.note}”
                          </p>
                        )}
                      </div>
                    </div>

                    {bothAccepted && !completed && (
                      <p className="mt-3 text-xs text-text-muted">
                        Both accepted — connect them, then <span className="text-gold font-medium">record the outcome</span> and the value it generated.
                      </p>
                    )}

                    {(latest.outcome || latest.estimatedValuePence != null) && (
                      <div className="mt-3 rounded-[var(--radius-md)] bg-gold-muted/40 border border-border-gold px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-gold mb-0.5">Outcome</p>
                        {latest.outcome && <p className="text-sm text-text italic">“{latest.outcome}”</p>}
                        {(latest.estimatedValuePence != null || latest.businessConverted) && (
                          <p className="text-sm text-text-muted mt-0.5">
                            {latest.estimatedValuePence != null && (
                              <span className="font-medium text-text">
                                £{(latest.estimatedValuePence / 100).toLocaleString('en-GB')}
                              </span>
                            )}
                            {latest.businessConverted && <span className="ml-2 text-accent">· business converted</span>}
                          </p>
                        )}
                      </div>
                    )}

                    {terminal && (
                      <p className="mt-3 text-xs text-text-muted">
                        This introduction is {latest.status}. Use <span className="text-gold font-medium">Create introduction</span> to start a fresh one with {group.other.name}.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {noTags ? null : loading ? (
          <p className="text-sm text-text-dim">Finding matches…</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-text-dim">No more matches — add more tags to this and other members.</p>
        ) : (
          <div className="space-y-3">
            {results.map((result) => {
              return (
                <div
                  key={result.member.id}
                  className="flex items-start justify-between p-4 bg-surface border border-border rounded-[var(--radius-lg)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-text">{result.member.name}</p>
                      <span className="text-sm font-medium text-gold">
                        {Math.round(result.score * 100)}%
                      </span>
                    </div>
                    {(result.member.company || result.member.email) && (
                      <p className="text-sm text-text-muted mb-2">
                        {result.member.company}
                        {result.member.company && result.member.email && (
                          <span className="text-text-dim"> · </span>
                        )}
                        {result.member.email && (
                          <span className="text-text-dim">{result.member.email}</span>
                        )}
                      </p>
                    )}
                    {result.matchReason && (
                      <p className="text-xs text-text-dim italic mb-2">{result.matchReason}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {result.member.tags.map((tag, i) => {
                        const isShared = result.sharedTags.includes(tag.name)
                        return (
                          <span
                            key={i}
                            className={
                              isShared
                                ? `px-2 py-0.5 text-xs rounded-full ${CATEGORY_STYLES[tag.category] ?? CATEGORY_STYLES.service}`
                                : 'px-2 py-0.5 text-xs rounded-full bg-surface-2 text-text-dim border border-border'
                            }
                          >
                            {tag.name}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div className="ml-4 shrink-0 flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => openWhy(result)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gold hover:text-gold-dark transition-colors"
                    >
                      <Sparkles size={13} /> Why?
                    </button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={approvingId === result.member.id}
                      onClick={() => handleApprove(result)}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <IntroComposeModal
        open={Boolean(compose)}
        onClose={() => {
          setCompose(null)
          compute() // approved-but-unsent shows in "ready to send" right away
        }}
        introId={compose?.introId ?? null}
        memberA={compose?.a ?? null}
        memberB={compose?.b ?? null}
        matchReason={compose?.matchReason ?? null}
        initial={compose?.initial ?? null}
        onSent={() => {
          setCompose(null)
          compute() // refresh the in-progress statuses
        }}
      />

      {/* Previous introductions with this person */}
      <Modal
        open={Boolean(historyGroup)}
        onClose={() => setHistoryGroup(null)}
        title={historyGroup ? `Introductions with ${historyGroup.other.name}` : 'History'}
        size="md"
      >
        {historyGroup && (
          <div className="space-y-2">
            {historyGroup.items.map((it, idx) => {
              const both = it.target.response === 'accepted' && it.otherSide.response === 'accepted'
              const declined = it.target.response === 'declined' || it.otherSide.response === 'declined'
              const label =
                it.status === 'completed'
                  ? 'Completed'
                  : declined
                    ? 'Declined'
                    : both
                      ? 'Ready to connect'
                      : it.status.charAt(0).toUpperCase() + it.status.slice(1)
              return (
                <div key={it.introId} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text">
                      {idx === 0 ? 'Latest' : `#${historyGroup.items.length - idx}`} · {label}
                    </span>
                    <span className="text-xs text-text-dim">{it.createdAt ? formatDate(it.createdAt) : ''}</span>
                  </div>
                  {it.matchReason && <p className="text-xs text-text-muted italic mt-1">{it.matchReason}</p>}
                  {it.outcome && (
                    <p className="text-xs text-text mt-1">
                      <span className="text-gold">Outcome:</span> “{it.outcome}”
                      {it.estimatedValuePence != null && (
                        <span className="ml-1 font-medium">
                          · £{(it.estimatedValuePence / 100).toLocaleString('en-GB')}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {/* Record outcome */}
      <Modal open={Boolean(outcomeIntro)} onClose={() => !savingOutcome && setOutcomeIntro(null)} title="Record outcome" size="md">
        {outcomeIntro && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Capture what came of introducing <span className="text-text font-medium">{memberName}</span> and{' '}
              <span className="text-text font-medium">{outcomeIntro.other.name}</span>.
            </p>
            <div>
              <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
                Outcome note
              </label>
              <textarea
                value={outcomeText}
                onChange={(e) => setOutcomeText(e.target.value)}
                rows={3}
                placeholder="e.g. Met for coffee; Northstar is exploring a seed round into Gamma."
                className="w-full px-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none focus:border-gold resize-y"
              />
            </div>
            <div>
              <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
                Value generated (£)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim text-sm">£</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={outcomeValue}
                  onChange={(e) => setOutcomeValue(e.target.value)}
                  placeholder="0"
                  className="w-full pl-7 pr-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none focus:border-gold"
                />
              </div>
              <p className="text-xs text-text-dim mt-1">Estimated value of business from this introduction.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
              <input type="checkbox" checked={outcomeConverted} onChange={(e) => setOutcomeConverted(e.target.checked)} />
              Business converted (a deal happened)
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setOutcomeIntro(null)} disabled={savingOutcome}>
                Cancel
              </Button>
              <Button onClick={saveOutcome} loading={savingOutcome}>
                Save outcome
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Why this match — AI reasoning */}
      <Modal open={whyOpen} onClose={() => setWhyOpen(false)} title="Why this match?" size="lg">
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-gold-light to-gold text-white shadow-[0_3px_10px_rgba(184,151,90,0.35)]">
              <Sparkles size={14} strokeWidth={1.75} className={whyLoading ? 'animate-pulse' : ''} />
            </div>
            <p className="text-sm text-text">
              <span className="font-medium">{memberName}</span>
              <span className="text-text-muted"> &amp; </span>
              <span className="font-medium">{whyName}</span>
            </p>
          </div>

          {whyLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-5 rounded bg-surface-2 animate-pulse" style={{ width: `${90 - i * 12}%` }} />
              ))}
              <p className="flex items-center gap-1.5 text-xs text-gold pt-1">
                <Sparkles size={12} className="animate-pulse" /> Reading both profiles…
              </p>
            </div>
          ) : whyData ? (
            <>
              {/* AI reasoning */}
              <div className="rounded-[var(--radius-lg)] border border-border-gold bg-gold-muted/40 p-4">
                {whyData.reasoning.summary && (
                  <p className="text-sm text-text leading-relaxed">{whyData.reasoning.summary}</p>
                )}
                {whyData.reasoning.points.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {whyData.reasoning.points.map((pt, i) => (
                      <li key={i} className="flex gap-2 text-sm text-text-muted">
                        <Sparkles size={13} className="text-gold mt-0.5 shrink-0" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* The evidence — what each side said */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[whyData.target, whyData.other].map((side, idx) => (
                  <div key={idx} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                    <p className="font-[family-name:var(--font-label)] text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted mb-2">
                      {idx === 0 ? 'What they answered' : 'Their profile'} · {side.name}
                    </p>
                    {side.facts.length === 0 ? (
                      <p className="text-xs text-text-dim italic">No profile detail yet.</p>
                    ) : (
                      <dl className="space-y-1.5">
                        {side.facts.map((f, i) => (
                          <div key={i}>
                            <dt className="text-[10px] uppercase tracking-wide text-text-dim">{f.label}</dt>
                            <dd className="text-xs text-text">{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                ))}
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-text-dim">
                <HelpCircle size={12} /> Reasoning generated by AI from both members&apos; profiles.
              </p>
            </>
          ) : null}
        </div>
      </Modal>
    </Card>
  )
}
