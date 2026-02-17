import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { useAuth } from '../../providers/AuthProvider'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { formatDate } from '../../lib/utils'
import { CalendarDays, Handshake, Users, ArrowRight, Crown, TrendingUp } from 'lucide-react'
import type { Database } from '../../types/database'

type MemberTier = Database['public']['Enums']['membership_tier']
type IntroStatus = Database['public']['Enums']['intro_status']

interface MemberRecord {
  id: string
  membership_tier: MemberTier
  membership_type: string
  membership_status: string
  intros_used_this_month: number
  monthly_intro_quota: number
  membership_start_date: string | null
  renewal_date: string | null
}

interface UpcomingBooking {
  id: string
  status: string
  events: {
    title: string
    start_date: string
    venue_name: string | null
    venue_city: string | null
  }
}

interface RecentIntro {
  id: string
  status: IntroStatus
  match_score: number | null
  created_at: string
  other: {
    profiles: {
      first_name: string | null
      last_name: string | null
      company_name: string | null
    }
  }
}

const tierLabels: Record<MemberTier, string> = {
  tier_1: 'Tier 1 — Individual', tier_2: 'Tier 2 — Business', tier_3: 'Tier 3 — Business Premium',
}

const tierDescriptions: Record<MemberTier, string> = {
  tier_1: 'Access to all core member events and 3 qualified introductions per month',
  tier_2: 'Access to all events including curated luxury, 5 introductions per month, and priority booking',
  tier_3: 'Full access including retreats, 10 introductions per month, priority booking, and sponsor alignment',
}

const introVariant: Record<IntroStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  suggested: 'draft', approved: 'upcoming', sent: 'info', accepted: 'active', completed: 'active', declined: 'urgent',
}

