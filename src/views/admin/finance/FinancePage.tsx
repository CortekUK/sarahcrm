'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CashflowChart } from '@/components/ui/CashflowChart'
import { toast } from '@/lib/hooks/use-toast'
import { formatCurrency, formatDate, formatDateTime, titleCase } from '@/lib/utils'
import {
  computeRenewalRate,
  computeCashflow,
  type RenewalRateResult,
  type CashflowBucket,
} from '@/lib/finance/metrics'
import { AlertTriangle, ArrowUpDown, RefreshCw } from 'lucide-react'
import type { Database } from '@/types/database'

interface EventPnlRow {
  id: string
  title: string
  date: string | null
  revenuePence: number
  costPence: number
  profitPence: number
  marginPct: number | null
}

interface MemberRevenueRow {
  id: string
  name: string
  company: string | null
  revenuePaidPence: number
  ltvPence: number
}

type PaymentStatus = Database['public']['Enums']['payment_status']
type PaymentMethod = Database['public']['Enums']['payment_method']

interface PaymentRow {
  id: string
  payment_type: string
  amount_pence: number
  status: PaymentStatus
  payment_method: PaymentMethod | null
  due_date: string | null
  paid_at: string | null
  description: string | null
  created_at: string
  members: {
    company_name: string | null
    profiles: {
      first_name: string | null
      last_name: string | null
    }
  }
}

const paymentStatusBadge: Record<PaymentStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  paid: 'active',
  pending: 'upcoming',
  overdue: 'urgent',
  refunded: 'draft',
  failed: 'urgent',
}

const methodLabels: Record<string, string> = {
  stripe: 'Stripe',
  gocardless: 'GoCardless',
  invoice: 'Invoice',
  manual: 'Manual',
}

const methodBadge: Record<string, 'info' | 'upcoming' | 'draft'> = {
  stripe: 'info',
  gocardless: 'upcoming',
  invoice: 'draft',
  manual: 'draft',
}

function memberName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return 'Unknown'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed'
}

