'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { formatDate } from '@/lib/utils'
import {
  ArrowUpRight,
  CalendarDays,
  Crown,
  CreditCard,
  Handshake,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  PortalBadge,
  PortalButton,
  PortalCard,
  PortalLoading,
  PortalPageHeader,
  PortalSectionTitle,
  PortalStatTile,
  type PortalBadgeVariant,
} from '@/components/portal/PortalChrome'
import type { Database } from '@/types/database'

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
  stripe_subscription_id: string | null
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
  tier_1: 'Tier I — Individual',
  tier_2: 'Tier II — Business',
  tier_3: 'Tier III — Business Premium',
}

const tierDescriptions: Record<MemberTier, string> = {
  tier_1: 'Access to all core member events and 3 qualified introductions per month.',
  tier_2: 'Access to all events including curated luxury, 5 introductions per month, and priority booking.',
  tier_3: 'Full access including retreats, 10 introductions per month, priority booking, and sponsor alignment.',
}

const introVariant: Record<IntroStatus, PortalBadgeVariant> = {
  suggested: 'draft',
  approved: 'upcoming',
  sent: 'info',
  accepted: 'active',
  completed: 'active',
  declined: 'urgent',
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
    const { data: memberData } = await supabase
      .from('members')
      .select(
        'id, membership_tier, membership_type, membership_status, intros_used_this_month, monthly_intro_quota, membership_start_date, renewal_date, stripe_subscription_id',
      )
      .eq('profile_id', profileId)
      .single()

    if (!memberData) {
      setLoading(false)
      return
    }
    setMember(memberData)
    const memberId = memberData.id

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
        .select(
          'id, status, match_score, created_at, members!introductions_member_b_id_fkey(profiles(first_name, last_name, company_name))',
        )
        .eq('member_a_id', memberId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('introductions')
        .select(
          'id, status, match_score, created_at, members!introductions_member_a_id_fkey(profiles(first_name, last_name, company_name))',
        )
        .eq('member_b_id', memberId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('membership_status', 'active')
        .is('deleted_at', null),
    ])

    if (bookingsRes.data) setUpcomingBookings(bookingsRes.data as unknown as UpcomingBooking[])

    const allIntros: RecentIntro[] = []
    for (const row of (introsARes.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const m = row.members as
        | { profiles: { first_name: string | null; last_name: string | null; company_name: string | null } }
        | undefined
      if (m)
        allIntros.push({
          id: row.id as string,
          status: row.status as IntroStatus,
          match_score: row.match_score as number | null,
          created_at: row.created_at as string,
          other: { profiles: m.profiles },
        })
    }
    for (const row of (introsBRes.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const m = row.members as
        | { profiles: { first_name: string | null; last_name: string | null; company_name: string | null } }
        | undefined
      if (m)
        allIntros.push({
          id: row.id as string,
          status: row.status as IntroStatus,
          match_score: row.match_score as number | null,
          created_at: row.created_at as string,
          other: { profiles: m.profiles },
        })
    }
    allIntros.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setRecentIntros(allIntros.slice(0, 5))
    setTotalMembers(countRes.count ?? 0)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12">
        <PortalLoading label="Loading your dashboard" />
      </div>
    )
  }

  const introsRemaining = member ? member.monthly_intro_quota - member.intros_used_this_month : 0
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
      <PortalPageHeader
        eyebrow={today}
        title={
          <>
            Welcome back{profile?.first_name ? `, ${profile.first_name}` : ''}.
          </>
        }
        subtitle="Your evening at The Club, in brief."
      />

      {/* Payment setup CTA — only when membership has no stripe subscription */}
      {member && member.membership_status === 'active' && !member.stripe_subscription_id && (
        <PortalCard className="mb-8 p-6 lg:p-7 border-bronze/45 bg-bronze/[0.06]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-11 h-11 rounded-full border border-bronze/55 bg-bronze/15 flex items-center justify-center text-bronze-light shrink-0">
              <CreditCard size={18} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-[family-name:var(--font-display)] text-[17px] text-ivory leading-tight">
                Set up your membership payment.
              </p>
              <p className="mt-1.5 font-[family-name:var(--font-editorial)] italic text-[13.5px] text-ivory-soft/85">
                Activate recurring billing to keep your account in good standing.
              </p>
            </div>
            <Link href="/portal/billing" className="shrink-0">
              <PortalButton icon={<ArrowUpRight size={13} strokeWidth={1.5} />}>
                Set up billing
              </PortalButton>
            </Link>
          </div>
        </PortalCard>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-5 mb-10">
        <PortalStatTile
          label="Upcoming Events"
          value={upcomingBookings.length}
          caption={upcomingBookings.length === 0 ? 'No bookings yet' : 'Confirmed bookings'}
          icon={<CalendarDays size={17} strokeWidth={1.5} />}
        />
        <PortalStatTile
          label="Introductions Remaining"
          value={
            <>
              {introsRemaining}
              <span className="text-[0.55em] text-slate-haze ml-1.5">
                / {member?.monthly_intro_quota ?? 0}
              </span>
            </>
          }
          caption="This month"
          icon={<Handshake size={17} strokeWidth={1.5} />}
        />
        <PortalStatTile
          label="Intros Made This Month"
          value={member?.intros_used_this_month ?? 0}
          caption="Curated by The Club"
          icon={<TrendingUp size={17} strokeWidth={1.5} />}
        />
      </div>

      {/* Upcoming Events + Recent Introductions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 mb-8">
        <PortalCard className="p-6 lg:p-7">
          <div className="flex items-start justify-between gap-4 mb-6">
            <PortalSectionTitle eyebrow="Forthcoming" className="mb-0">
              Upcoming evenings.
            </PortalSectionTitle>
            <Link
              href="/portal/events"
              className="inline-flex items-center gap-1.5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-bronze-light hover:text-ivory transition-colors"
            >
              View all <ArrowUpRight size={11} strokeWidth={1.5} />
            </Link>
          </div>

          {upcomingBookings.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-[family-name:var(--font-editorial)] italic text-[14px] text-ivory-soft/85 mb-5">
                No evenings on your calendar yet.
              </p>
              <Link href="/portal/events">
                <PortalButton variant="secondary" size="sm">
                  Browse events
                </PortalButton>
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-graphite-line/40">
              {upcomingBookings.map((booking) => (
                <li
                  key={booking.id}
                  className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  {/* Date chip */}
                  <div className="w-12 h-12 border border-bronze/35 bg-bronze/[0.06] flex flex-col items-center justify-center shrink-0">
                    <span className="font-[family-name:var(--font-display)] text-[16px] text-ivory leading-none">
                      {new Date(booking.events.start_date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                      })}
                    </span>
                    <span className="font-[family-name:var(--font-meta)] text-[8.5px] uppercase tracking-[0.22em] text-bronze-light mt-1">
                      {new Date(booking.events.start_date).toLocaleDateString('en-GB', {
                        month: 'short',
                      })}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-[family-name:var(--font-display)] text-[15px] text-ivory leading-tight truncate">
                      {booking.events.title}
                    </p>
                    <p className="mt-1 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] text-slate-haze truncate">
                      {booking.events.venue_name
                        ? `${booking.events.venue_name}${booking.events.venue_city ? ` · ${booking.events.venue_city}` : ''}`
                        : formatDate(booking.events.start_date)}
                    </p>
                  </div>
                  <PortalBadge variant="active" dot>
                    Confirmed
                  </PortalBadge>
                </li>
              ))}
            </ul>
          )}
        </PortalCard>

        <PortalCard className="p-6 lg:p-7">
          <div className="flex items-start justify-between gap-4 mb-6">
            <PortalSectionTitle eyebrow="Recent" className="mb-0">
              Introductions.
            </PortalSectionTitle>
            <Link
              href="/portal/introductions"
              className="inline-flex items-center gap-1.5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-bronze-light hover:text-ivory transition-colors"
            >
              View all <ArrowUpRight size={11} strokeWidth={1.5} />
            </Link>
          </div>

          {recentIntros.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-[family-name:var(--font-editorial)] italic text-[14px] text-ivory-soft/85">
                No introductions yet.
              </p>
              <p className="mt-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] text-slate-haze">
                The team is reading your profile.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-graphite-line/40">
              {recentIntros.map((intro) => {
                const otherName = `${intro.other.profiles.first_name ?? ''} ${
                  intro.other.profiles.last_name ?? ''
                }`.trim()
                return (
                  <li
                    key={intro.id}
                    className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-[family-name:var(--font-display)] text-[15px] text-ivory leading-tight truncate">
                        {otherName || 'Unknown'}
                      </p>
                      <div className="mt-1 flex items-center gap-3 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] text-slate-haze">
                        {intro.other.profiles.company_name && (
                          <span className="truncate">{intro.other.profiles.company_name}</span>
                        )}
                        {intro.match_score != null && (
                          <span className="text-bronze-light">
                            {Math.round(intro.match_score * 100)}% match
                          </span>
                        )}
                      </div>
                    </div>
                    <PortalBadge variant={introVariant[intro.status]} dot>
                      {intro.status}
                    </PortalBadge>
                  </li>
                )
              })}
            </ul>
          )}
        </PortalCard>
      </div>

      {/* Membership + Network */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
        <PortalCard className="p-6 lg:p-7">
          <PortalSectionTitle eyebrow="Your Membership">
            <span className="inline-flex items-center gap-2.5">
              <Crown size={14} strokeWidth={1.5} className="text-bronze-light" />
              In good standing.
            </span>
          </PortalSectionTitle>

          {member && (
            <div className="space-y-6">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                {[
                  { label: 'Tier', value: tierLabels[member.membership_tier] },
                  { label: 'Type', value: <span className="capitalize">{member.membership_type}</span> },
                  {
                    label: 'Renewal',
                    value: member.renewal_date ? formatDate(member.renewal_date) : '—',
                  },
                  {
                    label: 'Monthly Intro Quota',
                    value: `${member.monthly_intro_quota} introductions`,
                  },
                ].map((row) => (
                  <div key={row.label}>
                    <dt className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light/85 mb-1.5">
                      {row.label}
                    </dt>
                    <dd className="font-[family-name:var(--font-display)] text-[15px] text-ivory leading-tight">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="pt-5 border-t border-graphite-line/45">
                <p className="font-[family-name:var(--font-editorial)] italic text-[13.5px] leading-[1.7] text-ivory-soft/85">
                  {tierDescriptions[member.membership_tier]}
                </p>
              </div>
            </div>
          )}
        </PortalCard>

        <PortalCard className="p-6 lg:p-7 flex flex-col">
          <PortalSectionTitle eyebrow="The Network">
            <span className="inline-flex items-center gap-2.5">
              <Users size={14} strokeWidth={1.5} className="text-bronze-light" />
              In the room.
            </span>
          </PortalSectionTitle>

          <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
            <p className="font-[family-name:var(--font-display)] text-[clamp(3rem,5vw,4rem)] text-bronze-light leading-none tabular-nums">
              {totalMembers}
            </p>
            <p className="mt-4 font-[family-name:var(--font-editorial)] italic text-[14px] text-ivory-soft/90 leading-[1.65] max-w-xs">
              You&apos;re part of a curated network of {totalMembers}{' '}
              {totalMembers === 1 ? 'member' : 'members'} across Manchester, Leeds and London.
            </p>
            <Link href="/portal/network" className="mt-7">
              <PortalButton variant="secondary" icon={<ArrowUpRight size={13} strokeWidth={1.5} />}>
                Browse the network
              </PortalButton>
            </Link>
          </div>
        </PortalCard>
      </div>
    </div>
  )
}
