import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { StatCard } from '../../components/ui/StatCard'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/ui/Table'
import { formatCurrency, formatDate } from '../../lib/utils'
import { CalendarPlus, ArrowRight } from 'lucide-react'
import type { Database } from '../../types/database'

type Event = Database['public']['Tables']['events']['Row']
type EventStatus = Database['public']['Enums']['event_status']
type IntroStatus = Database['public']['Enums']['intro_status']

interface UpcomingEvent extends Event {
  bookings_count: number
}

interface DashboardStats {
  totalActiveMembers: number
  introsThisMonth: number
  totalBookings: number
  revenueMtdPence: number
  newMembersThisMonth: number
  introsLastMonth: number
  bookingsLastMonth: number
  revenueLastMonthPence: number
}

interface RecentIntro {
  id: string
  status: IntroStatus
  match_score: number | null
  created_at: string
  member_a: { profiles: { first_name: string | null; last_name: string | null } }
  member_b: { profiles: { first_name: string | null; last_name: string | null } }
}

interface NewestMember {
  id: string
  company_name: string | null
  membership_tier: string
  created_at: string
  profiles: { first_name: string | null; last_name: string | null; avatar_url: string | null; company_name: string | null }
}

const statusVariant: Record<EventStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  published: 'upcoming',
  live: 'active',
  draft: 'draft',
  completed: 'info',
  cancelled: 'urgent',
}

const introStatusBadge: Record<IntroStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  suggested: 'draft',
  approved: 'upcoming',
  sent: 'info',
  accepted: 'active',
  completed: 'active',
  declined: 'urgent',
}

const tierLabels: Record<string, string> = {
  tier_1: 'Tier 1',
  tier_2: 'Tier 2',
  tier_3: 'Tier 3',
}

