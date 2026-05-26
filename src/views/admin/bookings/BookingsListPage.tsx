'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
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
import { formatCurrency, formatDateTime, cn } from '@/lib/utils'
import {
  Search,
  Loader2,
  Ticket,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  ExternalLink,
} from 'lucide-react'

interface BookingRow {
  id: string
  status: 'confirmed' | 'pending' | 'cancelled' | 'refunded'
  amount_pence: number
  payment_method: string | null
  is_guest: boolean
  guest_name: string | null
  guest_email: string | null
  checked_in: boolean
  created_at: string
  events: {
    id: string
    title: string
    slug: string
    start_date: string
    event_type: string
  } | null
  members: {
    id: string
    profiles: {
      first_name: string | null
      last_name: string | null
      email: string | null
    } | null
  } | null
}

type StatusFilter = 'all' | BookingRow['status']

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
]

const statusBadgeVariant: Record<BookingRow['status'], 'active' | 'upcoming' | 'urgent' | 'draft'> =
  {
    confirmed: 'active',
    pending: 'upcoming',
    cancelled: 'urgent',
    refunded: 'draft',
  }

const statusIcon: Record<BookingRow['status'], React.ReactNode> = {
  confirmed: <CheckCircle2 size={12} />,
  pending: <Clock size={12} />,
  cancelled: <XCircle size={12} />,
  refunded: <RotateCcw size={12} />,
}

export function BookingsListPage() {
  const router = useRouter()
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchBookings()
  }, [])

  async function fetchBookings() {
    setLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select(
        `
        id, status, amount_pence, payment_method, is_guest, guest_name, guest_email,
        checked_in, created_at,
        events(id, title, slug, start_date, event_type),
        members(id, profiles(first_name, last_name, email))
        `,
      )
      .order('created_at', { ascending: false })
      .limit(200)
    if (data) setBookings(data as unknown as BookingRow[])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return bookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false
      if (!term) return true
      const name = b.is_guest
        ? b.guest_name ?? ''
        : `${b.members?.profiles?.first_name ?? ''} ${b.members?.profiles?.last_name ?? ''}`
      const email = b.is_guest ? b.guest_email ?? '' : b.members?.profiles?.email ?? ''
      const event = b.events?.title ?? ''
      return (
        name.toLowerCase().includes(term) ||
        email.toLowerCase().includes(term) ||
        event.toLowerCase().includes(term)
      )
    })
  }, [bookings, statusFilter, search])

  const counts = useMemo(
    () => ({
      total: bookings.length,
      confirmed: bookings.filter((b) => b.status === 'confirmed').length,
      pending: bookings.filter((b) => b.status === 'pending').length,
      cancelled: bookings.filter((b) => b.status === 'cancelled' || b.status === 'refunded').length,
      revenue: bookings
        .filter((b) => b.status === 'confirmed')
        .reduce((sum, b) => sum + (b.amount_pence ?? 0), 0),
    }),
    [bookings],
  )

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading bookings…
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl">
      <AdminPageHeader
        title="Bookings"
        description="Every event booking across the club — confirmed, pending, cancelled, and refunded. Click a row to open the event the booking belongs to."
        meta={
          <span className="text-xs text-text-dim">
            {counts.total} total · {counts.confirmed} confirmed · {counts.pending} pending
          </span>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Total" value={counts.total} icon={<Ticket size={14} />} />
        <StatTile
          label="Confirmed"
          value={counts.confirmed}
          icon={<CheckCircle2 size={14} />}
          tone="success"
        />
        <StatTile
          label="Pending"
          value={counts.pending}
          icon={<Clock size={14} />}
          tone={counts.pending > 0 ? 'warn' : 'neutral'}
        />
        <StatTile label="Revenue" value={formatCurrency(counts.revenue)} icon={<Ticket size={14} />} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or event…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map((opt) => {
            const count =
              opt.value === 'all'
                ? bookings.length
                : bookings.filter((b) => b.status === opt.value).length
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-full border transition-colors',
                  statusFilter === opt.value
                    ? 'bg-gold text-white border-gold'
                    : 'bg-[var(--color-surface)] text-text-muted border-border hover:border-border-hover hover:text-text',
                )}
              >
                {opt.label}
                <span className="ml-1.5 opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <AdminEmptyState
              icon={Ticket}
              title={bookings.length === 0 ? 'No bookings yet' : 'No matches'}
              description={
                bookings.length === 0
                  ? 'Bookings appear here as members pay for events via Stripe.'
                  : 'Try a different filter or clear your search.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Guest</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Booked</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => {
                  const name = b.is_guest
                    ? b.guest_name ?? '(guest)'
                    : `${b.members?.profiles?.first_name ?? ''} ${b.members?.profiles?.last_name ?? ''}`.trim() ||
                      '(unnamed member)'
                  const email = b.is_guest
                    ? b.guest_email ?? '—'
                    : b.members?.profiles?.email ?? '—'
                  return (
                    <TableRow
                      key={b.id}
                      className="cursor-pointer group"
                      onClick={() => b.events && router.push(`/dashboard/events/${b.events.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text truncate">{name}</p>
                            <p className="text-[11px] text-text-dim truncate">{email}</p>
                          </div>
                          {b.is_guest && (
                            <span className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full bg-gold-muted text-gold-dark">
                              Guest
                            </span>
                          )}
                          {b.checked_in && (
                            <span
                              className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full bg-[rgba(91,123,106,0.12)] text-accent"
                              title="Checked in at the event"
                            >
                              Checked in
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {b.events ? (
                          <Link
                            href={`/dashboard/events/${b.events.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-text hover:text-gold transition-colors text-sm"
                          >
                            {b.events.title}
                            <span className="block text-[11px] text-text-dim mt-0.5">
                              {new Date(b.events.start_date).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                              {' · '}
                              {b.events.event_type.replace('_', ' ')}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-text-dim">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant[b.status]} dot>
                          <span className="inline-flex items-center gap-1">
                            {statusIcon[b.status]}
                            {b.status}
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-text-muted capitalize">
                          {b.payment_method ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium text-text">
                        {b.amount_pence > 0 ? (
                          formatCurrency(b.amount_pence)
                        ) : (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full border border-bronze/35 bg-bronze/10 text-[10.5px] font-medium uppercase tracking-[0.14em] text-bronze-light italic"
                            title={
                              b.is_guest
                                ? 'Host invite — no charge'
                                : 'Member tier benefit'
                            }
                          >
                            Complimentary
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-text-muted text-xs whitespace-nowrap">
                        {formatDateTime(b.created_at)}
                      </TableCell>
                      <TableCell>
                        <ExternalLink
                          size={13}
                          className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity"
                        />
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

function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  tone?: 'neutral' | 'success' | 'warn'
}) {
  const toneClass = {
    neutral: 'text-text-muted',
    success: 'text-accent',
    warn: 'text-gold',
  }[tone]
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-1.5">
          <span className={toneClass}>{icon}</span>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
            {label}
          </p>
        </div>
        <p className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-semibold text-text mt-2">
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
