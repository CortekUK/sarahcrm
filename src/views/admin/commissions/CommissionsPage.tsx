'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Badge } from '@/components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { toast } from '@/lib/hooks/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Loader2, Coins, ArrowDownLeft, ArrowUpRight, Check, Undo2 } from 'lucide-react'

// ── Domain model ──────────────────────────────────────────
// Commissions have a DIRECTION and must never be merged into a single
// figure:
//   • Receivable — the Club EARNS: introduced-business commission
//     (introductions.commission_pence) + concierge commission
//     (concierge_requests.commission_pence). Money owed TO the Club.
//   • Payable — the Club OWES a member: referral payouts
//     (reward_referrals.commission_pence). Money owed BY the Club.
//
// This view is read-mostly: it reads the three source tables live and
// never duplicates their data. The only writes are the paid-flag on the
// origin row (mark paid / mark unpaid).

type Source = 'introduction' | 'concierge' | 'referral'
type Direction = 'receivable' | 'payable'
type Status = 'owed' | 'paid'

interface CommissionRow {
  key: string
  id: string
  source: Source
  direction: Direction
  counterparty: string
  detail: string | null
  commissionPence: number
  status: Status
  date: string | null
  href: string
}

const SOURCE_META: Record<Source, { label: string; variant: 'info' | 'upcoming' | 'active' }> = {
  introduction: { label: 'Introduction', variant: 'info' },
  concierge: { label: 'Concierge', variant: 'active' },
  referral: { label: 'Referral', variant: 'upcoming' },
}

const DIRECTION_META: Record<
  Direction,
  { label: string; variant: 'info' | 'urgent'; Icon: typeof ArrowDownLeft }
> = {
  receivable: { label: 'Receivable', variant: 'info', Icon: ArrowDownLeft },
  payable: { label: 'Payable', variant: 'urgent', Icon: ArrowUpRight },
}

const STATUS_META: Record<Status, { label: string; variant: 'upcoming' | 'active' }> = {
  owed: { label: 'Owed', variant: 'upcoming' },
  paid: { label: 'Paid', variant: 'active' },
}

const SOURCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'introduction', label: 'Introduction' },
  { value: 'concierge', label: 'Concierge' },
  { value: 'referral', label: 'Referral' },
]
const DIRECTION_FILTER_OPTIONS = [
  { value: 'all', label: 'All directions' },
  { value: 'receivable', label: 'Receivable — Club earns' },
  { value: 'payable', label: 'Payable — Club owes' },
]
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'owed', label: 'Owed' },
  { value: 'paid', label: 'Paid' },
]

function personName(p: { first_name: string | null; last_name: string | null } | null | undefined): string {
  if (!p) return 'Unnamed'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed'
}

type ProfileLite = { first_name: string | null; last_name: string | null } | null

interface IntroRow {
  id: string
  commission_pence: number | null
  commission_status: string
  deal_closed_at: string | null
  followed_up_at: string | null
  created_at: string
  member_a: { profiles: ProfileLite } | null
  member_b: { profiles: ProfileLite } | null
}
interface ConciergeRow {
  id: string
  commission_pence: number | null
  commission_status: string
  request_type: string
  delivered_at: string | null
  created_at: string
  members: { profiles: ProfileLite } | null
}
interface ReferralRow {
  id: string
  commission_pence: number | null
  status: string
  referred_name: string | null
  created_at: string
  members: { profiles: ProfileLite } | null
}

