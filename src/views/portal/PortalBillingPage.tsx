'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { formatDate, formatCurrency } from '@/lib/utils'
import { CreditCard, ExternalLink } from 'lucide-react'
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

interface TierPricing {
  name: string
  price_pence: number
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
  tier_1: 'Tier 1',
  tier_2: 'Tier 2',
  tier_3: 'Tier 3',
}

const statusVariant: Record<MemberStatus, 'active' | 'upcoming' | 'draft' | 'urgent'> = {
  active: 'active',
  pending: 'upcoming',
  expired: 'draft',
  cancelled: 'urgent',
}

const paymentStatusVariant: Record<PaymentStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  paid: 'active',
  pending: 'upcoming',
  overdue: 'urgent',
  refunded: 'draft',
  failed: 'urgent',
}

export function PortalBillingPage() {
  const { profile } = useAuth()
  const [member, setMember] = useState<MemberBilling | null>(null)
  const [tierPricing, setTierPricing] = useState<TierPricing | null>(null)
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
      .select('id, membership_tier, membership_type, membership_status, renewal_date, stripe_customer_id, stripe_subscription_id')
      .eq('profile_id', profileId)
      .single()

    if (!memberData) {
      setLoading(false)
      return
    }

    setMember(memberData as MemberBilling)

    // Fetch tier pricing and membership payments in parallel
    const [tierRes, paymentsRes] = await Promise.all([
      supabase
        .from('membership_tiers')
        .select('name, price_pence')
        .eq('tier', memberData.membership_tier)
        .eq('membership_type', memberData.membership_type)
        .eq('billing_interval', 'month')
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('payments')
        .select('id, payment_type, amount_pence, status, paid_at, description, created_at')
        .eq('member_id', memberData.id)
        .eq('payment_type', 'membership')
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (tierRes.data) setTierPricing(tierRes.data)
    if (paymentsRes.data) setPayments(paymentsRes.data as unknown as PaymentRow[])
    setLoading(false)
  }

  async function handleSetupSubscription() {
    setActionLoading('subscribe')
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'subscription-checkout',
        { body: {} }
      )

      if (fnError || !data?.url) {
        setError(fnError?.message || 'Failed to create checkout session')
        setActionLoading(null)
        return
      }

      window.location.href = data.url
    } catch {
      setError('Something went wrong. Please try again.')
      setActionLoading(null)
    }
  }

  async function handleManageBilling() {
    setActionLoading('portal')
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'billing-portal',
        { body: {} }
      )

      if (fnError || !data?.url) {
        setError(fnError?.message || 'Failed to open billing portal')
        setActionLoading(null)
        return
      }

      window.location.href = data.url
    } catch {
      setError('Something went wrong. Please try again.')
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12">
        <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
        <span className="text-sm text-text-muted">Loading billing...</span>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-text-dim">Member record not found.</p>
      </div>
    )
  }

  const hasSubscription = !!member.stripe_subscription_id

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          Billing
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Manage your membership subscription and payment history
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-accent-warm/10 border border-accent-warm/20 rounded-[var(--radius-md)]">
          <p className="text-sm text-accent-warm">{error}</p>
        </div>
      )}

      {/* Subscription Status */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-gold" />
            <CardTitle>Subscription</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Status
                </p>
                <div className="mt-1">
                  {hasSubscription ? (
                    <Badge variant="active" dot>Active</Badge>
                  ) : (
                    <Badge variant="draft" dot>No Subscription</Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Tier
                </p>
                <p className="text-sm font-medium text-text mt-1">
                  {tierLabels[member.membership_tier]} — <span className="capitalize">{member.membership_type}</span>
                </p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Monthly Price
                </p>
                <p className="text-sm font-medium text-text mt-1">
                  {tierPricing ? formatCurrency(tierPricing.price_pence) : '—'}
                  <span className="text-text-dim font-normal">/month</span>
                </p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Next Billing Date
                </p>
                <p className="text-sm font-medium text-text mt-1">
                  {member.renewal_date ? formatDate(member.renewal_date) : '—'}
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              {hasSubscription ? (
                <Button
                  variant="secondary"
                  icon={<ExternalLink size={14} />}
                  loading={actionLoading === 'portal'}
                  onClick={handleManageBilling}
                >
                  Manage Billing
                </Button>
              ) : (
                <Button
                  icon={<CreditCard size={14} />}
                  loading={actionLoading === 'subscribe'}
                  onClick={handleSetupSubscription}
                >
                  Set Up Subscription
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-text-dim">No membership payments yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-text-muted">
                      {p.description || 'Membership payment'}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(p.amount_pence)}
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {p.paid_at ? formatDate(p.paid_at) : formatDate(p.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={paymentStatusVariant[p.status]} dot>
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
    </div>
  )
}
