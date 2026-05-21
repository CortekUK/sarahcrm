'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
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
import { Thumbnail } from '@/components/admin/Thumbnail'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import { Plus, CalendarDays, MapPin, Sparkles, TrendingUp, Ticket } from 'lucide-react'
import type { Database } from '@/types/database'

type EventType = Database['public']['Enums']['event_type']
type EventStatus = Database['public']['Enums']['event_status']

interface EventRow {
  id: string
  title: string
  slug: string
  start_date: string
  venue_name: string | null
  venue_city: string | null
  event_type: EventType
  status: EventStatus
  capacity: number | null
  member_price_pence: number
  cover_image_url: string | null
  bookings: { count: number }[]
  booking_revenue: number
}

const statusVariant: Record<EventStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  published: 'upcoming',
  live: 'active',
  draft: 'draft',
  completed: 'info',
  cancelled: 'urgent',
}

const typeLabels: Record<EventType, string> = {
  member_event: 'Member Event',
  curated_luxury: 'Curated Luxury',
  retreat: 'Retreat',
}

const tabs: { key: EventType | 'all' | 'past'; label: string }[] = [
  { key: 'all', label: 'All Events' },
  { key: 'member_event', label: 'Member Events' },
  { key: 'curated_luxury', label: 'Private (Curated Luxury)' },
  { key: 'retreat', label: 'Retreats' },
  { key: 'past', label: 'Past' },
]

export function EventsListPage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<EventType | 'all' | 'past'>('all')

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    const { data } = await supabase
      .from('events')
      .select(
        'id, title, slug, start_date, venue_name, venue_city, event_type, status, capacity, member_price_pence, cover_image_url, bookings(count)',
      )
      .order('start_date', { ascending: false })

    if (data) {
      // Compute revenue for each event by fetching confirmed booking totals.
      // One pass over the bookings table is faster than N round-trips per row.
      const { data: revenueData } = await supabase
        .from('bookings')
        .select('event_id, amount_pence')
        .eq('status', 'confirmed')

      const revenueByEvent: Record<string, number> = {}
      if (revenueData) {
        for (const b of revenueData) {
          revenueByEvent[b.event_id] = (revenueByEvent[b.event_id] ?? 0) + b.amount_pence
        }
      }

      setEvents(
        (data as unknown as EventRow[]).map((e) => ({
          ...e,
          booking_revenue: revenueByEvent[e.id] ?? 0,
        })),
      )
    }
    setLoading(false)
  }

  const now = useMemo(() => new Date(), [])

  const filtered = useMemo(() => {
    if (activeTab === 'all') return events.filter((e) => new Date(e.start_date) >= now)
    if (activeTab === 'past') return events.filter((e) => new Date(e.start_date) < now)
    return events.filter((e) => e.event_type === activeTab && new Date(e.start_date) >= now)
  }, [events, activeTab, now])

  const stats = useMemo(() => {
    const upcoming = events.filter((e) => new Date(e.start_date) >= now)
    const totalRevenue = events.reduce((sum, e) => sum + (e.booking_revenue ?? 0), 0)
    const totalBookings = events.reduce(
      (sum, e) => sum + (e.bookings?.[0]?.count ?? 0),
      0,
    )
    return {
      upcoming: upcoming.length,
      private: upcoming.filter(
        (e) => e.event_type === 'curated_luxury' || e.event_type === 'retreat',
      ).length,
      bookings: totalBookings,
      revenue: totalRevenue,
    }
  }, [events, now])

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading events...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl">
      <AdminPageHeader
        title="Events"
        description="Every event the club runs — member nights, curated luxury experiences, and retreats. Private events are managed here too: set their type to 'Curated Luxury' or 'Retreat' and they appear on the public Private Events page."
        meta={
          <span className="text-xs text-text-dim">
            {events.length} total · {stats.upcoming} upcoming · {stats.bookings} bookings
          </span>
        }
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={() => router.push('/dashboard/events/new')}
          >
            Create event
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          label="Upcoming"
          value={stats.upcoming}
          icon={<CalendarDays size={14} />}
        />
        <StatTile
          label="Private events"
          value={stats.private}
          icon={<Sparkles size={14} />}
          tone={stats.private > 0 ? 'warn' : 'neutral'}
        />
        <StatTile label="Total bookings" value={stats.bookings} icon={<Ticket size={14} />} />
        <StatTile
          label="Revenue"
          value={formatCurrency(stats.revenue)}
          icon={<TrendingUp size={14} />}
          tone="success"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto">
        {tabs.map((tab) => {
          const count =
            tab.key === 'all'
              ? events.filter((e) => new Date(e.start_date) >= now).length
              : tab.key === 'past'
                ? events.filter((e) => new Date(e.start_date) < now).length
                : events.filter(
                    (e) => e.event_type === tab.key && new Date(e.start_date) >= now,
                  ).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2.5 text-sm transition-colors relative whitespace-nowrap',
                activeTab === tab.key
                  ? 'text-gold font-medium'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-text-dim">({count})</span>
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-gold rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <AdminEmptyState
              icon={CalendarDays}
              title={
                activeTab === 'past'
                  ? 'No past events yet'
                  : activeTab === 'curated_luxury'
                    ? 'No private events scheduled'
                    : 'No upcoming events'
              }
              description={
                activeTab === 'curated_luxury'
                  ? "Create an event with type 'Curated Luxury' to publish it on the public Private Events page."
                  : 'Create your first event to start taking bookings.'
              }
              action={
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => router.push('/dashboard/events/new')}
                >
                  Create event
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16"></TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Bookings</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((event) => {
                  const bookingCount = event.bookings?.[0]?.count ?? 0
                  return (
                    <TableRow
                      key={event.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/events/${event.id}`)}
                    >
                      <TableCell className="py-3">
                        <Thumbnail
                          src={event.cover_image_url}
                          alt={event.title}
                          aspect="16 / 10"
                          width={56}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {event.title}
                        <span className="block text-[11px] text-text-dim font-normal mt-0.5">
                          /{event.slug}
                        </span>
                      </TableCell>
                      <TableCell className="text-text-muted whitespace-nowrap">
                        {formatDate(event.start_date)}
                      </TableCell>
                      <TableCell className="text-text-muted whitespace-nowrap">
                        {event.venue_name ? (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin size={11} className="text-text-dim flex-shrink-0" />
                            <span className="truncate max-w-[200px]">{event.venue_name}</span>
                            {event.venue_city && (
                              <span className="text-text-dim">· {event.venue_city}</span>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-block whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.12em] px-2 py-1 rounded-full',
                            event.event_type === 'curated_luxury'
                              ? 'bg-gold-muted text-gold-dark'
                              : event.event_type === 'retreat'
                                ? 'bg-[rgba(91,123,106,0.12)] text-accent'
                                : 'bg-[rgba(90,123,150,0.12)] text-accent-blue',
                          )}
                        >
                          {typeLabels[event.event_type]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-text font-medium">{bookingCount}</span>
                        {event.capacity && (
                          <span className="text-text-dim text-xs"> / {event.capacity}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {event.booking_revenue > 0
                          ? formatCurrency(event.booking_revenue)
                          : <span className="text-text-dim text-xs">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[event.status]} dot>
                          {event.status}
                        </Badge>
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
