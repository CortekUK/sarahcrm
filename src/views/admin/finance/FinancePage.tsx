'use client'

import { useEffect, useState } from 'react'
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
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'
import type { Database } from '@/types/database'

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
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [revenueBySource, setRevenueBySource] = useState({
    membership: 0,
    events: 0,
    sponsorship: 0,
  })
  const [outstanding, setOutstanding] = useState(0)
  const [activeSubscriptions, setActiveSubscriptions] = useState(0)
  const [mrr, setMrr] = useState(0)
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([])
  const [overduePayments, setOverduePayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null)

  useEffect(() => {
    fetchFinanceData()
  }, [])

  async function fetchFinanceData() {
    const [
      revenueRes,
      bookingsRevenueRes,
      refundedApplicationsRes,
      pendingPaidApplicationsRes,
      outstandingRes,
      recentRes,
      recentGuestBookingsRes,
      overdueRes,
      subsRes,
      mrrRes,
      sponsorshipsRes,
    ] = await Promise.all([
      // Membership / event-via-member revenue (paid payment rows).
      // payment_type splits these into membership vs event income for
      // the "Revenue by source" breakdown.
      supabase
        .from('payments')
        .select('amount_pence, payment_type')
        .eq('status', 'paid'),

      // Guest event-booking revenue — payments.member_id is NOT NULL so
      // guest bookings never get a payment row. Sum directly from
      // bookings to make their revenue visible in totals.
      supabase
        .from('bookings')
        .select('amount_pence')
        .eq('status', 'confirmed')
        .is('member_id', null),

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
          id, payment_type, amount_pence, status, payment_method, due_date, paid_at, description, created_at,
          members(company_name, profiles(first_name, last_name))
        `)
        .order('created_at', { ascending: false })
        .limit(15),

      // Recent guest bookings — synthesised into PaymentRow shape below
      // so they appear alongside member payments in the Recent Payments
      // table. Without this, guest ticket revenue shows in the total
      // but the row itself is invisible.
      supabase
        .from('bookings')
        .select(
          'id, amount_pence, payment_method, created_at, guest_name, guest_company, events(title)',
        )
        .eq('status', 'confirmed')
        .is('member_id', null)
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
      supabase
        .from('sponsorships')
        .select('amount_pence, status')
        .in('status', ['confirmed', 'invoiced', 'paid']),
    ])

    const paymentsRevenue = (revenueRes.data ?? []).reduce(
      (sum, p) => sum + (p.amount_pence ?? 0),
      0,
    )
    // Split paid payment rows by type so we can attribute them to the
    // right source. Anything that isn't an event booking is treated as
    // membership income (the dominant case).
    const membershipPayments = (revenueRes.data ?? [])
      .filter((p) => p.payment_type !== 'event_booking')
      .reduce((sum, p) => sum + (p.amount_pence ?? 0), 0)
    const eventMemberPayments = (revenueRes.data ?? [])
      .filter((p) => p.payment_type === 'event_booking')
      .reduce((sum, p) => sum + (p.amount_pence ?? 0), 0)
    const bookingsRevenue = (bookingsRevenueRes.data ?? []).reduce(
      (sum, b) => sum + (b.amount_pence ?? 0),
      0,
    )
    // Committed sponsorship fees (confirmed / invoiced / paid).
    const sponsorshipRevenue = (sponsorshipsRes.data ?? []).reduce(
      (sum, s) => sum + (s.amount_pence ?? 0),
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
        bookingsRevenue +
        sponsorshipRevenue +
        pendingPaidTotal +
        refundedOriginalsTotal -
        refundedTotal,
    )
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
      events: eventMemberPayments + bookingsRevenue,
      sponsorship: sponsorshipRevenue,
    })
    setOutstanding(
      (outstandingRes.data ?? []).reduce((sum, p) => sum + (p.amount_pence ?? 0), 0)
    )
    setActiveSubscriptions(subsRes.count ?? 0)

    // Synthesise guest bookings + refunded applications into the
    // PaymentRow shape and merge with real payments, then sort by
    // created_at desc and trim to 15.
    const memberPaymentRows = (recentRes.data ?? []) as unknown as PaymentRow[]
    const guestBookingRows: PaymentRow[] = (recentGuestBookingsRes.data ?? []).map((b) => {
      const ev = b.events as { title: string | null } | null
      return {
        id: b.id,
        payment_type: 'event_booking',
        amount_pence: b.amount_pence ?? 0,
        status: 'paid' as PaymentStatus,
        payment_method: (b.payment_method ?? 'stripe') as PaymentMethod,
        due_date: null,
        paid_at: b.created_at,
        description: ev?.title ? `Event booking — ${ev.title} (guest)` : 'Event booking (guest)',
        created_at: b.created_at,
        members: {
          company_name: b.guest_company ?? null,
          profiles: {
            first_name: b.guest_name ?? 'Guest',
            last_name: '',
          },
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
      ...guestBookingRows,
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

    setLoading(false)
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
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
                      <span className="text-text-muted capitalize">{p.payment_type}</span>
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
                <p className="text-sm text-text capitalize">{selectedPayment.payment_type}</p>
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
