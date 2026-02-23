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
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { formatCurrency, formatDate, formatDateTime } from '../../../lib/utils'
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
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null)

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
