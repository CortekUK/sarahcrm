'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { formatCurrency } from '@/lib/utils'
import {
  Loader2,
  Users,
  Ticket,
  Handshake,
  Sparkles,
  AlertTriangle,
  ArrowUpRight,
  Flame,
  ArrowRight,
} from 'lucide-react'
import {
  membershipStage,
  sponsorshipStage,
  conciergeStage,
  bookingStage,
  introductionStage,
  isOpenStage,
} from '@/lib/pipeline/stages'
import { PipelineStreamsChart, type StreamDatum } from './PipelineStreamsChart'

// ─────────────────────────────────────────────────────────────────────
// Executive Dashboard — a leadership cockpit that AGGREGATES data already
// in the system. Pure read/aggregation: no writes, no migration.
//
// Every number is sourced from the same tables the module pages read, and
// the per-stream pipeline maths reuses the shared stage model
// (src/lib/pipeline/stages.ts) so the figures reconcile with the Pipeline
// board, Finance and Enquiries screens rather than inventing new metrics.
//
// NOTE on the AI recommendation lists: "Members at risk" and "Upsell
// opportunities" read persisted score columns (members.churn_risk_score /
// members.upgrade_potential) which are refreshed by the members
// recompute-scores route — so they reflect the LAST score recompute, not a
// live calculation.
// ─────────────────────────────────────────────────────────────────────

type ProfileLite = { first_name: string | null; last_name: string | null } | null

function personName(p: ProfileLite): string {
  if (!p) return 'Unnamed'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed'
}

interface MembersSummary {
  active: number
  pending: number
  renewing: number
}

interface EventsSummary {
  ticketsSold: number
  guests: number
  sponsorshipPence: number
  revenuePence: number
  costPence: number
}

interface IntrosSummary {
  thisMonth: number
  dealsCreated: number
  revenuePence: number
}

interface SuggestedIntro {
  id: string
  score: number | null
  a: string
  b: string
}

interface RiskMember {
  id: string
  name: string
  company: string | null
  score: number
}

interface UpsellMember {
  id: string
  name: string
  company: string | null
  score: number
}

interface HotProspect {
  id: string
  name: string
  company: string | null
  score: number
}

