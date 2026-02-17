import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { StatCard } from '../../../components/ui/StatCard'
import { Avatar } from '../../../components/ui/Avatar'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/Table'
import { formatDateTime, formatCurrency, cn } from '../../../lib/utils'
import { ArrowLeft, Pencil, Send, Check, X as XIcon } from 'lucide-react'
import type { Database } from '../../../types/database'

type EventRow = Database['public']['Tables']['events']['Row']
type EventStatus = Database['public']['Enums']['event_status']
type BookingStatus = Database['public']['Enums']['booking_status']

interface GuestRow {
  id: string
  status: BookingStatus
  amount_pence: number
  payment_method: string | null
  dietary_requirements: string | null
  special_requests: string | null
  checked_in: boolean
  checked_in_at: string | null
  is_guest: boolean
  guest_name: string | null
  members: {
    id: string
    profiles: {
      first_name: string | null
      last_name: string | null
      email: string | null
      avatar_url: string | null
      company_name: string | null
    }
  }
}

const statusVariant: Record<EventStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  published: 'upcoming', live: 'active', draft: 'draft', completed: 'info', cancelled: 'urgent',
}
const bookingVariant: Record<BookingStatus, 'active' | 'upcoming' | 'draft' | 'urgent'> = {
  confirmed: 'active', pending: 'upcoming', cancelled: 'urgent', refunded: 'draft',
}
const typeLabels: Record<string, string> = {
  member_event: 'Member Event', curated_luxury: 'Curated Luxury', retreat: 'Retreat',
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [guests, setGuests] = useState<GuestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    if (id) fetchEvent(id)
  }, [id])

  async function fetchEvent(eventId: string) {
    setLoading(true)
    const [eventRes, guestsRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase
        .from('bookings')
        .select('id, status, amount_pence, payment_method, dietary_requirements, special_requests, checked_in, checked_in_at, is_guest, guest_name, members(id, profiles(first_name, last_name, email, avatar_url, company_name))')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false }),
    ])

    if (eventRes.data) setEvent(eventRes.data)
    if (guestsRes.data) setGuests(guestsRes.data as unknown as GuestRow[])
    setLoading(false)
  }

  async function handlePublish() {
    if (!id || !event) return
    setPublishing(true)
    await supabase.from('events').update({ status: 'published' }).eq('id', id)
    setEvent({ ...event, status: 'published' })
    setPublishing(false)
  }

  async function handleCancel() {
    if (!id || !event) return
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', id)
    setEvent({ ...event, status: 'cancelled' })
  }

  async function toggleCheckIn(bookingId: string, currentValue: boolean) {
    const newValue = !currentValue
    await supabase
      .from('bookings')
      .update({
        checked_in: newValue,
        checked_in_at: newValue ? new Date().toISOString() : null,
      })
      .eq('id', bookingId)

    setGuests((prev) =>
      prev.map((g) =>
        g.id === bookingId
          ? { ...g, checked_in: newValue, checked_in_at: newValue ? new Date().toISOString() : null }
          : g
      )
    )
  }

  if (loading || !event) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading event...</span>
        </div>
      </div>
    )
  }

  const confirmedGuests = guests.filter((g) => g.status === 'confirmed')
  const totalRevenue = confirmedGuests.reduce((sum, g) => sum + g.amount_pence, 0)
  const capacityPct = event.capacity ? Math.round((confirmedGuests.length / event.capacity) * 100) : null
  const checkedInCount = guests.filter((g) => g.checked_in).length
  const speakers = (event.speakers as Array<{ name: string; title?: string }> | null) ?? []
  const agenda = (event.agenda as Array<{ time: string; title: string; description?: string }> | null) ?? []

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/dashboard/events')}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          Back to Events
        </button>
        <div className="flex items-center gap-2">
          {event.status === 'draft' && (
            <Button
              icon={<Send size={14} />}
              size="sm"
              loading={publishing}
              onClick={handlePublish}
            >
              Publish Event
            </Button>
          )}
          {(event.status === 'published' || event.status === 'live') && (
            <Button variant="danger" size="sm" onClick={handleCancel}>
              Cancel Event
            </Button>
          )}
          <Button
            variant="secondary"
            icon={<Pencil size={14} />}
            size="sm"
            onClick={() => navigate(`/dashboard/events/${id}/edit`)}
          >
            Edit Event
          </Button>
        </div>
      </div>

      {/* Event info card */}
      <Card className="mb-6">
        <CardContent className="py-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
                  {event.title}
                </h1>
                <Badge variant={statusVariant[event.status]} dot>
                  {event.status}
                </Badge>
              </div>
              <p className="text-sm text-text-muted">
                {typeLabels[event.event_type]} &middot; {event.slug}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Date</p>
              <p className="text-text">{formatDateTime(event.start_date)}</p>
              {event.end_date && (
                <p className="text-text-muted text-xs">to {formatDateTime(event.end_date)}</p>
              )}
              {event.doors_open && (
                <p className="text-text-dim text-xs">Doors: {formatDateTime(event.doors_open)}</p>
              )}
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Venue</p>
              <p className="text-text">{event.venue_name || '—'}</p>
              {event.venue_city && <p className="text-text-muted text-xs">{event.venue_city}{event.venue_postcode ? `, ${event.venue_postcode}` : ''}</p>}
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Pricing</p>
              <p className="text-text">Member: {formatCurrency(event.member_price_pence)}</p>
              <p className="text-text-muted text-xs">Guest: {formatCurrency(event.guest_price_pence)}</p>
              {event.sponsor_price_pence > 0 && (
                <p className="text-text-muted text-xs">Sponsor: {formatCurrency(event.sponsor_price_pence)}</p>
              )}
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">Options</p>
              <div className="flex flex-wrap gap-1.5">
                {event.travel_included && <Badge variant="info">Travel incl.</Badge>}
                {event.accommodation_available && (
                  <Badge variant="info">
                    Accom. {event.accommodation_price_pence ? formatCurrency(event.accommodation_price_pence) : 'incl.'}
                  </Badge>
                )}
                {event.guest_list_visible && <Badge variant="draft">Guest list visible</Badge>}
                {event.auto_confirm && <Badge variant="draft">Auto-confirm</Badge>}
              </div>
            </div>
          </div>

          {event.description && (
            <div className="mt-5 pt-5 border-t border-border">
              <p className="text-sm text-text-muted whitespace-pre-line">{event.description}</p>
            </div>
          )}

          {/* Speakers */}
          {speakers.length > 0 && (
            <div className="mt-5 pt-5 border-t border-border">
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-2">Speakers</p>
              <div className="flex flex-wrap gap-3">
                {speakers.map((s, i) => (
                  <div key={i} className="bg-surface-2 rounded-[var(--radius-md)] px-3 py-2 text-sm">
                    <span className="font-medium text-text">{s.name}</span>
                    {s.title && <span className="text-text-muted ml-1">— {s.title}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agenda */}
          {agenda.length > 0 && (
            <div className="mt-5 pt-5 border-t border-border">
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-2">Agenda</p>
              <div className="space-y-2">
                {agenda.map((item, i) => (
                  <div key={i} className="flex gap-4 text-sm">
                    <span className="text-text-dim w-16 shrink-0 font-mono text-xs pt-0.5">{item.time}</span>
                    <div>
                      <span className="font-medium text-text">{item.title}</span>
                      {item.description && <p className="text-text-muted text-xs mt-0.5">{item.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard label="Confirmed Bookings" value={confirmedGuests.length} />
        <StatCard label="Revenue" value={formatCurrency(totalRevenue)} />
        <StatCard
          label="Capacity"
          value={capacityPct !== null ? `${capacityPct}%` : '—'}
        />
        <StatCard label="Checked In" value={`${checkedInCount} / ${confirmedGuests.length}`} />
      </div>

      {/* Guest list */}
      <Card>
        <CardHeader>
          <CardTitle>Guest List ({guests.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {guests.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-text-dim">No bookings yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Guest</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Dietary</TableHead>
                  <TableHead>Check-in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((guest) => {
                  const name = guest.is_guest
                    ? guest.guest_name || 'Guest'
                    : `${guest.members?.profiles?.first_name ?? ''} ${guest.members?.profiles?.last_name ?? ''}`.trim() || 'Unknown'
                  const email = guest.members?.profiles?.email
                  const company = guest.members?.profiles?.company_name

                  return (
                    <TableRow key={guest.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={guest.members?.profiles?.avatar_url}
                            name={name}
                            size="sm"
                          />
                          <div>
                            <p className="font-medium text-text">
                              {name}
                              {guest.is_guest && (
                                <span className="ml-1.5 text-xs text-text-dim font-normal">(Guest)</span>
                              )}
                            </p>
                            {email && <p className="text-xs text-text-dim">{email}</p>}
                            {company && <p className="text-xs text-text-dim">{company}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={bookingVariant[guest.status]} dot>
                          {guest.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(guest.amount_pence)}</TableCell>
                      <TableCell className="text-text-muted capitalize">
                        {guest.payment_method || '—'}
                      </TableCell>
                      <TableCell className="text-text-muted text-xs max-w-[150px] truncate">
                        {guest.dietary_requirements || '—'}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCheckIn(guest.id, guest.checked_in)
                          }}
                          className={cn(
                            'w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center transition-colors border',
                            guest.checked_in
                              ? 'bg-accent text-white border-accent'
                              : 'bg-surface text-text-dim border-border hover:border-border-hover'
                          )}
                        >
                          {guest.checked_in ? <Check size={14} /> : <XIcon size={14} />}
                        </button>
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