export function PortalDashboard() {
  const { profile } = useAuth()
  const [member, setMember] = useState<MemberRecord | null>(null)
  const [upcomingBookings, setUpcomingBookings] = useState<UpcomingBooking[]>([])
  const [recentIntros, setRecentIntros] = useState<RecentIntro[]>([])
  const [totalMembers, setTotalMembers] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) fetchData(profile.id)
  }, [profile?.id])

  async function fetchData(profileId: string) {
    // Fetch member record
    const { data: memberData } = await supabase
      .from('members')
      .select('id, membership_tier, membership_type, membership_status, intros_used_this_month, monthly_intro_quota, membership_start_date, renewal_date')
      .eq('profile_id', profileId)
      .single()

    if (!memberData) {
      setLoading(false)
      return
    }

    setMember(memberData)
    const memberId = memberData.id

    // Fetch upcoming bookings, intros, and member count in parallel
    const now = new Date().toISOString()
    const [bookingsRes, introsARes, introsBRes, countRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, status, events!inner(title, start_date, venue_name, venue_city)')
        .eq('member_id', memberId)
        .eq('status', 'confirmed')
        .gte('events.start_date', now)
        .order('events(start_date)', { ascending: true })
        .limit(5),
      supabase
        .from('introductions')
        .select('id, status, match_score, created_at, members!introductions_member_b_id_fkey(profiles(first_name, last_name, company_name))')
        .eq('member_a_id', memberId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('introductions')
        .select('id, status, match_score, created_at, members!introductions_member_a_id_fkey(profiles(first_name, last_name, company_name))')
        .eq('member_b_id', memberId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('membership_status', 'active')
        .is('deleted_at', null),
    ])

    if (bookingsRes.data) {
      setUpcomingBookings(bookingsRes.data as unknown as UpcomingBooking[])
    }

    // Merge intros from both sides
    const allIntros: RecentIntro[] = []
    for (const row of (introsARes.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const m = row.members as { profiles: { first_name: string | null; last_name: string | null; company_name: string | null } } | undefined
      if (m) allIntros.push({ id: row.id as string, status: row.status as IntroStatus, match_score: row.match_score as number | null, created_at: row.created_at as string, other: { profiles: m.profiles } })
    }
    for (const row of (introsBRes.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const m = row.members as { profiles: { first_name: string | null; last_name: string | null; company_name: string | null } } | undefined
      if (m) allIntros.push({ id: row.id as string, status: row.status as IntroStatus, match_score: row.match_score as number | null, created_at: row.created_at as string, other: { profiles: m.profiles } })
    }
    allIntros.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setRecentIntros(allIntros.slice(0, 5))
    setTotalMembers(countRes.count ?? 0)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12">
        <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
        <span className="text-sm text-text-muted">Loading your dashboard...</span>
      </div>
    )
  }

  const introsRemaining = member ? member.monthly_intro_quota - member.intros_used_this_month : 0

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          Welcome back{profile?.first_name ? `, ${profile.first_name}` : ''}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gold-muted flex items-center justify-center">
                <CalendarDays size={22} className="text-gold" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Upcoming Events
                </p>
                <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
                  {upcomingBookings.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[rgba(91,123,106,0.1)] flex items-center justify-center">
                <Handshake size={22} className="text-[#5B7B6A]" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Introductions Remaining
                </p>
                <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
                  {introsRemaining}
                  <span className="text-sm font-normal text-text-dim ml-1">
                    / {member?.monthly_intro_quota ?? 0}
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[rgba(44,40,37,0.06)] flex items-center justify-center">
                <TrendingUp size={22} className="text-[#2C2825]" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Intros Made This Month
                </p>
                <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
                  {member?.intros_used_this_month ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Events + Recent Introductions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Upcoming events — mini list */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming Events</CardTitle>
            <Link
              to="/portal/events"
              className="flex items-center gap-1 text-xs text-gold hover:underline"
            >
              View all <ArrowRight size={12} />
            </Link>
          </CardHeader>
          <CardContent>
            {upcomingBookings.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-text-dim mb-3">No upcoming events</p>
                <Link to="/portal/events" className="btn-secondary text-xs px-4 py-2">
                  Browse Events
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center gap-4 p-3 rounded-[var(--radius-md)] hover:bg-surface-2 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-[var(--radius-md)] bg-gold-muted flex flex-col items-center justify-center text-gold shrink-0">
                      <span className="text-xs font-bold leading-none">
                        {new Date(booking.events.start_date).toLocaleDateString('en-GB', { day: 'numeric' })}
                      </span>
                      <span className="text-[0.6rem] uppercase font-medium">
                        {new Date(booking.events.start_date).toLocaleDateString('en-GB', { month: 'short' })}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">
                        {booking.events.title}
                      </p>
                      <p className="text-xs text-text-dim">
                        {booking.events.venue_name
                          ? `${booking.events.venue_name}${booking.events.venue_city ? `, ${booking.events.venue_city}` : ''}`
                          : formatDate(booking.events.start_date)}
                      </p>
                    </div>
                    <Badge variant="active" dot>Confirmed</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent introductions — with match score */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Introductions</CardTitle>
            <Link
              to="/portal/introductions"
              className="flex items-center gap-1 text-xs text-gold hover:underline"
            >
              View all <ArrowRight size={12} />
            </Link>
          </CardHeader>
          <CardContent>
            {recentIntros.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-text-dim">No introductions yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentIntros.map((intro) => {
                  const otherName = `${intro.other.profiles.first_name ?? ''} ${intro.other.profiles.last_name ?? ''}`.trim()
                  return (
                    <div
                      key={intro.id}
                      className="flex items-center justify-between p-3 rounded-[var(--radius-md)] hover:bg-surface-2 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text">{otherName || 'Unknown'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {intro.other.profiles.company_name && (
                            <span className="text-xs text-text-dim">{intro.other.profiles.company_name}</span>
                          )}
                          {intro.match_score != null && (
                            <span className="text-xs text-gold font-medium">
                              {Math.round(intro.match_score * 100)}% match
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant={introVariant[intro.status]} dot>{intro.status}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Membership + Network */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Your Membership */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown size={16} className="text-gold" />
              <CardTitle>Your Membership</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {member && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                      Tier
                    </p>
                    <p className="text-sm font-medium text-text mt-0.5">
                      {tierLabels[member.membership_tier]}
                    </p>
                  </div>
                  <div>
                    <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                      Type
                    </p>
                    <p className="text-sm font-medium text-text mt-0.5 capitalize">
                      {member.membership_type}
                    </p>
                  </div>
                  <div>
                    <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                      Renewal Date
                    </p>
                    <p className="text-sm font-medium text-text mt-0.5">
                      {member.renewal_date ? formatDate(member.renewal_date) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                      Monthly Intro Quota
                    </p>
                    <p className="text-sm font-medium text-text mt-0.5">
                      {member.monthly_intro_quota} introductions
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-text-muted leading-relaxed">
                    {tierDescriptions[member.membership_tier]}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* The Network */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users size={16} className="text-gold" />
              <CardTitle>The Network</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <p className="font-[family-name:var(--font-heading)] text-4xl font-semibold text-gold mb-2">
                {totalMembers}
              </p>
              <p className="text-sm text-text-muted mb-4">
                You're part of a curated network of {totalMembers} {totalMembers === 1 ? 'member' : 'members'}
              </p>
              <p className="text-xs text-text-dim mb-5">
                Connect with entrepreneurs, founders, and industry leaders across the UK's most exclusive business community
              </p>
              <Link
                to="/portal/network"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gold hover:underline"
              >
                Browse Network <ArrowRight size={14} />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