export function ExecutiveDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<MembersSummary>({ active: 0, pending: 0, renewing: 0 })
  const [streams, setStreams] = useState<StreamDatum[]>([])
  const [events, setEvents] = useState<EventsSummary>({
    ticketsSold: 0,
    guests: 0,
    sponsorshipPence: 0,
    revenuePence: 0,
    costPence: 0,
  })
  const [intros, setIntros] = useState<IntrosSummary>({ thisMonth: 0, dealsCreated: 0, revenuePence: 0 })
  const [suggestedIntros, setSuggestedIntros] = useState<SuggestedIntro[]>([])
  const [atRisk, setAtRisk] = useState<RiskMember[]>([])
  const [upsell, setUpsell] = useState<UpsellMember[]>([])
  const [hotProspects, setHotProspects] = useState<HotProspect[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    // Renewal window — active members whose renewal_date (a plain date) falls
    // in the next 90 days. Compared as YYYY-MM-DD strings, exactly like the
    // Dashboard / Pipeline renewal logic.
    const todayStr = now.toISOString().slice(0, 10)
    const in90Str = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90)
      .toISOString()
      .slice(0, 10)

    const [
      activeMembersRes,
      pendingAppsRes,
      renewingRes,
      appsRes,
      sponsorsRes,
      conciergeRes,
      introsRes,
      bookingsRes,
      expensesRes,
      suggestedRes,
      atRiskRes,
      upsellRes,
      hotRes,
    ] = await Promise.all([
      // ── Members section ───────────────────────────────────────────
      supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('membership_status', 'active')
        .is('deleted_at', null),

      supabase
        .from('membership_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),

      supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('membership_status', 'active')
        .is('deleted_at', null)
        .not('renewal_date', 'is', null)
        .gte('renewal_date', todayStr)
        .lte('renewal_date', in90Str),

      // ── Pipeline streams ──────────────────────────────────────────
      supabase.from('membership_applications').select('id, status, amount_paid_pence'),

      supabase.from('sponsorships').select('amount_pence, status, event_id'),

      supabase
        .from('concierge_requests')
        .select('status, sale_price_pence, quoted_amount_pence, commission_pence, commission_status'),

      supabase
        .from('introductions')
        .select('id, status, deal_status, revenue_pence, created_at, commission_pence, commission_status'),

      supabase.from('bookings').select('status, amount_pence, is_guest').limit(2000),

      supabase.from('event_expenses').select('amount_pence'),

      // ── AI recommendations ────────────────────────────────────────
      // Introductions to make — AI/engine suggestions awaiting review,
      // strongest match first.
      supabase
        .from('introductions')
        .select(
          `id, match_score,
           member_a:members!introductions_member_a_id_fkey(profiles(first_name, last_name)),
           member_b:members!introductions_member_b_id_fkey(profiles(first_name, last_name))`,
        )
        .eq('status', 'suggested')
        .order('match_score', { ascending: false, nullsFirst: false })
        .limit(5),

      // Members at risk — high churn risk (persisted score, last recompute).
      supabase
        .from('members')
        .select('id, company_name, churn_risk_score, profiles(first_name, last_name)')
        .eq('membership_status', 'active')
        .is('deleted_at', null)
        .gte('churn_risk_score', 60)
        .order('churn_risk_score', { ascending: false })
        .limit(5),

      // Upsell opportunities — high upgrade potential (persisted score).
      supabase
        .from('members')
        .select('id, company_name, upgrade_potential, profiles(first_name, last_name)')
        .eq('membership_status', 'active')
        .is('deleted_at', null)
        .gte('upgrade_potential', 70)
        .order('upgrade_potential', { ascending: false })
        .limit(5),

      // Hot prospects — new enquiries with a high lead score.
      supabase
        .from('enquiries')
        .select('id, first_name, last_name, company, lead_score')
        .eq('status', 'new')
        .gte('lead_score', 70)
        .order('lead_score', { ascending: false })
        .limit(5),
    ])

    // ── Members ─────────────────────────────────────────────────────
    setMembers({
      active: activeMembersRes.count ?? 0,
      pending: pendingAppsRes.count ?? 0,
      renewing: renewingRes.count ?? 0,
    })

    // ── Pipeline streams (open = New + Qualified + Proposal) ─────────
    // Membership — open applications, value = amount paid so far.
    let membershipValue = 0
    let membershipCount = 0
    for (const a of (appsRes.data ?? []) as Array<{ status: string; amount_paid_pence: number | null }>) {
      if (isOpenStage(membershipStage(a.status))) {
        membershipValue += a.amount_paid_pence ?? 0
        membershipCount += 1
      }
    }

    // Sponsorship — open packages.
    let sponsorshipValue = 0
    let sponsorshipCount = 0
    for (const s of (sponsorsRes.data ?? []) as Array<{ amount_pence: number | null; status: string | null }>) {
      if (isOpenStage(sponsorshipStage((s.status ?? '').toLowerCase()))) {
        sponsorshipValue += s.amount_pence ?? 0
        sponsorshipCount += 1
      }
    }

    // Concierge — open requests, value = sale price (fallback quoted).
    let conciergeValue = 0
    let conciergeCount = 0
    for (const c of (conciergeRes.data ?? []) as Array<{
      status: string | null
      sale_price_pence: number | null
      quoted_amount_pence: number | null
    }>) {
      if (isOpenStage(conciergeStage((c.status ?? '').toLowerCase()))) {
        conciergeValue += c.sale_price_pence ?? c.quoted_amount_pence ?? 0
        conciergeCount += 1
      }
    }

    // Event — open bookings (i.e. still pending, not yet confirmed/cancelled).
    let eventValue = 0
    let eventCount = 0
    const bookings = (bookingsRes.data ?? []) as Array<{
      status: string | null
      amount_pence: number | null
      is_guest: boolean
    }>
    for (const b of bookings) {
      if (isOpenStage(bookingStage((b.status ?? '').toLowerCase()))) {
        eventValue += b.amount_pence ?? 0
        eventCount += 1
      }
    }

    // Commission (receivable owed to the Club) — introductions + concierge
    // commission still pending. Mirrors the CommissionsPage receivable-owed
    // figure so the numbers reconcile.
    let commissionValue = 0
    let commissionCount = 0
    const introRows = (introsRes.data ?? []) as Array<{
      id: string
      status: string
      deal_status: string | null
      revenue_pence: number | null
      created_at: string
      commission_pence: number | null
      commission_status: string
    }>
    for (const i of introRows) {
      if (i.commission_pence != null && i.commission_status !== 'paid') {
        commissionValue += i.commission_pence
        commissionCount += 1
      }
    }
    for (const c of (conciergeRes.data ?? []) as Array<{
      commission_pence: number | null
      commission_status: string
    }>) {
      if (c.commission_pence != null && c.commission_status !== 'paid') {
        commissionValue += c.commission_pence
        commissionCount += 1
      }
    }

    setStreams([
      { key: 'membership', label: 'Membership', valuePence: membershipValue, count: membershipCount, color: 'var(--color-gold)' },
      { key: 'sponsorship', label: 'Sponsorship', valuePence: sponsorshipValue, count: sponsorshipCount, color: 'var(--color-accent)' },
      { key: 'concierge', label: 'Concierge', valuePence: conciergeValue, count: conciergeCount, color: 'var(--color-bronze)' },
      { key: 'event', label: 'Event', valuePence: eventValue, count: eventCount, color: 'var(--color-accent-blue)' },
      { key: 'commission', label: 'Commission', valuePence: commissionValue, count: commissionCount, color: 'var(--color-accent-warm)' },
    ])

    // ── Events ──────────────────────────────────────────────────────
    const confirmed = bookings.filter((b) => (b.status ?? '').toLowerCase() === 'confirmed')
    const ticketsSold = confirmed.length
    const guests = confirmed.filter((b) => b.is_guest).length
    const ticketRevenue = confirmed.reduce((s, b) => s + (b.amount_pence ?? 0), 0)
    // Committed sponsorship (confirmed / invoiced / paid) — same set Finance
    // treats as sponsorship revenue.
    const committedSponsorship = ((sponsorsRes.data ?? []) as Array<{ amount_pence: number | null; status: string | null }>)
      .filter((s) => ['confirmed', 'invoiced', 'paid'].includes((s.status ?? '').toLowerCase()))
      .reduce((sum, s) => sum + (s.amount_pence ?? 0), 0)
    const cost = ((expensesRes.data ?? []) as Array<{ amount_pence: number | null }>).reduce(
      (sum, e) => sum + (e.amount_pence ?? 0),
      0,
    )
    setEvents({
      ticketsSold,
      guests,
      sponsorshipPence: committedSponsorship,
      revenuePence: ticketRevenue + committedSponsorship,
      costPence: cost,
    })

    // ── Introductions ───────────────────────────────────────────────
    setIntros({
      thisMonth: introRows.filter((i) => i.created_at >= startOfMonth).length,
      dealsCreated: introRows.filter((i) => i.deal_status != null).length,
      revenuePence: introRows.reduce((s, i) => s + (i.revenue_pence ?? 0), 0),
    })

    // ── AI recommendations ──────────────────────────────────────────
    setSuggestedIntros(
      ((suggestedRes.data ?? []) as unknown as Array<{
        id: string
        match_score: number | null
        member_a: { profiles: ProfileLite } | null
        member_b: { profiles: ProfileLite } | null
      }>).map((i) => ({
        id: i.id,
        score: i.match_score,
        a: personName(i.member_a?.profiles ?? null),
        b: personName(i.member_b?.profiles ?? null),
      })),
    )

    setAtRisk(
      ((atRiskRes.data ?? []) as unknown as Array<{
        id: string
        company_name: string | null
        churn_risk_score: number | null
        profiles: ProfileLite
      }>).map((m) => ({
        id: m.id,
        name: personName(m.profiles),
        company: m.company_name,
        score: m.churn_risk_score ?? 0,
      })),
    )

    setUpsell(
      ((upsellRes.data ?? []) as unknown as Array<{
        id: string
        company_name: string | null
        upgrade_potential: number | null
        profiles: ProfileLite
      }>).map((m) => ({
        id: m.id,
        name: personName(m.profiles),
        company: m.company_name,
        score: m.upgrade_potential ?? 0,
      })),
    )

    setHotProspects(
      ((hotRes.data ?? []) as unknown as Array<{
        id: string
        first_name: string | null
        last_name: string | null
        company: string | null
        lead_score: number | null
      }>).map((e) => ({
        id: e.id,
        name: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || 'Enquiry',
        company: e.company,
        score: e.lead_score ?? 0,
      })),
    )

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading executive dashboard…
      </div>
    )
  }

  const pipelineTotalPence = streams.reduce((s, x) => s + x.valuePence, 0)
  const pipelineTotalCount = streams.reduce((s, x) => s + x.count, 0)

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Executive Dashboard"
        description="A leadership cockpit — members, pipeline, events, introductions and AI recommendations at a glance. Every figure aggregates data already in the system and reconciles with its source screen (Pipeline, Finance, Enquiries)."
      />

      {/* ── Members ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-gold" />
          <h2 className="text-sm font-medium text-text">Members</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Link href="/dashboard/members" className="block transition-transform hover:-translate-y-0.5">
            <StatCard label="Active members" value={members.active.toLocaleString('en-GB')} changeText="live memberships" changeType="positive" />
          </Link>
          <Link href="/dashboard/applications" className="block transition-transform hover:-translate-y-0.5">
            <StatCard
              label="Pending applications"
              value={members.pending.toLocaleString('en-GB')}
              changeText="awaiting decision"
              changeType={members.pending > 0 ? 'negative' : 'neutral'}
            />
          </Link>
          <Link href="/dashboard/pipeline" className="block transition-transform hover:-translate-y-0.5">
            <StatCard
              label="Renewing"
              value={members.renewing.toLocaleString('en-GB')}
              changeText="next 90 days"
              changeType={members.renewing > 0 ? 'negative' : 'neutral'}
            />
          </Link>
        </div>
      </div>

      {/* ── Pipeline (open value per stream) ────────────────────────── */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Pipeline — open value by stream</CardTitle>
            <p className="text-sm text-text-muted mt-1">
              Live opportunity only (New · Qualified · Proposal) — excludes won &amp; lost. Commission
              is receivable owed to the Club (intros + concierge, still pending).
            </p>
          </div>
          <Link
            href="/dashboard/pipeline"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm text-gold hover:text-bronze transition-colors"
          >
            Open board <ArrowRight size={14} />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
            {streams.map((s) => (
              <div key={s.key} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <div className="min-w-0">
                  <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                    {s.label}
                  </p>
                  <p className="text-lg text-text tabular-nums">{formatCurrency(s.valuePence)}</p>
                  <p className="text-xs text-text-dim">{s.count} open</p>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-2.5">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-text" />
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Total
                </p>
                <p className="text-lg text-text tabular-nums font-medium">{formatCurrency(pipelineTotalPence)}</p>
                <p className="text-xs text-text-dim">{pipelineTotalCount} open</p>
              </div>
            </div>
          </div>
          {pipelineTotalPence > 0 ? (
            <PipelineStreamsChart data={streams} />
          ) : (
            <p className="text-sm text-text-dim py-4 text-center">No open pipeline value recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Events ──────────────────────────────────────────────────── */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Ticket size={16} className="text-gold" />
            Events
          </CardTitle>
          <Link
            href="/dashboard/events"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm text-gold hover:text-bronze transition-colors"
          >
            All events <ArrowRight size={14} />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Tickets sold</p>
              <p className="text-2xl text-text tabular-nums">{events.ticketsSold.toLocaleString('en-GB')}</p>
              <p className="text-xs text-text-dim">confirmed bookings</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Guests</p>
              <p className="text-2xl text-text tabular-nums">{events.guests.toLocaleString('en-GB')}</p>
              <p className="text-xs text-text-dim">guest bookings</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Sponsorship</p>
              <p className="text-2xl text-text tabular-nums">{formatCurrency(events.sponsorshipPence)}</p>
              <p className="text-xs text-text-dim">committed</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Revenue</p>
              <p className="text-2xl text-text tabular-nums">{formatCurrency(events.revenuePence)}</p>
              <p className="text-xs text-text-dim">tickets + sponsorship</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Cost</p>
              <p className="text-2xl text-text tabular-nums">{formatCurrency(events.costPence)}</p>
              <p className="text-xs text-text-dim">event expenses</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Introductions ───────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Handshake size={16} className="text-gold" />
          <h2 className="text-sm font-medium text-text">Introductions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <StatCard label="This month" value={intros.thisMonth.toLocaleString('en-GB')} changeText="introductions created" changeType="neutral" />
          <StatCard label="Deals created" value={intros.dealsCreated.toLocaleString('en-GB')} changeText="with a recorded outcome" changeType="neutral" />
          <StatCard label="Revenue generated" value={formatCurrency(intros.revenuePence)} changeText="from introductions" changeType={intros.revenuePence > 0 ? 'positive' : 'neutral'} />
        </div>
      </div>

      {/* ── AI recommendations ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-gold" />
        <h2 className="text-sm font-medium text-text">AI recommendations</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Introductions to make */}
        <RecCard
          title="Introductions to make"
          icon={<Sparkles size={16} className="text-gold" />}
          count={suggestedIntros.length}
          href="/dashboard/introductions"
          linkLabel="Review suggestions"
          empty="No AI suggestions awaiting review."
        >
          {suggestedIntros.map((i) => (
            <RecRow
              key={i.id}
              href="/dashboard/introductions"
              primary={`${i.a} ↔ ${i.b}`}
              secondary="Suggested introduction"
              trailing={i.score != null ? `${Math.round(i.score * 100)}%` : undefined}
            />
          ))}
        </RecCard>

        {/* Members at risk */}
        <RecCard
          title="Members at risk"
          icon={<AlertTriangle size={16} className="text-accent-warm" />}
          count={atRisk.length}
          href="/dashboard/members"
          linkLabel="View members"
          empty="No members flagged at risk."
          footnote="Churn risk ≥ 60, from the last score recompute."
        >
          {atRisk.map((m) => (
            <RecRow
              key={m.id}
              href={`/dashboard/members/${m.id}`}
              primary={m.name}
              secondary={m.company}
              trailing={`${m.score}`}
              trailingVariant="urgent"
            />
          ))}
        </RecCard>

        {/* Upsell opportunities */}
        <RecCard
          title="Upsell opportunities"
          icon={<ArrowUpRight size={16} className="text-gold" />}
          count={upsell.length}
          href="/dashboard/members"
          linkLabel="View members"
          empty="No upsell opportunities flagged."
          footnote="Upgrade potential ≥ 70, from the last score recompute."
        >
          {upsell.map((m) => (
            <RecRow
              key={m.id}
              href={`/dashboard/members/${m.id}`}
              primary={m.name}
              secondary={m.company}
              trailing={`${m.score}`}
              trailingVariant="active"
            />
          ))}
        </RecCard>

        {/* Hot prospects */}
        <RecCard
          title="Hot prospects"
          icon={<Flame size={16} className="text-accent-warm" />}
          count={hotProspects.length}
          href="/dashboard/enquiries"
          linkLabel="View enquiries"
          empty="No hot prospects right now."
          footnote="New enquiries with a lead score ≥ 70."
        >
          {hotProspects.map((p) => (
            <RecRow
              key={p.id}
              href="/dashboard/enquiries"
              primary={p.name}
              secondary={p.company}
              trailing={`${p.score}`}
              trailingVariant="upcoming"
            />
          ))}
        </RecCard>
      </div>
    </div>
  )
}

// ── Small presentational helpers ───────────────────────────────────────

function RecCard({
  title,
  icon,
  count,
  href,
  linkLabel,
  empty,
  footnote,
  children,
}: {
  title: string
  icon: React.ReactNode
  count: number
  href: string
  linkLabel: string
  empty: string
  footnote?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <Badge variant={count > 0 ? 'upcoming' : 'active'}>{count}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {count === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-text-dim">{empty}</p>
        ) : (
          <>
            <div className="divide-y divide-border">{children}</div>
            <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-border">
              {footnote ? (
                <p className="text-[11px] text-text-dim">{footnote}</p>
              ) : (
                <span />
              )}
              <Link href={href} className="shrink-0 inline-flex items-center gap-1.5 text-sm text-gold hover:text-bronze transition-colors">
                {linkLabel} <ArrowRight size={14} />
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function RecRow({
  href,
  primary,
  secondary,
  trailing,
  trailingVariant,
}: {
  href: string
  primary: string
  secondary?: string | null
  trailing?: string
  trailingVariant?: 'urgent' | 'active' | 'upcoming' | 'info'
}) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-surface-2 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text truncate">{primary}</p>
        {secondary && <p className="text-xs text-text-dim truncate">{secondary}</p>}
      </div>
      {trailing != null &&
        (trailingVariant ? (
          <Badge variant={trailingVariant}>{trailing}</Badge>
        ) : (
          <span className="shrink-0 text-sm font-medium text-gold tabular-nums">{trailing}</span>
        ))}
    </Link>
  )
}