export function CommissionsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<CommissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [sourceFilter, setSourceFilter] = useState('all')
  const [directionFilter, setDirectionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [introRes, conciergeRes, referralRes] = await Promise.all([
      supabase
        .from('introductions')
        .select(
          `id, commission_pence, commission_status, deal_closed_at, followed_up_at, created_at,
           member_a:members!introductions_member_a_id_fkey(profiles(first_name, last_name)),
           member_b:members!introductions_member_b_id_fkey(profiles(first_name, last_name))`,
        )
        .not('commission_pence', 'is', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('concierge_requests')
        .select(
          `id, commission_pence, commission_status, request_type, delivered_at, created_at,
           members(profiles(first_name, last_name))`,
        )
        .not('commission_pence', 'is', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('reward_referrals')
        .select(
          `id, commission_pence, status, referred_name, created_at,
           members(profiles(first_name, last_name))`,
        )
        .not('commission_pence', 'is', null)
        .order('created_at', { ascending: false }),
    ])

    const introRows: CommissionRow[] = ((introRes.data as unknown as IntroRow[]) ?? []).map((r) => ({
      key: `introduction-${r.id}`,
      id: r.id,
      source: 'introduction',
      direction: 'receivable',
      counterparty: `${personName(r.member_a?.profiles)} ↔ ${personName(r.member_b?.profiles)}`,
      detail: 'Introduced business',
      commissionPence: r.commission_pence ?? 0,
      status: r.commission_status === 'paid' ? 'paid' : 'owed',
      date: r.deal_closed_at ?? r.followed_up_at ?? r.created_at,
      href: `/dashboard/introductions/${r.id}`,
    }))

    const conciergeRows: CommissionRow[] = (
      (conciergeRes.data as unknown as ConciergeRow[]) ?? []
    ).map((r) => ({
      key: `concierge-${r.id}`,
      id: r.id,
      source: 'concierge',
      direction: 'receivable',
      counterparty: personName(r.members?.profiles),
      detail: r.request_type,
      commissionPence: r.commission_pence ?? 0,
      status: r.commission_status === 'paid' ? 'paid' : 'owed',
      date: r.delivered_at ?? r.created_at,
      href: `/dashboard/concierge`,
    }))

    const referralRows: CommissionRow[] = (
      (referralRes.data as unknown as ReferralRow[]) ?? []
    ).map((r) => ({
      key: `referral-${r.id}`,
      id: r.id,
      source: 'referral',
      direction: 'payable',
      counterparty: personName(r.members?.profiles),
      detail: r.referred_name ? `Referred ${r.referred_name}` : 'Member referral',
      commissionPence: r.commission_pence ?? 0,
      status: r.status === 'paid' ? 'paid' : 'owed',
      date: r.created_at,
      href: `/dashboard/rewards`,
    }))

    const all = [...introRows, ...conciergeRows, ...referralRows].sort((a, b) => {
      const at = a.date ? new Date(a.date).getTime() : 0
      const bt = b.date ? new Date(b.date).getTime() : 0
      return bt - at
    })
    setRows(all)
    setLoading(false)
  }

  // Stat tiles — receivable and payable kept strictly separate.
  const stats = useMemo(() => {
    let receivableOwed = 0
    let receivableReceived = 0
    let payableOwed = 0
    let payablePaid = 0
    for (const r of rows) {
      if (r.direction === 'receivable') {
        if (r.status === 'owed') receivableOwed += r.commissionPence
        else receivableReceived += r.commissionPence
      } else {
        if (r.status === 'owed') payableOwed += r.commissionPence
        else payablePaid += r.commissionPence
      }
    }
    return { receivableOwed, receivableReceived, payableOwed, payablePaid }
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false
      if (directionFilter !== 'all' && r.direction !== directionFilter) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      return true
    })
  }, [rows, sourceFilter, directionFilter, statusFilter])

  // Mark a commission paid / unpaid by writing the paid-flag back on the
  // ORIGIN table. Optimistic update + toast; reload on error.
  async function togglePaid(row: CommissionRow) {
    const next: Status = row.status === 'paid' ? 'owed' : 'paid'
    setBusyKey(row.key)
    setRows((prev) => prev.map((x) => (x.key === row.key ? { ...x, status: next } : x)))

    let error: { message: string } | null = null
    if (row.source === 'introduction') {
      const res = await supabase
        .from('introductions')
        .update({
          commission_status: next === 'paid' ? 'paid' : 'pending',
          commission_paid_at: next === 'paid' ? new Date().toISOString() : null,
        })
        .eq('id', row.id)
      error = res.error
    } else if (row.source === 'concierge') {
      const res = await supabase
        .from('concierge_requests')
        .update({
          commission_status: next === 'paid' ? 'paid' : 'pending',
          commission_paid_at: next === 'paid' ? new Date().toISOString() : null,
        })
        .eq('id', row.id)
      error = res.error
    } else {
      const res = await supabase
        .from('reward_referrals')
        .update({ status: next === 'paid' ? 'paid' : 'pending' })
        .eq('id', row.id)
      error = res.error
    }

    setBusyKey(null)
    if (error) {
      toast({ title: 'Could not update commission', description: error.message, variant: 'destructive' })
      load()
      return
    }
    toast({
      title: next === 'paid' ? 'Marked paid' : 'Marked unpaid',
      description:
        row.direction === 'receivable'
          ? next === 'paid'
            ? 'Recorded as received by the Club.'
            : 'Back to owed to the Club.'
          : next === 'paid'
            ? 'Recorded as paid out to the member.'
            : 'Back to owed to the member.',
    })
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading commissions…
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Commissions"
        description="Every commission across introductions, concierge and referrals in one ledger — tracked end-to-end from owed to paid. Receivable (the Club earns) and payable (the Club owes members) are kept distinct."
      />

      {/* Stat tiles — receivable and payable never summed together. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard
          label="Receivable — owed to Club"
          value={formatCurrency(stats.receivableOwed)}
          changeText="intros + concierge"
          changeType={stats.receivableOwed > 0 ? 'neutral' : 'positive'}
        />
        <StatCard
          label="Receivable — received"
          value={formatCurrency(stats.receivableReceived)}
          changeText="collected to date"
          changeType="positive"
        />
        <StatCard
          label="Payable — owed to members"
          value={formatCurrency(stats.payableOwed)}
          changeText="referral payouts due"
          changeType={stats.payableOwed > 0 ? 'negative' : 'positive'}
        />
        <StatCard
          label="Payable — paid out"
          value={formatCurrency(stats.payablePaid)}
          changeText="settled to members"
          changeType="positive"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="sm:w-52">
          <SelectMenu
            ariaLabel="Filter by source"
            value={sourceFilter}
            onValueChange={setSourceFilter}
            options={SOURCE_FILTER_OPTIONS}
          />
        </div>
        <div className="sm:w-56">
          <SelectMenu
            ariaLabel="Filter by direction"
            value={directionFilter}
            onValueChange={setDirectionFilter}
            options={DIRECTION_FILTER_OPTIONS}
          />
        </div>
        <div className="sm:w-44">
          <SelectMenu
            ariaLabel="Filter by status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={STATUS_FILTER_OPTIONS}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-16">
              <AdminEmptyState
                icon={Coins}
                title="No commissions here"
                description="Commissions appear once recorded on a won introduction, a concierge request, or a member referral. Set a commission on the origin record to start tracking it."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Source</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const src = SOURCE_META[r.source]
                  const dir = DIRECTION_META[r.direction]
                  return (
                    <TableRow
                      key={r.key}
                      className="cursor-pointer"
                      onClick={() => router.push(r.href)}
                    >
                      <TableCell>
                        <Badge variant={src.variant}>{src.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-text-muted">
                          <dir.Icon
                            size={14}
                            className={r.direction === 'receivable' ? 'text-accent' : 'text-accent-warm'}
                          />
                          {dir.label}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <p className="font-medium text-text truncate">{r.counterparty}</p>
                        {r.detail && <p className="text-xs text-text-dim truncate">{r.detail}</p>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-text">
                        {formatCurrency(r.commissionPence)}
                      </TableCell>
                      <TableCell className="text-text-muted">
                        {r.date ? formatDate(r.date) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_META[r.status].variant} dot>
                          {STATUS_META[r.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busyKey === r.key}
                          icon={r.status === 'paid' ? <Undo2 size={13} /> : <Check size={13} />}
                          onClick={() => togglePaid(r)}
                        >
                          {r.status === 'paid' ? 'Mark unpaid' : 'Mark paid'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
