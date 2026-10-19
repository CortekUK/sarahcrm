'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CreditCard, ExternalLink, Landmark } from 'lucide-react'
import { apiClient, getApiErrorMessage } from '@/lib/http'
import {
  DIRECT_DEBIT_LABEL,
  DIRECT_DEBIT_STATUS_LABEL,
  DIRECT_DEBIT_TIMING_COPY,
  isDirectDebitEnabled,
  isDirectDebitStatus,
  type DirectDebitStatus,
} from '@/lib/billing/direct-debit'
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
  // Set when this row is a rep under an organisation's primary account.
  // Reps don't carry their own Stripe fields — billing is the parent's.
  parent_member_id: string | null
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

// Direct Debit (Stripe Bacs) — read separately from the main member query
// so a not-yet-applied migration can never break this page.
interface DirectDebitInfo {
  payment_method_type: string | null
  status: DirectDebitStatus | null
  reference: string | null
}

const ddStatusVariant: Record<DirectDebitStatus, PortalBadgeVariant> = {
  active: 'active',
  pending: 'upcoming',
  failed: 'urgent',
  inactive: 'draft',
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
  const [actionLoading, setActionLoading] = useState<
    'subscribe' | 'portal' | 'subscribe_dd' | 'switch_dd' | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const directDebitEnabled = isDirectDebitEnabled()
  const [directDebit, setDirectDebit] = useState<DirectDebitInfo | null>(null)
  const [ddNotice, setDdNotice] = useState<string | null>(null)

  // Returning from Stripe's Direct Debit pages.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const dd = params.get('direct_debit')
    if (dd === 'success') {
      setDdNotice(
        `Your Direct Debit is being set up. Your bank confirms it within about 3 working days. ${DIRECT_DEBIT_TIMING_COPY}`,
      )
    } else if (dd === 'cancelled') {
      setDdNotice('Direct Debit set-up was cancelled. Nothing has changed.')
    }
    if (dd) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  useEffect(() => {
    if (profile?.id) fetchData(profile.id)
  }, [profile?.id])

  async function fetchData(profileId: string) {
    const { data: memberData } = await supabase
      .from('members')
      .select(
        'id, membership_tier, membership_type, membership_status, renewal_date, stripe_customer_id, stripe_subscription_id, parent_member_id',
      )
      .eq('profile_id', profileId)
      .single()

    if (!memberData) {
      setLoading(false)
      return
    }
    setMember(memberData as MemberBilling)

    // Direct Debit fields (new columns) — own query, failures ignored.
    void supabase
      .from('members')
      .select('stripe_payment_method_type, direct_debit_status, direct_debit_reference')
      .eq('id', memberData.id)
      .maybeSingle()
      .then(({ data, error: ddErr }) => {
        if (ddErr || !data) return
        const row = data as unknown as {
          stripe_payment_method_type: string | null
          direct_debit_status: string | null
          direct_debit_reference: string | null
        }
        setDirectDebit({
          payment_method_type: row.stripe_payment_method_type,
          status: isDirectDebitStatus(row.direct_debit_status) ? row.direct_debit_status : null,
          reference: row.direct_debit_reference,
        })
      })

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

  // New subscription paid by Direct Debit — same edge function as card,
  // restricted to Bacs via { payment_method: 'bacs_debit' }.
  async function handleSetupDirectDebitSubscription() {
    setActionLoading('subscribe_dd')
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('subscription-checkout', {
        body: { payment_method: 'bacs_debit' },
      })
      if (fnError || !data?.url) {
        setError(
          await extractFunctionErrorMessage(fnError, data, 'Failed to start Direct Debit set-up'),
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

  // Existing subscription → switch future payments to Direct Debit.
  async function handleSwitchToDirectDebit() {
    setActionLoading('switch_dd')
    setError(null)
    try {
      const { data } = await apiClient.post<{ url?: string }>('/api/portal/billing/direct-debit', {})
      if (!data.url) {
        setError('Could not open Direct Debit set-up.')
        setActionLoading(null)
        return
      }
      window.location.href = data.url
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not open Direct Debit set-up.'))
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
  // Reps sit under an organisation's primary account — the parent pays,
  // so reps must not see subscribe / manage-billing controls (those would
  // create or alter a duplicate subscription for an already-paid account).
  const isRep = !!member.parent_member_id
  // Members are charged net + 20% VAT (stored quoted_amount_pence = net*1.2).
  // The plan tables hold the NET price, so we gross it up for display.
  const planAmountInclVat = planDisplay
    ? Math.round(planDisplay.amount_pence * 1.2)
    : null

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

      {ddNotice && (
        <div className="mb-6 px-5 py-4 border-l-2 border-bronze/70 bg-bronze/[0.06]">
          <p className="font-[family-name:var(--font-editorial)] italic text-[13.5px] text-ivory-soft">
            {ddNotice}
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
              {planAmountInclVat != null ? formatCurrency(planAmountInclVat) : '—'}
              <span className="text-slate-haze font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] ml-1">
                / {planDisplay?.cadence === 'annual' ? 'year' : 'month'}
              </span>
              {planAmountInclVat != null && (
                <span className="block mt-0.5 text-slate-haze font-[family-name:var(--font-meta)] text-[9px] uppercase tracking-[0.22em] normal-case">
                  incl. VAT
                </span>
              )}
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

        {/* Payment method — Direct Debit (Stripe Bacs) status, when known. */}
        {!isRep && directDebit?.payment_method_type === 'bacs_debit' && (
          <div className="mt-6 pt-6 border-t border-graphite-line/40 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light/85 mb-2">
                Payment method
              </p>
              <p className="inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-[15px] text-ivory leading-tight">
                <Landmark size={14} strokeWidth={1.5} className="text-bronze-light" />
                {DIRECT_DEBIT_LABEL}
              </p>
            </div>
            {directDebit.status && (
              <PortalBadge variant={ddStatusVariant[directDebit.status]} dot>
                {DIRECT_DEBIT_STATUS_LABEL[directDebit.status]}
              </PortalBadge>
            )}
            {directDebit.reference && (
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] text-slate-haze">
                Mandate ref · {directDebit.reference}
              </p>
            )}
            <p className="basis-full font-[family-name:var(--font-editorial)] italic text-[12.5px] text-ivory-soft/80">
              {directDebit.status === 'failed' || directDebit.status === 'inactive'
                ? 'Your Direct Debit is no longer active. Set it up again below, or update your card via Manage billing.'
                : DIRECT_DEBIT_TIMING_COPY}
            </p>
          </div>
        )}

        {isRep ? (
          <p className="mt-7 font-[family-name:var(--font-editorial)] italic text-[13.5px] leading-[1.7] text-ivory-soft/85">
            Billing for your membership is handled by your organisation&apos;s
            primary account.
          </p>
        ) : (
          <>
          <div className="mt-7 flex flex-wrap gap-3">
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
            {/* Direct Debit (Stripe Bacs) — additional option, flag-gated. */}
            {directDebitEnabled &&
              (hasSubscription ? (
                (directDebit?.payment_method_type !== 'bacs_debit' ||
                  directDebit.status === 'failed' ||
                  directDebit.status === 'inactive') && (
                  <PortalButton
                    variant="secondary"
                    icon={<Landmark size={13} strokeWidth={1.5} />}
                    loading={actionLoading === 'switch_dd'}
                    onClick={handleSwitchToDirectDebit}
                  >
                    Pay by Direct Debit
                  </PortalButton>
                )
              ) : (
                <PortalButton
                  variant="secondary"
                  icon={<Landmark size={13} strokeWidth={1.5} />}
                  loading={actionLoading === 'subscribe_dd'}
                  onClick={handleSetupDirectDebitSubscription}
                >
                  Set up with Direct Debit
                </PortalButton>
              ))}
          </div>
          {directDebitEnabled && directDebit?.payment_method_type !== 'bacs_debit' && (
            <p className="mt-3 font-[family-name:var(--font-editorial)] italic text-[12.5px] text-ivory-soft/75">
              {DIRECT_DEBIT_LABEL} — {DIRECT_DEBIT_TIMING_COPY}
            </p>
          )}
          </>
        )}
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