function memberName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return 'Unknown'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats>({
    totalActiveMembers: 0,
    introsThisMonth: 0,
    totalBookings: 0,
    revenueMtdPence: 0,
    newMembersThisMonth: 0,
    introsLastMonth: 0,
    bookingsLastMonth: 0,
    revenueLastMonthPence: 0,
  })
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [recentIntros, setRecentIntros] = useState<RecentIntro[]>([])
  const [newestMembers, setNewestMembers] = useState<NewestMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()

    const [
      membersRes,
      introsRes,
      bookingsRes,
      revenueRes,
      newMembersRes,
      introsLastRes,
      eventsRes,
      recentIntrosRes,
      newestMembersRes,
    ] = await Promise.all([
      // Active members count
      supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('membership_status', 'active')
        .is('deleted_at', null),

      // Introductions this month
      supabase
        .from('introductions')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfMonth),

      // Total bookings (confirmed)
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed'),

      // Revenue MTD (paid payments this month)
      supabase
        .from('payments')
        .select('amount_pence')
        .eq('status', 'paid')
        .gte('paid_at', startOfMonth),

      // New members this month
      supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfMonth)
        .is('deleted_at', null),

      // Intros last month (for comparison)
      supabase
        .from('introductions')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfLastMonth)
        .lt('created_at', startOfMonth),

      // Upcoming events
      supabase
        .from('events')
        .select('*, bookings(count)')
        .in('status', ['published', 'live', 'draft'])
        .gte('start_date', now.toISOString())
        .order('start_date', { ascending: true })
        .limit(6),

      // Recent introductions (last 5)
      supabase
        .from('introductions')
        .select(`
          id, status, match_score, created_at,
          member_a:members!introductions_member_a_id_fkey(profiles(first_name, last_name)),
          member_b:members!introductions_member_b_id_fkey(profiles(first_name, last_name))
        `)
        .order('created_at', { ascending: false })
        .limit(5),

      // Newest members (last 5)
      supabase
        .from('members')
        .select('id, company_name, membership_tier, created_at, profiles(first_name, last_name, avatar_url, company_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const revenuePence = (revenueRes.data ?? []).reduce(
      (sum, p) => sum + (p.amount_pence ?? 0),
      0
    )

    setStats({
      totalActiveMembers: membersRes.count ?? 0,
      introsThisMonth: introsRes.count ?? 0,
      totalBookings: bookingsRes.count ?? 0,
      revenueMtdPence: revenuePence,
      newMembersThisMonth: newMembersRes.count ?? 0,
      introsLastMonth: introsLastRes.count ?? 0,
      bookingsLastMonth: 0,
      revenueLastMonthPence: 0,
    })

    const events = (eventsRes.data ?? []).map((e: Record<string, unknown>) => {
      const bookings = e.bookings as { count: number }[] | undefined
      return {
        ...e,
        bookings_count: bookings?.[0]?.count ?? 0,
      }
    }) as UpcomingEvent[]

    setUpcomingEvents(events)
    setRecentIntros((recentIntrosRes.data ?? []) as unknown as RecentIntro[])
    setNewestMembers((newestMembersRes.data ?? []) as unknown as NewestMember[])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading dashboard...</span>
        </div>
      </div>
    )
  }

  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          Welcome back, Sarah
        </h1>
        <p className="text-sm text-text-muted mt-1">{today}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard
          label="Active Members"
          value={stats.totalActiveMembers.toLocaleString('en-GB')}
          changeText={`+${stats.newMembersThisMonth} this month`}
          changeType={stats.newMembersThisMonth > 0 ? 'positive' : 'neutral'}
        />
        <StatCard
          label="Introductions"
          value={stats.introsThisMonth.toLocaleString('en-GB')}
          changeText={`${stats.introsLastMonth} last month`}
          changeType={stats.introsThisMonth >= stats.introsLastMonth ? 'positive' : 'neutral'}
        />
        <StatCard
          label="Confirmed Bookings"
          value={stats.totalBookings.toLocaleString('en-GB')}
          changeText="across all events"
          changeType="neutral"
        />
        <StatCard
          label="Revenue MTD"
          value={formatCurrency(stats.revenueMtdPence)}
          changeText={stats.revenueMtdPence > 0 ? 'payments received' : 'no payments yet'}
          changeType={stats.revenueMtdPence > 0 ? 'positive' : 'neutral'}
        />
      </div>

      {/* Upcoming events */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Upcoming Events</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowRight size={14} />}
              onClick={() => navigate('/dashboard/events')}
            >
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {upcomingEvents.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gold-muted mb-4">
                <CalendarPlus size={20} className="text-gold" />
              </div>
              <p className="text-sm text-text-muted mb-1">No upcoming events scheduled</p>
              <p className="text-xs text-text-dim mb-4">Create your first event to get started</p>
              <Button
                size="sm"
                icon={<CalendarPlus size={14} />}
                onClick={() => navigate('/dashboard/events/new')}
              >
                Create Event
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Event</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Bookings</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingEvents.map((event) => (
                  <TableRow
                    key={event.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/dashboard/events/${event.id}`)}
                  >
                    <TableCell className="font-medium">{event.title}</TableCell>
                    <TableCell className="text-text-muted">
                      {formatDate(event.start_date)}
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {event.venue_name
                        ? `${event.venue_name}${event.venue_city ? ` — ${event.venue_city}` : ''}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <span className="text-text">
                        {event.bookings_count}
                      </span>
                      {event.capacity && (
                        <span className="text-text-dim">
                          {' '}/ {event.capacity}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusVariant[event.status]}
                        dot
                      >
                        {event.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Two column grid: Recent Intros + Newest Members */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Introductions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Introductions</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowRight size={14} />}
                onClick={() => navigate('/dashboard/introductions')}
              >
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentIntros.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-text-dim">
                No introductions yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentIntros.map((intro) => (
                  <div
                    key={intro.id}
                    className="px-6 py-3.5 flex items-center justify-between hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => navigate(`/dashboard/introductions/${intro.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text truncate">
                        {memberName(intro.member_a?.profiles)}{' '}
                        <span className="text-text-dim font-normal">&amp;</span>{' '}
                        {memberName(intro.member_b?.profiles)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {intro.match_score != null && (
                          <span className="text-xs text-gold font-medium">
                            {Math.round(intro.match_score * 100)}% match
                          </span>
                        )}
                        <span className="text-xs text-text-dim">
                          {formatDate(intro.created_at)}
                        </span>
                      </div>
                    </div>
                    <Badge variant={introStatusBadge[intro.status]} dot>
                      {intro.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Newest Members */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Newest Members</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowRight size={14} />}
                onClick={() => navigate('/dashboard/members')}
              >
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {newestMembers.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-text-dim">
                No members yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {newestMembers.map((member) => {
                  const name = memberName(member.profiles)
                  const company = member.company_name ?? member.profiles?.company_name
                  return (
                    <div
                      key={member.id}
                      className="px-6 py-3.5 flex items-center gap-3 hover:bg-surface-2 transition-colors cursor-pointer"
                      onClick={() => navigate(`/dashboard/members/${member.id}`)}
                    >
                      <Avatar
                        src={member.profiles?.avatar_url}
                        name={name}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text truncate">{name}</p>
                        {company && (
                          <p className="text-xs text-text-dim truncate">{company}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="info">
                          {tierLabels[member.membership_tier] ?? member.membership_tier}
                        </Badge>
                        <p className="text-xs text-text-dim mt-0.5">
                          {formatDate(member.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
