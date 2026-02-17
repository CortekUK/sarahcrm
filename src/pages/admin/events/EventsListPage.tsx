import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase/client'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/Table'
import { formatDate, formatCurrency, cn } from '../../../lib/utils'
import { Plus } from 'lucide-react'
import type { Database } from '../../../types/database'

type EventType = Database['public']['Enums']['event_type']
type EventStatus = Database['public']['Enums']['event_status']

interface EventRow {
  id: string
  title: string
  start_date: string
  venue_name: string | null
  venue_city: string | null
  event_type: EventType
  status: EventStatus
  capacity: number | null
  member_price_pence: number
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

const typeVariant: Record<EventType, 'info' | 'upcoming' | 'active'> = {
  member_event: 'info',
  curated_luxury: 'upcoming',
  retreat: 'active',
}

const typeLabels: Record<EventType, string> = {
  member_event: 'Member Event',
  curated_luxury: 'Curated Luxury',
  retreat: 'Retreat',
}

const tabs: { key: EventType | 'all'; label: string }[] = [
  { key: 'all', label: 'All Events' },
  { key: 'member_event', label: 'Member Events' },
  { key: 'curated_luxury', label: 'Curated Luxury' },
  { key: 'retreat', label: 'Retreats' },
]

export function EventsListPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<EventType | 'all'>('all')

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    // Fetch events with booking count
    const { data } = await supabase
      .from('events')
      .select('id, title, start_date, venue_name, venue_city, event_type, status, capacity, member_price_pence, bookings(count)')
      .order('start_date', { ascending: true })

    if (data) {
      // Compute revenue for each event by fetching confirmed booking totals
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
        }))
      )
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (activeTab === 'all') return events
    return events.filter((e) => e.event_type === activeTab)
  }, [events, activeTab])

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
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
            Events
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {events.length} event{events.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Button
          icon={<Plus size={16} />}
          onClick={() => navigate('/dashboard/events/new')}
        >
          Create Event
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => {
          const count = tab.key === 'all'
            ? events.length
            : events.filter((e) => e.event_type === tab.key).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2.5 text-sm transition-colors relative',
                activeTab === tab.key
                  ? 'text-gold font-medium'
                  : 'text-text-muted hover:text-text'
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
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-card)]">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-text-dim">No events found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Event</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Bookings</TableHead>
                <TableHead>Revenue</TableHead>
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
                      <Badge variant={typeVariant[event.event_type]}>
                        {typeLabels[event.event_type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-text">{bookingCount}</span>
                      {event.capacity && (
                        <span className="text-text-dim"> / {event.capacity}</span>
                      )}
                    </TableCell>
                    <TableCell>{formatCurrency(event.booking_revenue)}</TableCell>
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
      </div>
    </div>
  )
}
