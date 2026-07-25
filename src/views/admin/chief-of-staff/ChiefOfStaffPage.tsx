'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { formatCurrency } from '@/lib/utils'
import type { ChiefOfStaffReport } from '@/lib/chief-of-staff/generate'
import {
  Loader2,
  Sunrise,
  Users,
  TrendingUp,
  CalendarDays,
  ListTodo,
  PoundSterling,
  AlertTriangle,
  Handshake,
  ArrowRight,
} from 'lucide-react'

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Render **bold** spans inside a line of narrative.
function inlineBold(text: string, keyBase: string): React.ReactNode[] {
  return text.split(/\*\*/).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={`${keyBase}-b${i}`} className="font-semibold text-text">
        {part}
      </strong>
    ) : (
      <span key={`${keyBase}-t${i}`}>{part}</span>
    ),
  )
}

// Lightweight formatter for the AI narrative (it comes back as light markdown:
// **Section** headings, "- " bullets, blank-line paragraphs). Renders it as
// proper typography rather than raw asterisks.
function BriefingNarrative({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let bullets: string[] = []
  const flushBullets = () => {
    if (bullets.length) {
      const items = bullets
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1.5 text-text-muted">
          {items.map((b, i) => (
            <li key={i}>{inlineBold(b, `ul${blocks.length}-${i}`)}</li>
          ))}
        </ul>,
      )
      bullets = []
    }
  }
  lines.forEach((raw, idx) => {
    const line = raw.trim()
    if (!line) {
      flushBullets()
      return
    }
    const heading = /^\*\*(.+?)\*\*:?$/.exec(line)
    if (heading) {
      flushBullets()
      blocks.push(
        <h3
          key={`h-${idx}`}
          className="font-[family-name:var(--font-label)] text-[0.6875rem] font-semibold uppercase tracking-[0.15em] text-gold pt-2"
        >
          {heading[1]}
        </h3>,
      )
      return
    }
    if (/^[-•]\s+/.test(line)) {
      bullets.push(line.replace(/^[-•]\s+/, ''))
      return
    }
    flushBullets()
    blocks.push(
      <p key={`p-${idx}`} className="text-[15px] leading-relaxed text-text">
        {inlineBold(line, `p${idx}`)}
      </p>,
    )
  })
  flushBullets()
  return <div className="space-y-3">{blocks}</div>
}

// Small section heading with an icon, matching the Executive Dashboard.
function SectionHead({
  icon: Icon,
  children,
}: {
  icon: typeof Users
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={16} className="text-gold" />
      <h2 className="text-sm font-medium text-text">{children}</h2>
    </div>
  )
}

