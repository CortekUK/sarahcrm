'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Loader2, ListTodo, RefreshCw, ReceiptText, ArrowUpRight } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────
// Unified sales pipeline board.
//
// A READ-ONLY kanban that brings the five siloed pipelines
// (membership applications, sponsorships, concierge, introductions,
// event bookings) together under one shared stage model. Each source
// keeps its own native status column; here we NORMALISE those native
// statuses into five shared stages so the whole book of open business
// is visible in one place.
//
// The board is intentionally read-only: drag-to-update would need to
// write five different status enums back to five different tables (and
// several of those transitions have side-effects — Stripe charges,
// provisioning, emails). Editing still happens on each origin screen;
// clicking a card deep-links there.
//   FUTURE ENHANCEMENT: drag-and-drop write-back per pipeline
//   (@hello-pangea/dnd is already a dependency) once per-table
//   transition rules are defined.
//
// Every record appears in EXACTLY one pipeline and one stage — no
// double counting. Side panels (follow-ups / renewals / outstanding
// invoices) reuse the same source logic the Dashboard and Finance
// screens use so the numbers reconcile.
// ─────────────────────────────────────────────────────────────────────

type Stage = 'new' | 'qualified' | 'proposal' | 'won' | 'lost'
type PipelineType = 'membership' | 'sponsorship' | 'concierge' | 'introduction' | 'event'

const STAGES: { key: Stage; label: string; accent: string }[] = [
  { key: 'new', label: 'New', accent: 'bg-text-dim' },
  { key: 'qualified', label: 'Qualified', accent: 'bg-accent-blue' },
  { key: 'proposal', label: 'Proposal / Quote', accent: 'bg-gold' },
  { key: 'won', label: 'Won', accent: 'bg-accent' },
  { key: 'lost', label: 'Lost', accent: 'bg-accent-warm' },
]

type BadgeVariant = 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'

const TYPE_META: Record<PipelineType, { label: string; variant: BadgeVariant }> = {
  membership: { label: 'Membership', variant: 'info' },
  sponsorship: { label: 'Sponsorship', variant: 'upcoming' },
  concierge: { label: 'Concierge', variant: 'active' },
  introduction: { label: 'Introduction', variant: 'draft' },
  event: { label: 'Event', variant: 'urgent' },
}

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All pipelines' },
  { value: 'membership', label: 'Membership' },
  { value: 'sponsorship', label: 'Sponsorship' },
  { value: 'concierge', label: 'Concierge' },
  { value: 'introduction', label: 'Introduction' },
  { value: 'event', label: 'Event' },
]

interface PipelineItem {
  key: string
  type: PipelineType
  stage: Stage
  title: string
  subtitle: string | null
  valuePence: number
  href: string
  date: string | null
}

interface FollowUp {
  id: string
  title: string
  due_date: string | null
  assignee: string
}

interface RenewalRow {
  id: string
  name: string
  company: string | null
  renewal_date: string
  bucket: 7 | 30 | 60 | 90
  upgrade: boolean
}

interface OutstandingRow {
  id: string
  who: string
  company: string | null
  amountPence: number
  status: string
  due_date: string | null
}

// ── Per-pipeline status → shared stage maps ──────────────────────────
// Native values are lower-cased before lookup; unknowns fall back to New.

function membershipStage(status: string): Stage {
  switch (status) {
    case 'approved':
      return 'won'
    case 'rejected':
      return 'lost'
    case 'shortlisted':
      return 'qualified'
    default:
      return 'new' // pending
  }
}

function sponsorshipStage(status: string): Stage {
  switch (status) {
    case 'paid':
      return 'won'
    case 'declined':
    case 'cancelled':
    case 'lost':
    case 'rejected':
      return 'lost'
    case 'confirmed':
      return 'qualified'
    case 'invoiced':
      return 'proposal'
    default:
      return 'new' // proposed / pending
  }
}

function conciergeStage(status: string): Stage {
  switch (status) {
    case 'accepted':
    case 'booked':
    case 'delivered':
    case 'feedback':
      return 'won'
    case 'declined':
    case 'cancelled':
      return 'lost'
    case 'sourcing':
      return 'qualified'
    case 'quoted':
      return 'proposal'
    default:
      return 'new' // pending / assigned
  }
}

