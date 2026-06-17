'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CreditCard, ExternalLink } from 'lucide-react'
import {
  PortalBadge,
  PortalButton,
  PortalCard,
  PortalEmptyState,
  PortalLoading,
  PortalPageHeader,
  PortalSectionTitle,
  type PortalBadgeVariant,
} from '@/components/portal/PortalChrome'
import type { Database } from '@/types/database'

type MemberTier = Database['public']['Enums']['membership_tier']
type MemberStatus = Database['public']['Enums']['membership_status']
type PaymentStatus = Database['public']['Enums']['payment_status']

interface MemberBilling {
  id: string
  membership_tier: MemberTier
  membership_type: string
  membership_status: MemberStatus
  renewal_date: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

// What we show in the Subscription card. Resolved from the matched
// membership_plan — the single source of truth for what members are
// charged and which tier they're on.
interface PlanDisplay {
  /** Plan name to display, e.g. "Business" or "Individual". */
  name: string
  /** Amount charged this cadence in pence (annual or monthly). */
  amount_pence: number
  /** Whether the amount is per month or per year. */
  cadence: 'monthly' | 'annual'
}

interface PaymentRow {
  id: string
  payment_type: string
  amount_pence: number
  status: PaymentStatus
  paid_at: string | null
  description: string | null
  created_at: string
}

const tierLabels: Record<MemberTier, string> = {
  tier_1: 'Tier I',
  tier_2: 'Tier II',
  tier_3: 'Tier III',
}

const paymentStatusVariant: Record<PaymentStatus, PortalBadgeVariant> = {
  paid: 'active',
  pending: 'upcoming',
  overdue: 'urgent',
  refunded: 'draft',
  failed: 'urgent',
}

export function PortalBillingPage() {
  const { profile } = useAuth()
  const [member, setMember] = useState<MemberBilling | null>(null)
  const [planDisplay, setPlanDisplay] = useState<PlanDisplay | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<'subscribe' | 'portal' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile?.id) fetchData(profile.id)
  }, [profile?.id])

  async function fetchData(profileId: string) {
    const { data: memberData } = await supabase
      .from('members')
      .select(
        'id, membership_tier, membership_type, membership_status, renewal_date, stripe_customer_id, stripe_subscription_id',
      )
      .eq('profile_id', profileId)
      .single()

    if (!memberData) {
      setLoading(false)
      return
    }
    setMember(memberData as MemberBilling)

    // Resolve the actual plan + cadence in three steps:
    //   1. Most recent approved application for this profile (has the
    //      original preferred_tier + payment_preference).
    //   2. Match that against `membership_plans` by slug to get name +
    //      price for the cadence the user actually picked.
    //   3. Fall back to membership_tier-derived plan if no application
    //      is on file (e.g. admin-added members).
    //
    // Done in parallel with payments fetch to keep this snappy.
    const [appRes, paymentsRes] = await Promise.all([
      supabase
        .from('membership_applications')
        .select('preferred_tier, payment_preference, amount_paid_pence')
        .eq('email', profile?.email ?? '__none__')
        .eq('status', 'approved')
        .order('reviewed_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('payments')
        .select('id, payment_type, amount_pence, status, paid_at, description, created_at')
        .eq('member_id', memberData.id)
        .eq('payment_type', 'membership')
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    const cadence: 'monthly' | 'annual' =
      (appRes.data?.payment_preference as 'monthly' | 'annual' | undefined) ??
      'monthly'
    const planSlug = appRes.data?.preferred_tier ?? null

    let plan: PlanDisplay | null = null

    // 1. Plan from membership_plans by slug
    if (planSlug) {
      const { data: planRow } = await supabase
        .from('membership_plans')
        .select('name, annual_price_pence, monthly_price_pence')
        .eq('slug', planSlug)
        .eq('is_active', true)
        .maybeSingle()
      if (planRow) {
        plan = {
          name: planRow.name,
          amount_pence:
            cadence === 'annual'
              ? planRow.annual_price_pence
              : planRow.monthly_price_pence,
          cadence,
        }
      }
    }

    // 2. Fallback to membership_plans by tier_classification (manual
    //    members never went through the public form, so they don't have
    //    a preferred_tier on file).
    if (!plan) {
      const { data: byTier } = await supabase
        .from('membership_plans')
        .select('name, annual_price_pence, monthly_price_pence')
        .eq('tier_classification', memberData.membership_tier)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (byTier) {
        plan = {
          name: byTier.name,
          amount_pence:
            cadence === 'annual'
              ? byTier.annual_price_pence
              : byTier.monthly_price_pence,
          cadence,
        }
      }
    }

    setPlanDisplay(plan)
    if (paymentsRes.data) setPayments(paymentsRes.data as unknown as PaymentRow[])
    setLoading(false)
  }

  async function handleSetupSubscription() {
    setActionLoading('subscribe')
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('subscription-checkout', {
        body: {},
      })
      if (fnError || !data?.url) {
        setError(
          await extractFunctionErrorMessage(fnError, data, 'Failed to create checkout session'),
        )
        setActionLoading(null)
        return
      }
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setActionLoading(null)
    }
  }

  async function handleManageBilling() {
    setActionLoading('portal')
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('billing-portal', { body: {} })
      if (fnError || !data?.url) {
        setError(await extractFunctionErrorMessage(fnError, data, 'Failed to open billing portal'))
        setActionLoading(null)
        return
      }
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setActionLoading(null)
    }
  }

  async function extractFunctionErrorMessage(
    fnError: { message?: string; context?: { response?: Response } } | null,
    data: unknown,
    fallback: string,
  ): Promise<string> {
    if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
      return String((data as Record<string, unknown>).error)
    }
    try {
      const response = fnError?.context?.response
      if (response) {
        const text = await response.clone().text()
        try {
          const json = JSON.parse(text)
          if (json?.error) return String(json.error)
        } catch {
          if (text && text.length < 240) return text
        }
      }
    } catch {
      /* fall through */
    }
    return fnError?.message || fallback
  }

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-12">
        <PortalLoading label="Loading billing" />
      </div>
    )
  }

  if (!member) {
    return (
      <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-16">
        <PortalEmptyState
          icon={<CreditCard size={18} strokeWidth={1.5} />}
          title="Member record not found."
          description="Speak to The Club team if you think this is an error."
        />
      </div>
    )
  }

  const hasSubscription = !!member.stripe_subscription_id

  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
      <PortalPageHeader
        eyebrow="The Ledger"
        title="Billing."
        subtitle="Your subscription, your renewal date, and a record of every membership payment."
      />

      {error && (
        <div className="mb-6 px-5 py-4 border-l-2 border-rose-500/70 bg-rose-900/15">
          <p className="font-[family-name:var(--font-editorial)] italic text-[13.5px] text-rose-200">
            {error}
          </p>
        </div>
      )}

      {/* Subscription summary */}
      <PortalCard className="mb-6 p-6 lg:p-8">
        <PortalSectionTitle eyebrow="Subscription">
          <span className="inline-flex items-center gap-2.5">
            <CreditCard size={14} strokeWidth={1.5} className="text-bronze-light" />
            Current standing.
          </span>
        </PortalSectionTitle>

        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-6">
          <div>
            <dt className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light/85 mb-2">
              Status
            </dt>
            <dd>
              {hasSubscription ? (
                <PortalBadge variant="active" dot>
                  Active
                </PortalBadge>
              ) : (
                <PortalBadge variant="draft" dot>
                  No subscription
                </PortalBadge>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light/85 mb-2">
              Plan
            </dt>
            <dd className="font-[family-name:var(--font-display)] text-[15px] text-ivory leading-tight">
              {planDisplay?.name ?? tierLabels[member.membership_tier]}
              <span className="text-ivory-soft font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] ml-2">
                · {member.membership_type}
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light/85 mb-2">
              {planDisplay?.cadence === 'annual' ? 'Annually' : 'Monthly'}
            </dt>
            <dd className="font-[family-name:var(--font-display)] text-[15px] text-ivory leading-tight tabular-nums">
              {planDisplay ? formatCurrency(planDisplay.amount_pence) : '—'}
              <span className="text-slate-haze font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] ml-1">
                / {planDisplay?.cadence === 'annual' ? 'year' : 'month'}
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light/85 mb-2">
              Next billing
            </dt>
            <dd className="font-[family-name:var(--font-display)] text-[15px] text-ivory leading-tight">
              {member.renewal_date ? formatDate(member.renewal_date) : '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-7 flex gap-3">
          {hasSubscription ? (
            <PortalButton
              variant="secondary"
              icon={<ExternalLink size={13} strokeWidth={1.5} />}
              loading={actionLoading === 'portal'}
              onClick={handleManageBilling}
            >
              Manage billing
            </PortalButton>
          ) : (
            <PortalButton
              icon={<CreditCard size={13} strokeWidth={1.5} />}
              loading={actionLoading === 'subscribe'}
              onClick={handleSetupSubscription}
            >
              Set up subscription
            </PortalButton>
          )}
        </div>
      </PortalCard>

      {/* Payment history */}
      <PortalCard className="p-6 lg:p-8">
        <PortalSectionTitle eyebrow="History">Payments.</PortalSectionTitle>

        {payments.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-[family-name:var(--font-editorial)] italic text-[14px] text-ivory-soft/85">
              No membership payments yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-graphite-line/55">
                  {['Description', 'Amount', 'Date', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="pb-4 font-[family-name:var(--font-meta)] text-[9.5px] font-medium uppercase tracking-[0.32em] text-bronze-light/85"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-graphite-line/30 hover:bg-graphite/30 transition-colors"
                  >
                    <td className="py-4 font-[family-name:var(--font-editorial)] text-[13.5px] text-ivory-soft">
                      {p.description || 'Membership payment'}
                    </td>
                    <td className="py-4 font-[family-name:var(--font-display)] text-[14px] text-ivory tabular-nums">
                      {formatCurrency(p.amount_pence)}
                    </td>
                    <td className="py-4 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.22em] text-slate-haze">
                      {p.paid_at ? formatDate(p.paid_at) : formatDate(p.created_at)}
                    </td>
                    <td className="py-4">
                      <PortalBadge variant={paymentStatusVariant[p.status]} dot>
                        {p.status}
                      </PortalBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PortalCard>
    </div>
  )
}