export function FinancePage() {
  const router = useRouter()
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [revenueBySource, setRevenueBySource] = useState({
    membership: 0,
    events: 0,
    sponsorship: 0,
    concierge: 0,
    referrals: 0,
  })
  const [conciergeGmv, setConciergeGmv] = useState(0)
  const [outstanding, setOutstanding] = useState(0)
  const [activeSubscriptions, setActiveSubscriptions] = useState(0)
  const [mrr, setMrr] = useState(0)
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([])
  const [overduePayments, setOverduePayments] = useState<PaymentRow[]>([])
  const [cashflow, setCashflow] = useState<CashflowBucket[]>([])
  const [renewalRate, setRenewalRate] = useState<RenewalRateResult | null>(null)
  const [eventPnl, setEventPnl] = useState<EventPnlRow[]>([])
  const [memberRevenue, setMemberRevenue] = useState<MemberRevenueRow[]>([])
  const [memberSort, setMemberSort] = useState<{ key: 'ltv' | 'revenue'; dir: 'asc' | 'desc' }>({
    key: 'ltv',
    dir: 'desc',
  })
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null)

  useEffect(() => {
    fetchFinanceData()
  }, [])

  async function fetchFinanceData() {
    const [
      revenueRes,
      refundedApplicationsRes,
      pendingPaidApplicationsRes,
      outstandingRes,
      recentRes,
      overdueRes,
      subsRes,
      mrrRes,
      sponsorshipsRes,
      conciergeRes,
      referralsRes,
      membersRes,
      eventsRes,
      confirmedBookingsRes,
      expensesRes,
    ] = await Promise.all([
      // All paid revenue (paid payment rows). Guest event bookings now
      // get a real payment row too (member_id null), so this is the
      // complete ledger; payment_type splits membership vs event income
      // for the "Revenue by source" breakdown.
      supabase
        .from('payments')
        .select('amount_pence, payment_type, member_id, paid_at')
        .eq('status', 'paid'),

      // Refunded application payments — when admin rejects a paid
      // application we refund the Stripe charge. The payment row that
      // was recorded at approval time never existed (rejection happens
      // before approval), so the membership payment never hit
      // `payments`. We:
      //   1. deduct the refunded amount from total revenue (below)
      //   2. surface each refund as a ledger row in Recent Payments
      //      with status='refunded' (synthesised into PaymentRow shape)
      supabase
        .from('membership_applications')
        .select(
          'id, refund_amount_pence, amount_paid_pence, refunded_at, refund_id, first_name, last_name, company',
        )
        .not('refunded_at', 'is', null)
        .order('refunded_at', { ascending: false }),

      // Pending-but-paid applications — the applicant paid via Stripe
      // up front, but admin hasn't approved yet. No payment row exists
      // for them (the approve route creates the payment row at approval
      // time). Without this query their revenue was invisible to
      // Finance — the gap the user flagged. We:
      //   1. add the paid amount into total revenue
      //   2. synthesise an "invoice" ledger row in Recent Payments
      // Excludes rejected + approved (approved is already in payments)
      // and excludes refunded (already counted in refunds branch).
      supabase
        .from('membership_applications')
        .select(
          'id, amount_paid_pence, paid_at, stripe_subscription_id, first_name, last_name, company, payment_preference, preferred_tier, status',
        )
        .gt('amount_paid_pence', 0)
        .not('paid_at', 'is', null)
        .is('refunded_at', null)
        .in('status', ['pending', 'shortlisted'])
        .order('paid_at', { ascending: false }),

      // Outstanding (pending + overdue)
      supabase
        .from('payments')
        .select('amount_pence')
        .in('status', ['pending', 'overdue']),

      // Recent payments (last 15)
      supabase
        .from('payments')
        .select(`
          id, payment_type, amount_pence, status, payment_method, due_date, paid_at, description, created_at, reference_id,
          members(company_name, profiles(first_name, last_name))
        `)
        .order('created_at', { ascending: false })
        .limit(15),

      // Overdue payments
      supabase
        .from('payments')
        .select(`
          id, payment_type, amount_pence, status, payment_method, due_date, paid_at, description, created_at,
          members(company_name, profiles(first_name, last_name))
        `)
        .eq('status', 'overdue')
        .order('due_date', { ascending: true }),

      // Active subscriptions count
      supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .not('stripe_subscription_id', 'is', null)
        .eq('membership_status', 'active')
        .is('deleted_at', null),

      // MRR — sum monthly_price_pence per active subscribed member.
      // Annual subscribers are approximated at their monthly equivalent;
      // we don't store cadence on members, so this is intentionally a
      // coarse number rather than a per-Stripe-interval calc.
      supabase
        .from('members')
        .select('membership_tier')
        .not('stripe_subscription_id', 'is', null)
        .eq('membership_status', 'active')
        .is('deleted_at', null),

      // Sponsorship revenue — committed (confirmed or beyond) sponsor
      // fees, the third income source alongside membership + events.
      // event_id is carried so the same rows drive the Event P&L table.
      supabase
        .from('sponsorships')
        .select('amount_pence, status, event_id')
        .in('status', ['confirmed', 'invoiced', 'paid']),

      // Concierge — realised (paid-for) fulfilment only. sale_price −
      // supplier_cost is the Club's MARGIN (its actual income);
      // quoted_amount_pence is the GMV (gross value), shown separately.
      supabase
        .from('concierge_requests')
        .select('quoted_amount_pence, sale_price_pence, supplier_cost_pence, status')
        .in('status', ['booked', 'delivered', 'feedback']),

      // Referral revenue The Club EARNED on member-referred business
      // (commission_pence is what the Club owes members — a payout, not
      // income — so it is deliberately not used here).
      supabase.from('reward_referrals').select('revenue_pence'),

      // All non-deleted members — powers renewal rate (renewal_date +
      // status) and the revenue-by-member / LTV table (persisted LTV).
      supabase
        .from('members')
        .select(
          'id, membership_status, renewal_date, lifetime_value_pence, company_name, profiles(first_name, last_name)',
        )
        .is('deleted_at', null),

      // Events — for the Event P&L table.
      supabase.from('events').select('id, title, start_date'),

      // Confirmed bookings — ticket revenue side of event P&L.
      supabase
        .from('bookings')
        .select('event_id, amount_pence')
        .eq('status', 'confirmed'),

      // Event expenses — cost side of event P&L + cashflow out.
      supabase.from('event_expenses').select('event_id, amount_pence, created_at'),
    ])

    const paymentsRevenue = (revenueRes.data ?? []).reduce(
      (sum, p) => sum + (p.amount_pence ?? 0),
      0,
    )
    // Split paid payment rows by type so we can attribute them to the
    // right source. Anything that isn't an event booking is treated as
    // membership income (the dominant case). Event bookings now include
    // both member and guest rows (guest payments are real ledger rows).
    const membershipPayments = (revenueRes.data ?? [])
      .filter((p) => p.payment_type !== 'event_booking')
      .reduce((sum, p) => sum + (p.amount_pence ?? 0), 0)
    const eventPayments = (revenueRes.data ?? [])
      .filter((p) => p.payment_type === 'event_booking')
      .reduce((sum, p) => sum + (p.amount_pence ?? 0), 0)
    // Committed sponsorship fees (confirmed / invoiced / paid).
    const sponsorshipRevenue = (sponsorshipsRes.data ?? []).reduce(
      (sum, s) => sum + (s.amount_pence ?? 0),
      0,
    )
    // Concierge — realised fulfilment (booked/delivered/feedback).
    //  • conciergeRevenue = MARGIN = Σ (sale_price − supplier_cost).
    //    This is the Club's actual concierge income and is what feeds
    //    totalRevenue + revenueBySource.concierge.
    //  • conciergeGmv = gross value (quoted_amount_pence), a headline
    //    volume metric shown as its own tile — NOT added to revenue.
    // Neither lives in `payments`, so no double-count.
    const conciergeRevenue = (conciergeRes.data ?? []).reduce(
      (sum, c) => sum + ((c.sale_price_pence ?? 0) - (c.supplier_cost_pence ?? 0)),
      0,
    )
    const conciergeGmv = (conciergeRes.data ?? []).reduce(
      (sum, c) => sum + (c.quoted_amount_pence ?? 0),
      0,
    )
    // Referrals — revenue The Club EARNED on member-referred business
    // (reward_referrals.revenue_pence). commission_pence is a payout the
    // Club owes members, so it is excluded. Introduced-business deal value
    // (introductions.revenue_pence) is member-to-member value, not Club
    // income, so it is excluded entirely too.
    const referralRevenue = (referralsRes.data ?? []).reduce(
      (sum, r) => sum + (r.revenue_pence ?? 0),
      0,
    )
    // Refunded application accounting needs BOTH sides of the ledger
    // — the original payment that was captured by Stripe AND the
    // refund that returned it. Without adding the original first,
    // the subtraction goes net-negative because the original was
    // never counted in `payments` (the refund happens pre-approval,
    // so no payment row was ever created).
    //
    // For each refunded application we therefore:
    //   + add amount_paid_pence   (the original captured charge)
    //   − subtract refund_amount_pence (what Stripe returned)
    // Net per refund: ≈ 0 (typically same value).
    const refundedOriginalsTotal = (refundedApplicationsRes.data ?? []).reduce(
      (sum, r) => sum + (r.amount_paid_pence ?? 0),
      0,
    )
    // refund_amount_pence is the source of truth (what Stripe actually
    // returned). Falls back to amount_paid_pence for legacy rows that
    // were refunded manually before the column existed.
    const refundedTotal = (refundedApplicationsRes.data ?? []).reduce(
      (sum, r) => sum + ((r.refund_amount_pence ?? r.amount_paid_pence) ?? 0),
      0,
    )
    // Pending-but-paid applications contribute to revenue too — the
    // money has already been captured by Stripe. Once admin approves
    // them the approve route inserts a payment row, the application
    // exits the 'pending'/'shortlisted' set, and this query stops
    // double-counting them.
    const pendingPaidTotal = (pendingPaidApplicationsRes.data ?? []).reduce(
      (sum, r) => sum + (r.amount_paid_pence ?? 0),
      0,
    )
    setTotalRevenue(
      paymentsRevenue +
        sponsorshipRevenue +
        conciergeRevenue +
        referralRevenue +
        pendingPaidTotal +
        refundedOriginalsTotal -
        refundedTotal,
    )
    setConciergeGmv(conciergeGmv)
    // Attribute revenue to its source for the breakdown card.
    //  • Membership = membership payment rows + pending-but-paid
    //    applications, net of refunds (refund nets to ≈0 per the
    //    add-original / subtract-refund logic above).
    //  • Events = member event-booking payments + guest booking revenue.
    //  • Sponsorship = committed sponsor fees.
    setRevenueBySource({
      membership:
        membershipPayments +
        pendingPaidTotal +
        refundedOriginalsTotal -
        refundedTotal,
      events: eventPayments,
      sponsorship: sponsorshipRevenue,
      concierge: conciergeRevenue,
      referrals: referralRevenue,
    })
    setOutstanding(
      (outstandingRes.data ?? []).reduce((sum, p) => sum + (p.amount_pence ?? 0), 0)
    )
    setActiveSubscriptions(subsRes.count ?? 0)

    // Guest event-booking payments now live in `payments` (member_id null)
    // and arrive via recentRes like any other payment. Their joined member
    // is empty, so look up the guest's name from the originating booking
    // (payments.reference_id = bookings.id) and show that instead of
    // "Unknown".
    const rawRecent = (recentRes.data ?? []) as unknown as (PaymentRow & {
      reference_id: string | null
    })[]
    const guestRefIds = rawRecent
      .filter((p) => !p.members && p.reference_id)
      .map((p) => p.reference_id as string)
    const guestBookingById = new Map<
      string,
      { guest_name: string | null; guest_company: string | null }
    >()
    if (guestRefIds.length) {
      const { data: gb } = await supabase
        .from('bookings')
        .select('id, guest_name, guest_company')
        .in('id', guestRefIds)
      for (const b of gb ?? [])
        guestBookingById.set(b.id, { guest_name: b.guest_name, guest_company: b.guest_company })
    }
    const memberPaymentRows = rawRecent.map((p) => {
      if (p.members) return p
      const gb = p.reference_id ? guestBookingById.get(p.reference_id) : null
      return {
        ...p,
        members: {
          company_name: gb?.guest_company ?? null,
          profiles: { first_name: gb?.guest_name ?? 'Guest', last_name: '' },
        },
      }
    })
    // Pending-paid invoice rows — applicants whose money is captured
    // by Stripe but not yet promoted into a `payments` row by the
    // approve flow. Surfaces them as 'pending' (yellow badge) in the
    // ledger so admin can see "money in, awaiting review".
    const pendingInvoiceRows: PaymentRow[] = (
      pendingPaidApplicationsRes.data ?? []
    ).map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ra = r as any
      const amount = (ra.amount_paid_pence ?? 0) as number
      const cadence: string | null = ra.payment_preference ?? null
      const tier: string | null = ra.preferred_tier ?? null
      return {
        id: `pending-${ra.id}`,
        payment_type: 'membership',
        amount_pence: amount,
        status: 'pending' as PaymentStatus,
        payment_method: 'stripe' as PaymentMethod,
        due_date: null,
        paid_at: ra.paid_at,
        description: `Membership invoice — application ${ra.status}${
          tier ? ` (${tier.replace('_', ' ')}` : ''
        }${tier && cadence ? `, ${cadence})` : tier ? ')' : ''}`,
        created_at: ra.paid_at ?? new Date().toISOString(),
        members: {
          company_name: ra.company ?? null,
          profiles: {
            first_name: ra.first_name ?? 'Applicant',
            last_name: ra.last_name ?? '',
          },
        },
      }
    })

    // Refund ledger rows — one per refunded application. Amount is
    // displayed as a negative pence value so the row reads as money
    // leaving the books, and status='refunded' colour-codes it in the
    // status badge.
    const refundLedgerRows: PaymentRow[] = (refundedApplicationsRes.data ?? []).map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ra = r as any
      const amount = (ra.refund_amount_pence ?? ra.amount_paid_pence ?? 0) as number
      return {
        id: `refund-${ra.id}`,
        payment_type: 'membership',
        amount_pence: -Math.abs(amount),
        status: 'refunded' as PaymentStatus,
        payment_method: 'stripe' as PaymentMethod,
        due_date: null,
        paid_at: ra.refunded_at,
        description: `Refund — application rejected${ra.refund_id ? ` (${ra.refund_id})` : ''}`,
        created_at: ra.refunded_at ?? new Date().toISOString(),
        members: {
          company_name: ra.company ?? null,
          profiles: {
            first_name: ra.first_name ?? 'Applicant',
            last_name: ra.last_name ?? '',
          },
        },
      }
    })
    const mergedRecent = [
      ...memberPaymentRows,
      ...pendingInvoiceRows,
      ...refundLedgerRows,
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 15)
    setRecentPayments(mergedRecent)
    setOverduePayments((overdueRes.data ?? []) as unknown as PaymentRow[])

    // MRR from membership_plans (live pricing the website + portal use).
    // membership_plans.tier_classification maps directly to members.membership_tier.
    if (mrrRes.data && mrrRes.data.length > 0) {
      const { data: plans } = await supabase
        .from('membership_plans')
        .select('tier_classification, monthly_price_pence')
        .eq('is_active', true)

      if (plans) {
        const priceByTier = new Map<string, number>()
        for (const p of plans) {
          if (p.tier_classification) {
            priceByTier.set(p.tier_classification, p.monthly_price_pence)
          }
        }
        const totalMrr = mrrRes.data.reduce(
          (sum, m) => sum + (priceByTier.get(m.membership_tier) ?? 0),
          0,
        )
        setMrr(totalMrr)
      }
    }

    // ── Cashflow (last 12 months) ────────────────────────────────
    // In = paid payments by paid_at; out = event expenses by created_at.
    const paidPayments = (revenueRes.data ?? []) as Array<{
      amount_pence: number | null
      member_id: string | null
      paid_at: string | null
    }>
    setCashflow(
      computeCashflow(
        paidPayments.map((p) => ({ amount_pence: p.amount_pence, paid_at: p.paid_at })),
        (expensesRes.data ?? []).map((e) => ({
          amount_pence: e.amount_pence,
          created_at: e.created_at,
        })),
      ),
    )

    // ── Renewal rate (trailing 90 days) ──────────────────────────
    const memberRows = (membersRes.data ?? []) as unknown as Array<{
      id: string
      membership_status: string
      renewal_date: string | null
      lifetime_value_pence: number | null
      company_name: string | null
      profiles: { first_name: string | null; last_name: string | null } | null
    }>
    setRenewalRate(
      computeRenewalRate(
        memberRows.map((m) => ({
          id: m.id,
          renewal_date: m.renewal_date,
          membership_status: m.membership_status,
        })),
        paidPayments.map((p) => ({ member_id: p.member_id, status: 'paid', paid_at: p.paid_at })),
      ),
    )

    // ── Event P&L table ──────────────────────────────────────────
    const ticketByEvent = new Map<string, number>()
    for (const b of confirmedBookingsRes.data ?? []) {
      if (!b.event_id) continue
      ticketByEvent.set(b.event_id, (ticketByEvent.get(b.event_id) ?? 0) + (b.amount_pence ?? 0))
    }
    const sponsorByEvent = new Map<string, number>()
    for (const s of sponsorshipsRes.data ?? []) {
      if (!s.event_id) continue
      sponsorByEvent.set(s.event_id, (sponsorByEvent.get(s.event_id) ?? 0) + (s.amount_pence ?? 0))
    }
    const costByEvent = new Map<string, number>()
    for (const e of expensesRes.data ?? []) {
      if (!e.event_id) continue
      costByEvent.set(e.event_id, (costByEvent.get(e.event_id) ?? 0) + (e.amount_pence ?? 0))
    }
    const pnlRows: EventPnlRow[] = (eventsRes.data ?? [])
      .map((ev) => {
        const revenuePence = (ticketByEvent.get(ev.id) ?? 0) + (sponsorByEvent.get(ev.id) ?? 0)
        const costPence = costByEvent.get(ev.id) ?? 0
        const profitPence = revenuePence - costPence
        return {
          id: ev.id,
          title: ev.title,
          date: ev.start_date,
          revenuePence,
          costPence,
          profitPence,
          marginPct: revenuePence > 0 ? Math.round((profitPence / revenuePence) * 100) : null,
        }
      })
      // Only events with money in or out — skip empty drafts.
      .filter((r) => r.revenuePence > 0 || r.costPence > 0)
      .sort((a, b) => b.revenuePence - a.revenuePence)
    setEventPnl(pnlRows)

    // ── Revenue-by-member + LTV ──────────────────────────────────
    // Revenue paid-to-date grouped from paid payment rows; LTV read from
    // the persisted members.lifetime_value_pence (written by
    // recompute-scores, which uses computeMemberRoi — same figure as the
    // member's MemberRoiPanel).
    const revenueByMember = new Map<string, number>()
    for (const p of paidPayments) {
      if (!p.member_id) continue
      revenueByMember.set(
        p.member_id,
        (revenueByMember.get(p.member_id) ?? 0) + (p.amount_pence ?? 0),
      )
    }
    const memberRevenueRows: MemberRevenueRow[] = memberRows
      .filter((m) => m.membership_status === 'active')
      .map((m) => ({
        id: m.id,
        name:
          `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim() || 'Unnamed',
        company: m.company_name,
        revenuePaidPence: revenueByMember.get(m.id) ?? 0,
        ltvPence: m.lifetime_value_pence ?? 0,
      }))
    setMemberRevenue(memberRevenueRows)

    setLoading(false)
  }

  // Sorted view of the revenue-by-member table.
  const sortedMemberRevenue = useMemo(() => {
    const rows = [...memberRevenue]
    rows.sort((a, b) => {
      const av = memberSort.key === 'ltv' ? a.ltvPence : a.revenuePaidPence
      const bv = memberSort.key === 'ltv' ? b.ltvPence : b.revenuePaidPence
      return memberSort.dir === 'desc' ? bv - av : av - bv
    })
    return rows
  }, [memberRevenue, memberSort])

  function toggleMemberSort(key: 'ltv' | 'revenue') {
    setMemberSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' },
    )
  }

  // Recompute LTV / relationship scores for every active member (no body =
  // all active), then refresh the finance data so LTV populates. Reuses the
  // existing route — does not reimplement scoring.
  async function handleRecomputeLtv() {
    setRecomputing(true)
    try {
      const res = await fetch('/api/admin/members/recompute-scores', { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { updated?: number; error?: string }
      if (!res.ok) {
        toast({
          title: 'Recompute failed',
          description: json.error || 'Could not recompute member scores.',
          variant: 'destructive',
        })
        return
      }
      toast({
        title: 'LTV recomputed',
        description: `Updated ${json.updated ?? 0} member${json.updated === 1 ? '' : 's'}.`,
      })
      await fetchFinanceData()
    } catch (err) {
      toast({
        title: 'Recompute failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      })
    } finally {
      setRecomputing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading finance...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          Finance
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Revenue, payments, and invoicing
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5 mb-8">
        <StatCard
          label="Revenue"
          value={formatCurrency(totalRevenue)}
          changeText="all time paid"
          changeType="positive"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(outstanding)}
          changeText={`${overduePayments.length} overdue`}
          changeType={overduePayments.length > 0 ? 'negative' : 'neutral'}
        />
        <StatCard
          label="Subscriptions"
          value={activeSubscriptions.toLocaleString('en-GB')}
          changeText="paying via Stripe"
          changeType="positive"
        />
        <StatCard
          label="MRR"
          value={formatCurrency(mrr)}
          changeText="monthly recurring"
          changeType="positive"
        />
        <StatCard
          label="Renewal rate"
          value={renewalRate ? `${Math.round(renewalRate.rate * 100)}%` : '—'}
          changeText={
            renewalRate
              ? `${renewalRate.renewed}/${renewalRate.due} in last ${renewalRate.windowDays}d`
              : 'no renewals due'
          }
          changeType={
            renewalRate && renewalRate.due > 0
              ? renewalRate.rate >= 0.8
                ? 'positive'
                : 'negative'
              : 'neutral'
          }
        />
        <StatCard
          label="Concierge GMV"
          value={formatCurrency(conciergeGmv)}
          changeText="gross booked value"
          changeType="neutral"
        />
      </div>

      {/* Revenue by source */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Revenue by source</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const sources = [
              { key: 'membership', label: 'Membership', value: revenueBySource.membership, color: 'bg-gold' },
              { key: 'events', label: 'Events', value: revenueBySource.events, color: 'bg-accent-blue' },
              { key: 'sponsorship', label: 'Sponsorship', value: revenueBySource.sponsorship, color: 'bg-accent' },
              { key: 'concierge', label: 'Concierge', value: revenueBySource.concierge, color: 'bg-bronze' },
              { key: 'referrals', label: 'Referrals', value: revenueBySource.referrals, color: 'bg-accent-warm' },
            ]
            const sum = sources.reduce((s, x) => s + Math.max(0, x.value), 0)
            if (sum === 0) {
              return (
                <p className="text-sm text-text-dim py-4 text-center">
                  No revenue recorded yet.
                </p>
              )
            }
            return (
              <div className="space-y-5">
                {/* Stacked bar */}
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                  {sources.map((s) =>
                    s.value > 0 ? (
                      <div
                        key={s.key}
                        className={s.color}
                        style={{ width: `${(s.value / sum) * 100}%` }}
                        title={`${s.label}: ${formatCurrency(s.value)}`}
                      />
                    ) : null,
                  )}
                </div>
                {/* Legend rows */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {sources.map((s) => {
                    const pct = sum > 0 ? Math.round((Math.max(0, s.value) / sum) * 100) : 0
                    return (
                      <div key={s.key} className="flex items-start gap-2.5">
                        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${s.color}`} />
                        <div className="min-w-0">
                          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                            {s.label}
                          </p>
                          <p className="text-lg text-text tabular-nums">
                            {formatCurrency(s.value)}
                          </p>
                          <p className="text-xs text-text-dim">{pct}% of revenue</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* Cashflow — monthly cash in (paid payments) vs out (event expenses) */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Cashflow — last 12 months</CardTitle>
        </CardHeader>
        <CardContent>
          {cashflow.some((b) => b.inPence > 0 || b.outPence > 0) ? (
            <div className="space-y-5">
              {/* Themed recharts bar chart with hover tooltip (In / Out / Net) */}
              <CashflowChart data={cashflow} />
              {/* Legend + net */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-dim border-t border-border pt-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-gold" /> Cash in
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent-warm" /> Cash out (event
                  expenses)
                </span>
                <span className="ml-auto text-text-muted">
                  Net 12m:{' '}
                  <span className="text-text tabular-nums">
                    {formatCurrency(cashflow.reduce((s, b) => s + b.netPence, 0))}
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-dim py-4 text-center">
              No cash movement recorded yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Event P&L */}
      {eventPnl.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Event P&amp;L</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventPnl.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/events/${e.id}`)}
                  >
                    <TableCell>
                      <p className="font-medium text-text">{e.title}</p>
                      {e.date && <p className="text-xs text-text-dim">{formatDate(e.date)}</p>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-text-muted">
                      {formatCurrency(e.revenuePence)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-text-muted">
                      {formatCurrency(e.costPence)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${
                        e.profitPence >= 0 ? 'text-text' : 'text-accent-warm'
                      }`}
                    >
                      {formatCurrency(e.profitPence)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        e.profitPence >= 0 ? 'text-text-muted' : 'text-accent-warm'
                      }`}
                    >
                      {e.marginPct === null ? '—' : `${e.marginPct}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Revenue by member + LTV */}
      {sortedMemberRevenue.length > 0 && (
        <Card className="mb-8">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Revenue by member &amp; LTV</CardTitle>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} />}
              loading={recomputing}
              onClick={handleRecomputeLtv}
            >
              Recompute LTV
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">
                    <button
                      onClick={() => toggleMemberSort('revenue')}
                      className="inline-flex items-center gap-1 hover:text-text transition-colors"
                    >
                      Revenue paid
                      <ArrowUpDown size={12} className={memberSort.key === 'revenue' ? 'text-gold' : ''} />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      onClick={() => toggleMemberSort('ltv')}
                      className="inline-flex items-center gap-1 hover:text-text transition-colors"
                    >
                      LTV
                      <ArrowUpDown size={12} className={memberSort.key === 'ltv' ? 'text-gold' : ''} />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMemberRevenue.slice(0, 50).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/members/${m.id}`}
                        className="font-medium text-text hover:text-gold transition-colors"
                      >
                        {m.name}
                      </Link>
                      {m.company && <p className="text-xs text-text-dim">{m.company}</p>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-text-muted">
                      {formatCurrency(m.revenuePaidPence)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-text">
                      {formatCurrency(m.ltvPence)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="px-6 py-3 text-[11px] text-text-dim border-t border-border">
              LTV is the cached lifetime value (members.lifetime_value_pence), refreshed by the
              members score recompute. Showing top {Math.min(50, sortedMemberRevenue.length)} of{' '}
              {sortedMemberRevenue.length} active members.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Overdue Invoices (only if any exist) */}
      {overduePayments.length > 0 && (
        <Card className="mb-6 border-accent-warm/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-accent-warm" />
              <CardTitle>Overdue Invoices</CardTitle>
              <Badge variant="urgent" className="ml-auto">
                {overduePayments.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Member</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overduePayments.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setSelectedPayment(p)}>
                    <TableCell>
                      <p className="font-medium text-text">
                        {memberName(p.members?.profiles)}
                      </p>
                      {p.members?.company_name && (
                        <p className="text-xs text-text-dim">{p.members.company_name}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-text-muted max-w-[200px] truncate">
                      {p.description || '—'}
                    </TableCell>
                    <TableCell className="font-medium text-accent-warm">
                      {formatCurrency(p.amount_pence)}
                    </TableCell>
                    <TableCell className="text-accent-warm">
                      {p.due_date ? formatDate(p.due_date) : '—'}
                    </TableCell>
                    <TableCell>
                      {p.payment_method && (
                        <Badge variant={methodBadge[p.payment_method] ?? 'draft'}>
                          {methodLabels[p.payment_method] ?? p.payment_method}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentPayments.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-text-dim">No payments recorded yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Member</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayments.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setSelectedPayment(p)}>
                    <TableCell>
                      <p className="font-medium text-text">
                        {memberName(p.members?.profiles)}
                      </p>
                      {p.members?.company_name && (
                        <p className="text-xs text-text-dim">{p.members.company_name}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-text-muted">{titleCase(p.payment_type)}</span>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(p.amount_pence)}
                    </TableCell>
                    <TableCell>
                      {p.payment_method ? (
                        <Badge variant={methodBadge[p.payment_method] ?? 'draft'}>
                          {methodLabels[p.payment_method] ?? p.payment_method}
                        </Badge>
                      ) : (
                        <span className="text-text-dim">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {p.paid_at
                        ? formatDate(p.paid_at)
                        : p.due_date
                          ? `Due ${formatDate(p.due_date)}`
                          : formatDate(p.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={paymentStatusBadge[p.status]} dot>
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Payment Detail Modal ───────────────────────────── */}
      {selectedPayment && (
        <Modal
          open={!!selectedPayment}
          onClose={() => setSelectedPayment(null)}
          title="Payment Details"
          size="lg"
        >
          <div className="space-y-6">
            {/* Member + Status */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-medium text-text">
                  {memberName(selectedPayment.members?.profiles)}
                </p>
                {selectedPayment.members?.company_name && (
                  <p className="text-sm text-text-dim">{selectedPayment.members.company_name}</p>
                )}
              </div>
              <Badge variant={paymentStatusBadge[selectedPayment.status]} dot>
                {selectedPayment.status}
              </Badge>
            </div>

            {/* Amount highlight */}
            <div className="bg-surface-2 rounded-lg p-4 text-center">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">Amount</p>
              <p className="text-2xl font-semibold text-text">
                {formatCurrency(selectedPayment.amount_pence)}
              </p>
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">Payment Type</p>
                <p className="text-sm text-text">{titleCase(selectedPayment.payment_type)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">Method</p>
                {selectedPayment.payment_method ? (
                  <Badge variant={methodBadge[selectedPayment.payment_method] ?? 'draft'}>
                    {methodLabels[selectedPayment.payment_method] ?? selectedPayment.payment_method}
                  </Badge>
                ) : (
                  <p className="text-sm text-text-dim">—</p>
                )}
              </div>
            </div>

            {/* Description */}
            {selectedPayment.description && (
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-text">{selectedPayment.description}</p>
              </div>
            )}

            {/* Dates */}
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Dates</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-text">Created</p>
                  <p className="text-sm text-text-muted">{formatDateTime(selectedPayment.created_at)}</p>
                </div>
                {selectedPayment.due_date && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-text">Due Date</p>
                    <p className={`text-sm ${selectedPayment.status === 'overdue' ? 'text-accent-warm font-medium' : 'text-text-muted'}`}>
                      {formatDate(selectedPayment.due_date)}
                    </p>
                  </div>
                )}
                {selectedPayment.paid_at && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-text">Paid</p>
                    <p className="text-sm text-text-muted">{formatDateTime(selectedPayment.paid_at)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Close */}
            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={() => setSelectedPayment(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