export function ChiefOfStaffPage() {
  const [report, setReport] = useState<ChiefOfStaffReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/chief-of-staff/report', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load briefing')
      setReport((json.report ?? null) as ChiefOfStaffReport | null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load briefing')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/chief-of-staff/report', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to generate briefing')
      setReport(json.report as ChiefOfStaffReport)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate briefing')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your briefing…
      </div>
    )
  }

  const d = report?.sections

  return (
    <div className="p-8 max-w-[1400px]">
      <AdminPageHeader
        title="Chief of Staff"
        description="Your single daily leadership briefing — the whole business in one place. Every figure aggregates data already in the system; generated fresh each morning and emailed to you at 7am."
        actions={
          <Button onClick={generate} loading={generating} icon={<Sunrise size={16} />}>
            {report ? "Regenerate today's briefing" : "Generate today's briefing"}
          </Button>
        }
        meta={
          report ? (
            <span className="text-xs text-text-muted">
              Generated {fmtDateTime(report.generated_at)}
            </span>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-accent-warm/40 bg-accent-warm/5 px-5 py-4 text-sm text-accent-warm">
          {error}
        </div>
      )}

      {!report || !d ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Sunrise className="mx-auto mb-4 text-gold" size={32} />
            <p className="text-text font-medium mb-1">No briefing yet</p>
            <p className="text-sm text-text-muted mb-6 max-w-md mx-auto">
              Generate today&apos;s briefing to see memberships, pipeline, events, your team,
              finance and risks summarised in one place.
            </p>
            <Button onClick={generate} loading={generating} icon={<Sunrise size={16} />}>
              Generate today&apos;s briefing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Hero narrative ─────────────────────────────────────────── */}
          <Card className="mb-8 overflow-hidden">
            <div className="bg-gradient-to-br from-gold-muted/40 to-transparent px-7 py-6 border-b border-border">
              <div className="flex items-center gap-2 mb-1">
                <Sunrise size={18} className="text-gold" />
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-gold">
                  Good morning, Sarah
                </p>
              </div>
              <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
                Your daily briefing
              </h2>
            </div>
            <CardContent className="py-6">
              <BriefingNarrative text={report.narrative} />
            </CardContent>
          </Card>

          {/* ── Memberships ────────────────────────────────────────────── */}
          <div className="mb-8">
            <SectionHead icon={Users}>Memberships</SectionHead>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Link href="/dashboard/members" className="block transition-transform hover:-translate-y-0.5">
                <StatCard
                  label="Active members"
                  value={d.memberships.active.toLocaleString('en-GB')}
                  changeText="live memberships"
                  changeType="positive"
                />
              </Link>
              <Link href="/dashboard/applications" className="block transition-transform hover:-translate-y-0.5">
                <StatCard
                  label="Pending applications"
                  value={d.memberships.pending.toLocaleString('en-GB')}
                  changeText="awaiting decision"
                  changeType={d.memberships.pending > 0 ? 'negative' : 'neutral'}
                />
              </Link>
              <StatCard
                label="Renewing"
                value={d.memberships.renewingIn30.toLocaleString('en-GB')}
                changeText="next 30 days"
                changeType={d.memberships.renewingIn30 > 0 ? 'negative' : 'neutral'}
              />
            </div>
          </div>

          {/* ── Two-column section grid ────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Sales / pipeline */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-gold" />
                  <CardTitle>Sales pipeline</CardTitle>
                </div>
                <Link
                  href="/dashboard/pipeline"
                  className="shrink-0 inline-flex items-center gap-1.5 text-sm text-gold hover:text-bronze transition-colors"
                >
                  Open <ArrowRight size={14} />
                </Link>
              </CardHeader>
              <CardContent>
                <p className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text mb-1">
                  {formatCurrency(d.pipeline.totalOpenPence)}
                </p>
                <p className="text-xs text-text-muted mb-4">
                  Open opportunity (New · Qualified · Proposal)
                </p>
                <dl className="space-y-2">
                  {[
                    ['Membership', d.pipeline.byStream.membership],
                    ['Sponsorship', d.pipeline.byStream.sponsorship],
                    ['Concierge', d.pipeline.byStream.concierge],
                    ['Introductions', d.pipeline.byStream.introductions],
                    ['Commission owed', d.pipeline.byStream.commission],
                  ].map(([label, pence]) => (
                    <div key={label as string} className="flex items-center justify-between text-sm">
                      <dt className="text-text-muted">{label}</dt>
                      <dd className="font-medium text-text tabular-nums">
                        {formatCurrency(pence as number)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            {/* Finance + introductions */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <PoundSterling size={16} className="text-gold" />
                  <CardTitle>Finance</CardTitle>
                </div>
                <Link
                  href="/dashboard/finance"
                  className="shrink-0 inline-flex items-center gap-1.5 text-sm text-gold hover:text-bronze transition-colors"
                >
                  Open <ArrowRight size={14} />
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
                      {formatCurrency(d.finance.debtorsPence)}
                    </p>
                    <p className="text-xs text-text-muted">
                      Debtors ·{' '}
                      <span className={d.finance.overdueInvoiceCount > 0 ? 'text-accent-warm' : ''}>
                        {d.finance.overdueInvoiceCount} overdue
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
                      {formatCurrency(d.finance.mrrPence)}
                    </p>
                    <p className="text-xs text-text-muted">Recurring monthly revenue</p>
                  </div>
                </div>
                <div className="border-t border-border pt-3 flex items-center gap-2 text-sm text-text-muted">
                  <Handshake size={14} className="text-gold" />
                  <Link href="/dashboard/introductions" className="hover:text-text transition-colors">
                    <span className="font-medium text-text">{d.introductions.toFollowUp}</span>{' '}
                    introduction{d.introductions.toFollowUp === 1 ? '' : 's'} to follow up
                  </Link>
                  <span className="text-text-dim">· {d.introductions.thisMonth} this month</span>
                </div>
              </CardContent>
            </Card>

            {/* Events */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays size={16} className="text-gold" />
                  <CardTitle>Events</CardTitle>
                </div>
                <Link
                  href="/dashboard/events"
                  className="shrink-0 inline-flex items-center gap-1.5 text-sm text-gold hover:text-bronze transition-colors"
                >
                  Open <ArrowRight size={14} />
                </Link>
              </CardHeader>
              <CardContent>
                {d.events.deadlinesThisWeek > 0 && (
                  <div className="mb-3">
                    <Badge variant="upcoming">
                      {d.events.deadlinesThisWeek} sponsor deadline
                      {d.events.deadlinesThisWeek === 1 ? '' : 's'} this week
                    </Badge>
                  </div>
                )}
                {d.events.upcoming.length === 0 ? (
                  <p className="text-sm text-text-muted">Nothing in the next fortnight.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {d.events.upcoming.map((e) => (
                      <li key={`${e.title}-${e.start_date}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-text">{e.title}</span>
                        <span className="shrink-0 text-text-muted tabular-nums">
                          {fmtDay(e.start_date)}
                          <span className="text-text-dim">
                            {' · '}
                            {e.daysAway === 0 ? 'today' : `${e.daysAway}d`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Team */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ListTodo size={16} className="text-gold" />
                  <CardTitle>Team</CardTitle>
                </div>
                <Link
                  href="/dashboard/accountability/tasks"
                  className="shrink-0 inline-flex items-center gap-1.5 text-sm text-gold hover:text-bronze transition-colors"
                >
                  Open <ArrowRight size={14} />
                </Link>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm">
                  <span
                    className={`font-[family-name:var(--font-heading)] text-2xl font-semibold ${
                      d.team.overdueCount > 0 ? 'text-accent-warm' : 'text-text'
                    }`}
                  >
                    {d.team.overdueCount}
                  </span>{' '}
                  <span className="text-text-muted">overdue task{d.team.overdueCount === 1 ? '' : 's'}</span>
                </p>
                {d.team.overdueTasks.length === 0 ? (
                  <p className="text-sm text-text-muted">The board is clear — nothing overdue.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {d.team.overdueTasks.map((t, i) => (
                      <li key={`${t.title}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-text">{t.title}</span>
                        <span className="shrink-0 text-text-muted">
                          {t.owner}
                          {t.deadline && (
                            <span className="text-text-dim"> · {fmtDay(t.deadline)}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Risks ──────────────────────────────────────────────────── */}
          <Card className="mb-4">
            <CardHeader className="flex flex-row items-center gap-2">
              <AlertTriangle size={16} className="text-accent-warm" />
              <CardTitle>Risks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-text-muted mb-2">
                    Members at risk
                  </p>
                  {d.risks.membersAtRisk.length === 0 ? (
                    <p className="text-sm text-text-muted">None flagged.</p>
                  ) : (
                    <ul className="space-y-2">
                      {d.risks.membersAtRisk.map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                          <Link
                            href={`/dashboard/members/${m.id}`}
                            className="truncate text-text hover:text-gold transition-colors"
                          >
                            {m.name}
                          </Link>
                          <Badge variant="urgent">{m.churn}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-text-muted mb-2">
                    Sponsor assets missing
                  </p>
                  <p
                    className={`font-[family-name:var(--font-heading)] text-3xl font-semibold ${
                      d.risks.sponsorAssetsMissing > 0 ? 'text-accent-warm' : 'text-text'
                    }`}
                  >
                    {d.risks.sponsorAssetsMissing}
                  </p>
                  <p className="text-xs text-text-muted mt-1">due before an upcoming event</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-text-muted mb-2">
                    Accountant tasks overdue
                  </p>
                  <p
                    className={`font-[family-name:var(--font-heading)] text-3xl font-semibold ${
                      d.risks.accountantOverdue > 0 ? 'text-accent-warm' : 'text-text'
                    }`}
                  >
                    {d.risks.accountantOverdue}
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    <Link href="/dashboard/accountability/finance" className="hover:text-gold transition-colors">
                      finance deliverables past due
                    </Link>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
