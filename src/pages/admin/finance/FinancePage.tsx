import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase/client'
import { StatCard } from '../../../components/ui/StatCard'
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/Table'
import { formatCurrency, formatDate } from '../../../lib/utils'
import { AlertTriangle } from 'lucide-react'
import type { Database } from '../../../types/database'

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
  const [outstanding, setOutstanding] = useState(0)
  const [activeMemberships, setActiveMemberships] = useState(0)
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([])
  const [overduePayments, setOverduePayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFinanceData()
  }, [])

  async function fetchFinanceData() {
    const [revenueRes, outstandingRes, membersRes, recentRes, overdueRes] =
      await Promise.all([
        // Total revenue (all paid)
        supabase
          .from('payments')
          .select('amount_pence')
          .eq('status', 'paid'),

        // Outstanding (pending + overdue)
        supabase
          .from('payments')
          .select('amount_pence')
          .in('status', ['pending', 'overdue']),

        // Active memberships
        supabase
          .from('members')
          .select('id', { count: 'exact', head: true })
          .eq('membership_status', 'active')
          .is('deleted_at', null),

        // Recent payments (last 15)
        supabase
          .from('payments')
          .select(`
            id, payment_type, amount_pence, status, payment_method, due_date, paid_at, description, created_at,
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
      ])

    setTotalRevenue(
      (revenueRes.data ?? []).reduce((sum, p) => sum + (p.amount_pence ?? 0), 0)
    )
    setOutstanding(
      (outstandingRes.data ?? []).reduce((sum, p) => sum + (p.amount_pence ?? 0), 0)
    )
    setActiveMemberships(membersRes.count ?? 0)
    setRecentPayments((recentRes.data ?? []) as unknown as PaymentRow[])
    setOverduePayments((overdueRes.data ?? []) as unknown as PaymentRow[])
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <StatCard
          label="Total Revenue"
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
          label="Active Memberships"
          value={activeMemberships.toLocaleString('en-GB')}
          changeText="currently active"
          changeType="neutral"
        />
      </div>

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
                  <TableRow key={p.id}>
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
                  <TableRow key={p.id}>
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
    </div>
  )
}