function introductionStage(status: string, dealStatus: string | null): Stage {
  if (dealStatus === 'won') return 'won'
  if (dealStatus === 'lost') return 'lost'
  if (status === 'declined') return 'lost'
  if (status === 'completed') return 'won'
  if (status === 'sent' || status === 'scheduled' || status === 'accepted') return 'qualified'
  return 'new' // suggested / approved
}

function bookingStage(status: string): Stage {
  switch (status) {
    case 'confirmed':
      return 'won'
    case 'cancelled':
    case 'refunded':
      return 'lost'
    default:
      return 'new' // pending
  }
}

function personName(p: { first_name: string | null; last_name: string | null } | null | undefined): string {
  if (!p) return 'Unnamed'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed'
}

type ProfileLite = { first_name: string | null; last_name: string | null } | null

export function PipelinePage() {
  const router = useRouter()
  const [items, setItems] = useState<PipelineItem[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [renewals, setRenewals] = useState<RenewalRow[]>([])
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    // Renewal window — active members whose renewal_date (a plain date)
    // falls in the next 90 days. Compared as YYYY-MM-DD strings, exactly
    // like DashboardPage's renewalsDue30 logic.
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const dayStr = (n: number) =>
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).toISOString().slice(0, 10)
    const in90Str = dayStr(90)

    const [
      appsRes,
      sponsorsRes,
      conciergeRes,
      introsRes,
      bookingsRes,
      tasksRes,
      adminsRes,
      renewalsRes,
      paymentsRes,
    ] = await Promise.all([
      // ── Pipeline sources ──────────────────────────────────────────
      supabase
        .from('membership_applications')
        .select('id, first_name, last_name, company, status, preferred_tier, amount_paid_pence, created_at'),

      supabase
        .from('sponsorships')
        .select(
          `id, package_name, amount_pence, status, event_id, member_id,
           sponsor_name, sponsor_company,
           members(profiles(first_name, last_name, company_name))`,
        ),

      supabase
        .from('concierge_requests')
        .select(
          `id, request_type, event_name, status, sale_price_pence, quoted_amount_pence, created_at,
           members(profiles(first_name, last_name))`,
        ),

      supabase
        .from('introductions')
        .select(
          `id, status, deal_status, revenue_pence, suggested_at,
           member_a:members!introductions_member_a_id_fkey(profiles(first_name, last_name)),
           member_b:members!introductions_member_b_id_fkey(profiles(first_name, last_name))`,
        )
        // Exclude 'suggested' intros — these are AI recommendations still
        // awaiting Approve/Dismiss on the Introductions screen, not committed
        // pipeline. Including them floods the New column with unreviewed noise.
        .neq('status', 'suggested'),

      supabase
        .from('bookings')
        .select(
          `id, status, amount_pence, is_guest, guest_name, created_at,
           events(id, title),
           members(profiles(first_name, last_name))`,
        )
        .limit(500),

      // ── Side panels ───────────────────────────────────────────────
      // Follow-ups due: tasks due today or earlier, not done/cancelled,
      // soonest first. Includes enquiry-linked tasks (no filter on
      // related_enquiry_id — every open, due task is a follow-up).
      supabase
        .from('tasks')
        .select('id, title, due_date, assigned_to, status')
        .not('due_date', 'is', null)
        .lte('due_date', todayStr)
        .not('status', 'in', '(done,cancelled)')
        .order('due_date', { ascending: true }),

      supabase.from('profiles').select('id, first_name, last_name').eq('role', 'admin'),

      // Renewals & upgrades — active members with a renewal in the next
      // 90 days (string compare, same as Dashboard).
      supabase
        .from('members')
        .select('id, company_name, renewal_date, upgrade_potential, profiles(first_name, last_name)')
        .eq('membership_status', 'active')
        .is('deleted_at', null)
        .not('renewal_date', 'is', null)
        .gte('renewal_date', todayStr)
        .lte('renewal_date', in90Str)
        .order('renewal_date', { ascending: true }),

      // Outstanding invoices — same source Finance/Dashboard use.
      supabase
        .from('payments')
        .select(
          `id, amount_pence, status, due_date,
           members(company_name, profiles(first_name, last_name))`,
        )
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true }),
    ])

    const all: PipelineItem[] = []

    // Membership applications ------------------------------------------
    for (const a of (appsRes.data ?? []) as unknown as Array<{
      id: string
      first_name: string | null
      last_name: string | null
      company: string | null
      status: string
      preferred_tier: string | null
      amount_paid_pence: number | null
      created_at: string
    }>) {
      all.push({
        key: `membership-${a.id}`,
        type: 'membership',
        stage: membershipStage(a.status),
        title: `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || 'Applicant',
        subtitle: a.company || a.preferred_tier || null,
        valuePence: a.amount_paid_pence ?? 0,
        href: '/dashboard/applications',
        date: a.created_at,
      })
    }

    // Sponsorships ------------------------------------------------------
    for (const s of (sponsorsRes.data ?? []) as unknown as Array<{
      id: string
      package_name: string | null
      amount_pence: number | null
      status: string
      event_id: string | null
      member_id: string | null
      sponsor_name: string | null
      sponsor_company: string | null
      members: { profiles: (ProfileLite & { company_name?: string | null }) } | null
    }>) {
      const memberProfile = s.members?.profiles
      const title =
        s.sponsor_company ||
        s.sponsor_name ||
        (memberProfile ? personName(memberProfile) : null) ||
        'Sponsor'
      all.push({
        key: `sponsorship-${s.id}`,
        type: 'sponsorship',
        stage: sponsorshipStage((s.status ?? '').toLowerCase()),
        title,
        subtitle: s.package_name,
        valuePence: s.amount_pence ?? 0,
        href: s.event_id ? `/dashboard/events/${s.event_id}` : '/dashboard/events',
        date: null,
      })
    }

    // Concierge ---------------------------------------------------------
    for (const c of (conciergeRes.data ?? []) as unknown as Array<{
      id: string
      request_type: string
      event_name: string | null
      status: string
      sale_price_pence: number | null
      quoted_amount_pence: number | null
      created_at: string
      members: { profiles: ProfileLite } | null
    }>) {
      all.push({
        key: `concierge-${c.id}`,
        type: 'concierge',
        stage: conciergeStage((c.status ?? '').toLowerCase()),
        title: c.request_type,
        subtitle: c.event_name || personName(c.members?.profiles),
        valuePence: c.sale_price_pence ?? c.quoted_amount_pence ?? 0,
        href: '/dashboard/concierge',
        date: c.created_at,
      })
    }

    // Introductions -----------------------------------------------------
    for (const i of (introsRes.data ?? []) as unknown as Array<{
      id: string
      status: string
      deal_status: string | null
      revenue_pence: number | null
      suggested_at: string
      member_a: { profiles: ProfileLite } | null
      member_b: { profiles: ProfileLite } | null
    }>) {
      all.push({
        key: `introduction-${i.id}`,
        type: 'introduction',
        stage: introductionStage(i.status, i.deal_status),
        title: `${personName(i.member_a?.profiles)} ↔ ${personName(i.member_b?.profiles)}`,
        subtitle: 'Introduced business',
        valuePence: i.revenue_pence ?? 0,
        href: `/dashboard/introductions/${i.id}`,
        date: i.suggested_at,
      })
    }

    // Event bookings ----------------------------------------------------
    for (const b of (bookingsRes.data ?? []) as unknown as Array<{
      id: string
      status: string
      amount_pence: number | null
      is_guest: boolean
      guest_name: string | null
      created_at: string
      events: { id: string; title: string } | null
      members: { profiles: ProfileLite } | null
    }>) {
      const who = b.is_guest ? b.guest_name || 'Guest' : personName(b.members?.profiles)
      all.push({
        key: `event-${b.id}`,
        type: 'event',
        stage: bookingStage((b.status ?? '').toLowerCase()),
        title: b.events?.title || 'Event booking',
        subtitle: who,
        valuePence: b.amount_pence ?? 0,
        href: b.events ? `/dashboard/events/${b.events.id}` : '/dashboard/bookings',
        date: b.created_at,
      })
    }

    setItems(all)

    // Follow-ups — resolve assignee names from the admin list.
    const adminById = new Map<string, string>()
    for (const a of (adminsRes.data ?? []) as unknown as Array<{
      id: string
      first_name: string | null
      last_name: string | null
    }>) {
      adminById.set(a.id, personName(a))
    }
    setFollowUps(
      ((tasksRes.data ?? []) as unknown as Array<{
        id: string
        title: string
        due_date: string | null
        assigned_to: string | null
      }>).map((t) => ({
        id: t.id,
        title: t.title,
        due_date: t.due_date,
        assignee: t.assigned_to ? adminById.get(t.assigned_to) ?? 'Unknown' : 'Unassigned',
      })),
    )

    // Renewals — bucket by days-to-renewal (7 / 30 / 60 / 90).
    const in7 = dayStr(7)
    const in30 = dayStr(30)
    const in60 = dayStr(60)
    setRenewals(
      ((renewalsRes.data ?? []) as unknown as Array<{
        id: string
        company_name: string | null
        renewal_date: string
        upgrade_potential: number | null
        profiles: ProfileLite
      }>).map((m) => {
        const d = m.renewal_date
        const bucket: 7 | 30 | 60 | 90 = d <= in7 ? 7 : d <= in30 ? 30 : d <= in60 ? 60 : 90
        return {
          id: m.id,
          name: personName(m.profiles),
          company: m.company_name,
          renewal_date: m.renewal_date,
          bucket,
          upgrade: (m.upgrade_potential ?? 0) >= 70,
        }
      }),
    )

    // Outstanding invoices.
    setOutstanding(
      ((paymentsRes.data ?? []) as unknown as Array<{
        id: string
        amount_pence: number | null
        status: string
        due_date: string | null
        members: { company_name: string | null; profiles: ProfileLite } | null
      }>).map((p) => ({
        id: p.id,
        who: personName(p.members?.profiles),
        company: p.members?.company_name ?? null,
        amountPence: p.amount_pence ?? 0,
        status: p.status,
        due_date: p.due_date,
      })),
    )

    setLoading(false)
  }

  const filtered = useMemo(
    () => (typeFilter === 'all' ? items : items.filter((i) => i.type === typeFilter)),
    [items, typeFilter],
  )

  const byStage = useMemo(() => {
    const map: Record<Stage, PipelineItem[]> = {
      new: [],
      qualified: [],
      proposal: [],
      won: [],
      lost: [],
    }
    for (const it of filtered) map[it.stage].push(it)
    return map
  }, [filtered])

  // Top tiles. "Open" value deliberately excludes Won/Lost so the number
  // is honest — it's live opportunity, not booked or dead business.
  const openStages: Stage[] = ['new', 'qualified', 'proposal']
  const openItems = filtered.filter((i) => openStages.includes(i.stage))
  const openValuePence = openItems.reduce((s, i) => s + i.valuePence, 0)
  const outstandingTotalPence = outstanding.reduce((s, p) => s + p.amountPence, 0)

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading pipeline…
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Pipeline"
        description="Every open opportunity across membership, sponsorship, concierge, introductions and events — one board, one set of stages. Read-only: edit a record on its own screen by clicking through. Follow-ups, renewals and outstanding invoices sit alongside."
      />

      {/* Top stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard
          label="Open pipeline value"
          value={formatCurrency(openValuePence)}
          changeText="excludes won & lost"
          changeType="neutral"
        />
        <StatCard
          label="Open items"
          value={openItems.length.toLocaleString('en-GB')}
          changeText="new · qualified · proposal"
          changeType="neutral"
        />
        <StatCard
          label="Follow-ups due"
          value={followUps.length.toLocaleString('en-GB')}
          changeText={followUps.length > 0 ? 'due today or overdue' : 'all clear'}
          changeType={followUps.length > 0 ? 'negative' : 'positive'}
        />
        <StatCard
          label="Outstanding invoices"
          value={formatCurrency(outstandingTotalPence)}
          changeText={`${outstanding.length} unpaid`}
          changeType={outstanding.length > 0 ? 'negative' : 'positive'}
        />
      </div>

      {/* Pipeline-type filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-52">
          <SelectMenu
            ariaLabel="Filter by pipeline type"
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={TYPE_FILTER_OPTIONS}
          />
        </div>
        <p className="text-xs text-text-dim">
          {filtered.length} record{filtered.length === 1 ? '' : 's'} shown
        </p>
      </div>

      {/* ── Board — horizontally scrollable, never breaks page layout ── */}
      <div className="overflow-x-auto pb-3 mb-8">
        <div className="flex gap-4 min-w-max">
          {STAGES.map((stage) => {
            const stageItems = byStage[stage.key]
            const total = stageItems.reduce((s, i) => s + i.valuePence, 0)
            return (
              <div key={stage.key} className="w-72 shrink-0">
                {/* Column header */}
                <div className="flex items-center justify-between gap-2 px-1 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', stage.accent)} />
                    <span className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted truncate">
                      {stage.label}
                    </span>
                    <span className="text-xs text-text-dim">{stageItems.length}</span>
                  </div>
                  {total > 0 && (
                    <span className="text-[11px] tabular-nums text-text-dim shrink-0">
                      {formatCurrency(total)}
                    </span>
                  )}
                </div>

                {/* Column body */}
                <div className="space-y-2.5 rounded-[var(--radius-lg)] bg-surface-2/50 p-2.5 min-h-[120px]">
                  {stageItems.length === 0 ? (
                    <p className="text-center text-xs text-text-dim py-8">No items</p>
                  ) : (
                    stageItems.map((it) => {
                      const meta = TYPE_META[it.type]
                      return (
                        <button
                          key={it.key}
                          type="button"
                          onClick={() => router.push(it.href)}
                          className="w-full text-left rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 shadow-[var(--shadow-card)] transition-colors hover:border-border-hover hover:bg-surface-2"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                            {it.valuePence > 0 && (
                              <span className="text-xs tabular-nums font-medium text-text">
                                {formatCurrency(it.valuePence)}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-text truncate">{it.title}</p>
                          {it.subtitle && (
                            <p className="text-xs text-text-dim truncate">{it.subtitle}</p>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Side panels ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Follow-ups due */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <ListTodo size={16} className="text-gold" />
              Follow-ups due
            </CardTitle>
            <Badge variant={followUps.length > 0 ? 'urgent' : 'active'}>{followUps.length}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {followUps.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-text-dim">Nothing due — all clear.</p>
            ) : (
              <div className="divide-y divide-border max-h-96 overflow-y-auto">
                {followUps.map((t) => (
                  <Link
                    key={t.id}
                    href="/dashboard/tasks"
                    className="flex items-start justify-between gap-3 px-6 py-3 hover:bg-surface-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">{t.title}</p>
                      <p className="text-xs text-text-dim">{t.assignee}</p>
                    </div>
                    {t.due_date && (
                      <span className="text-xs text-accent-warm font-medium whitespace-nowrap shrink-0">
                        {formatDate(t.due_date)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Renewals & upgrades */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <RefreshCw size={16} className="text-gold" />
              Renewals & upgrades
            </CardTitle>
            <Badge variant={renewals.length > 0 ? 'upcoming' : 'active'}>{renewals.length}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {renewals.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-text-dim">
                No renewals in the next 90 days.
              </p>
            ) : (
              <div className="divide-y divide-border max-h-96 overflow-y-auto">
                {renewals.map((m) => (
                  <Link
                    key={m.id}
                    href={`/dashboard/members/${m.id}`}
                    className="flex items-start justify-between gap-3 px-6 py-3 hover:bg-surface-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">{m.name}</p>
                      {m.company && <p className="text-xs text-text-dim truncate">{m.company}</p>}
                      {m.upgrade && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-gold">
                          <ArrowUpRight size={11} /> Upgrade potential
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <Badge
                        variant={m.bucket <= 7 ? 'urgent' : m.bucket <= 30 ? 'upcoming' : 'info'}
                      >
                        {m.bucket}d
                      </Badge>
                      <p className="text-[11px] text-text-dim mt-1">{formatDate(m.renewal_date)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Outstanding invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <ReceiptText size={16} className="text-gold" />
              Outstanding invoices
            </CardTitle>
            <span className="text-sm font-medium text-text tabular-nums">
              {formatCurrency(outstandingTotalPence)}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {outstanding.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-text-dim">Nothing outstanding.</p>
            ) : (
              <div className="divide-y divide-border max-h-96 overflow-y-auto">
                {outstanding.map((p) => (
                  <Link
                    key={p.id}
                    href="/dashboard/finance"
                    className="flex items-start justify-between gap-3 px-6 py-3 hover:bg-surface-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">{p.who}</p>
                      {p.company && <p className="text-xs text-text-dim truncate">{p.company}</p>}
                      {p.due_date && (
                        <p className="text-[11px] text-text-dim">Due {formatDate(p.due_date)}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-text tabular-nums">
                        {formatCurrency(p.amountPence)}
                      </p>
                      <Badge variant={p.status === 'overdue' ? 'urgent' : 'upcoming'}>
                        {p.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
