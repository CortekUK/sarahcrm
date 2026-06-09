'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { Avatar } from '@/components/ui/Avatar'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { SponsorsPanel } from './SponsorsPanel'
import { formatDateTime, formatCurrency, cn } from '@/lib/utils'
import {
  ArrowLeft,
  Pencil,
  Send,
  Check,
  X as XIcon,
  ExternalLink,
  ImageIcon,
  Trash2,
} from 'lucide-react'
import type { Database } from '@/types/database'

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
  guests_invited: number
  accommodation_booked: boolean
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
  published: 'upcoming',
  live: 'active',
  draft: 'draft',
  completed: 'info',
  cancelled: 'urgent',
}
const bookingVariant: Record<BookingStatus, 'active' | 'upcoming' | 'draft' | 'urgent'> = {
  confirmed: 'active',
  pending: 'upcoming',
  cancelled: 'urgent',
  refunded: 'draft',
}
const typeLabels: Record<string, string> = {
  member_event: 'Member Event',
  curated_luxury: 'Curated Luxury',
  retreat: 'Retreat',
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const confirm = useConfirm()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [guests, setGuests] = useState<GuestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (id) fetchEvent(id)
  }, [id])

  async function fetchEvent(eventId: string) {
    setLoading(true)
    const [eventRes, guestsRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase
        .from('bookings')
        .select(
          'id, status, amount_pence, payment_method, dietary_requirements, special_requests, checked_in, checked_in_at, is_guest, guest_name, guests_invited, accommodation_booked, members(id, profiles(first_name, last_name, email, avatar_url, company_name))',
        )
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

  async function handleDelete() {
    if (!id || !event) return
    const bookingCount = guests.length
    const ok = await confirm({
      title: `Delete "${event.title}"?`,
      description: (
        <span>
          The event row, its public detail page at <code className="text-xs">/events/{event.slug}</code>, and{' '}
          <strong className="text-text">
            {bookingCount} booking{bookingCount === 1 ? '' : 's'}
          </strong>{' '}
          will be permanently removed. Members will not be refunded automatically — handle refunds
          in Stripe before deleting if money has changed hands. This cannot be undone.
        </span>
      ),
      confirmLabel: 'Delete event',
      tone: 'danger',
    })
    if (!ok) return
    setDeleting(true)
    const { error: err } = await supabase.from('events').delete().eq('id', id)
    if (err) {
      setDeleting(false)
      await confirm({
        title: 'Delete failed',
        description: err.message,
        confirmLabel: 'Close',
        tone: 'warning',
      })
      return
    }
    router.push('/dashboard/events')
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
          : g,
      ),
    )
  }

  if (loading || !event) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading event…</span>
        </div>
      </div>
    )
  }

  const confirmedGuests = guests.filter((g) => g.status === 'confirmed')
  const totalRevenue = confirmedGuests.reduce((sum, g) => sum + g.amount_pence, 0)
  const capacityPct = event.capacity
    ? Math.round((confirmedGuests.length / event.capacity) * 100)
    : null
  const checkedInCount = guests.filter((g) => g.checked_in).length
  const speakers = (event.speakers as Array<{ name: string; title?: string }> | null) ?? []
  const agenda =
    (event.agenda as Array<{ time: string; title: string; description?: string }> | null) ?? []
  const galleryUrls = (event.gallery_urls as string[] | null) ?? []
  const isPast = new Date(event.start_date) < new Date()

  return (
    <div className="p-4 md:p-8">
      {/* Header — back link + action buttons. Buttons wrap on mobile. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <button
          onClick={() => router.push('/dashboard/events')}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors self-start"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          Back to events
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {event.status === 'draft' && (
            <Button
              icon={<Send size={14} />}
              size="sm"
              loading={publishing}
              onClick={handlePublish}
            >
              Publish event
            </Button>
          )}
          {(event.status === 'published' || event.status === 'live') && (
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancel event
            </Button>
          )}
          <Button
            variant="secondary"
            icon={<Pencil size={14} />}
            size="sm"
            onClick={() => router.push(`/dashboard/events/${id}/edit`)}
          >
            Edit
          </Button>
          {/* Delete sits last — destructive action, separate visual weight
             from the routine edit/publish controls. */}
          <Button
            variant="danger"
            icon={<Trash2 size={14} />}
            size="sm"
            loading={deleting}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Event info card */}
      <Card className="mb-6">
        <CardContent className="py-5 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="font-[family-name:var(--font-heading)] text-xl md:text-2xl font-semibold text-text leading-tight">
                  {event.title}
                </h1>
                <Badge variant={statusVariant[event.status]} dot>
                  {event.status}
                </Badge>
              </div>
              <p className="text-sm text-text-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>{typeLabels[event.event_type]}</span>
                <span className="text-text-dim">·</span>
                <span className="font-mono text-xs text-text-dim">/{event.slug}</span>
              </p>
            </div>
            {event.cover_image_url && (
              <div className="hidden md:block w-40 aspect-[16/10] rounded-md overflow-hidden bg-surface-2 border border-border flex-shrink-0">
                <Image
                  src={event.cover_image_url}
                  alt=""
                  width={320}
                  height={200}
                  className="object-cover w-full h-full"
                  unoptimized
                />
              </div>
            )}
          </div>

          {/* Particulars grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 text-sm">
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">
                Date
              </p>
              <p className="text-text">{formatDateTime(event.start_date)}</p>
              {event.end_date && (
                <p className="text-text-muted text-xs">to {formatDateTime(event.end_date)}</p>
              )}
              {event.doors_open && (
                <p className="text-text-dim text-xs">Doors: {formatDateTime(event.doors_open)}</p>
              )}
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">
                Venue
              </p>
              <p className="text-text">{event.venue_name || '—'}</p>
              {event.venue_city && (
                <p className="text-text-muted text-xs">
                  {event.venue_city}
                  {event.venue_postcode ? `, ${event.venue_postcode}` : ''}
                </p>
              )}
              {event.venue_url && (
                <a
                  href={event.venue_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-gold mt-1"
                >
                  Venue site
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">
                Pricing
              </p>
              <p className="text-text">Member: {formatCurrency(event.member_price_pence)}</p>
              <p className="text-text-muted text-xs">Guest: {formatCurrency(event.guest_price_pence)}</p>
              {event.sponsor_price_pence > 0 && (
                <p className="text-text-muted text-xs">
                  Sponsor: {formatCurrency(event.sponsor_price_pence)}
                </p>
              )}
            </div>
            <div>
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-1">
                Options
              </p>
              <div className="flex flex-wrap gap-1.5">
                {event.travel_included && <Badge variant="info">Travel incl.</Badge>}
                {event.accommodation_available && (
                  <Badge variant="info">
                    Accom.{' '}
                    {event.accommodation_price_pence
                      ? formatCurrency(event.accommodation_price_pence)
                      : 'incl.'}
                  </Badge>
                )}
                {event.guest_list_visible && <Badge variant="draft">Guest list visible</Badge>}
                {event.auto_confirm && <Badge variant="draft">Auto-confirm</Badge>}
                {!event.travel_included &&
                  !event.accommodation_available &&
                  !event.guest_list_visible &&
                  !event.auto_confirm && (
                    <span className="text-xs text-text-dim">No options set</span>
                  )}
              </div>
            </div>
          </div>

          {event.description && (
            <div className="mt-5 pt-5 border-t border-border">
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-2">
                Description
              </p>
              <p className="text-sm text-text-muted whitespace-pre-line leading-relaxed">
                {event.description}
              </p>
            </div>
          )}

          {speakers.length > 0 && (
            <div className="mt-5 pt-5 border-t border-border">
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-2">
                Speakers
              </p>
              <div className="flex flex-wrap gap-2">
                {speakers.map((s, i) => (
                  <div
                    key={i}
                    className="bg-surface-2 rounded-[var(--radius-md)] px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-text">{s.name}</span>
                    {s.title && <span className="text-text-muted ml-1">— {s.title}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {agenda.length > 0 && (
            <div className="mt-5 pt-5 border-t border-border">
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-2">
                Agenda
              </p>
              <div className="space-y-2">
                {agenda.map((item, i) => (
                  <div key={i} className="flex gap-3 sm:gap-4 text-sm">
                    <span className="text-text-dim w-14 sm:w-16 shrink-0 font-mono text-xs pt-0.5">
                      {item.time}
                    </span>
                    <div className="min-w-0">
                      <span className="font-medium text-text">{item.title}</span>
                      {item.description && (
                        <p className="text-text-muted text-xs mt-0.5">{item.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {galleryUrls.length > 0 && (
            <div className="mt-5 pt-5 border-t border-border">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Photo gallery
                </p>
                <p className="text-[11px] text-text-dim">
                  <ImageIcon size={10} className="inline mr-1" />
                  {galleryUrls.length} {galleryUrls.length === 1 ? 'photo' : 'photos'}
                  {!isPast && ' · only shown publicly after the event'}
                </p>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {galleryUrls.map((url, i) => (
                  <div
                    key={url + i}
                    className="relative aspect-square overflow-hidden rounded bg-surface-2 border border-border"
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 33vw, 16vw"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats — 2-up on mobile, 4-up on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 mb-6">
        <StatCard label="Confirmed bookings" value={confirmedGuests.length} />
        <StatCard label="Revenue" value={formatCurrency(totalRevenue)} />
        <StatCard label="Capacity" value={capacityPct !== null ? `${capacityPct}%` : '—'} />
        <StatCard label="Checked in" value={`${checkedInCount} / ${confirmedGuests.length}`} />
      </div>

      {/* Guest list — desktop table, mobile cards */}
      <Card>
        <CardHeader>
          <CardTitle>Guest list ({guests.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {guests.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-text-dim">No bookings yet</div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
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
                        : `${guest.members?.profiles?.first_name ?? ''} ${guest.members?.profiles?.last_name ?? ''}`.trim() ||
                          'Unknown'
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
                              <div className="min-w-0">
                                <p className="font-medium text-text truncate">
                                  {name}
                                  {guest.is_guest && (
                                    <span className="ml-1.5 text-xs text-text-dim font-normal">
                                      (Guest)
                                    </span>
                                  )}
                                </p>
                                {email && <p className="text-xs text-text-dim truncate">{email}</p>}
                                {company && (
                                  <p className="text-xs text-text-dim truncate">{company}</p>
                                )}
                                {(guest.guests_invited > 0 || guest.accommodation_booked) && (
                                  <div className="mt-1 flex flex-wrap gap-1.5">
                                    {guest.guests_invited > 0 && (
                                      <Badge variant="info">
                                        +1 guest{guest.guest_name ? `: ${guest.guest_name}` : ''}
                                      </Badge>
                                    )}
                                    {guest.accommodation_booked && (
                                      <Badge variant="draft">Accommodation</Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={bookingVariant[guest.status]} dot>
                              {guest.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {guest.amount_pence > 0 ? (
                              formatCurrency(guest.amount_pence)
                            ) : (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full border border-bronze/35 bg-bronze/10 text-[10.5px] font-medium uppercase tracking-[0.14em] text-bronze-light italic"
                                title={
                                  guest.is_guest
                                    ? 'Host invite — no charge'
                                    : 'Member tier benefit'
                                }
                              >
                                Complimentary
                              </span>
                            )}
                          </TableCell>
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
                                  : 'bg-surface text-text-dim border-border hover:border-border-hover',
                              )}
                              aria-label={guest.checked_in ? 'Check out' : 'Check in'}
                            >
                              {guest.checked_in ? <Check size={14} /> : <XIcon size={14} />}
                            </button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-border">
                {guests.map((guest) => {
                  const name = guest.is_guest
                    ? guest.guest_name || 'Guest'
                    : `${guest.members?.profiles?.first_name ?? ''} ${guest.members?.profiles?.last_name ?? ''}`.trim() ||
                      'Unknown'
                  const email = guest.members?.profiles?.email
                  return (
                    <div key={guest.id} className="p-4 flex items-start gap-3">
                      <Avatar src={guest.members?.profiles?.avatar_url} name={name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-text text-sm truncate">
                            {name}
                            {guest.is_guest && (
                              <span className="ml-1.5 text-[10px] text-text-dim font-normal">
                                Guest
                              </span>
                            )}
                          </p>
                          <Badge variant={bookingVariant[guest.status]} dot>
                            {guest.status}
                          </Badge>
                        </div>
                        {email && <p className="text-xs text-text-dim truncate">{email}</p>}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-xs text-text-muted">
                            {guest.amount_pence > 0 ? (
                              formatCurrency(guest.amount_pence)
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-bronze/35 bg-bronze/10 text-[10px] font-medium uppercase tracking-[0.14em] text-bronze-light italic">
                                Complimentary
                              </span>
                            )}
                            {guest.payment_method && guest.amount_pence > 0 && (
                              <span className="text-text-dim ml-2 capitalize">
                                · {guest.payment_method}
                              </span>
                            )}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleCheckIn(guest.id, guest.checked_in)
                            }}
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full border transition-colors',
                              guest.checked_in
                                ? 'bg-accent text-white border-accent'
                                : 'bg-surface text-text-dim border-border',
                            )}
                          >
                            {guest.checked_in ? (
                              <>
                                <Check size={11} /> Checked in
                              </>
                            ) : (
                              <>
                                <XIcon size={11} /> Not checked in
                              </>
                            )}
                          </button>
                        </div>
                        {guest.dietary_requirements && (
                          <p className="mt-1.5 text-[11px] text-text-muted">
                            <span className="text-text-dim">Dietary:</span>{' '}
                            {guest.dietary_requirements}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Sponsors — packages, members and committed revenue for this event */}
      <div className="mt-6">
        <SponsorsPanel eventId={id} defaultAmountPence={event.sponsor_price_pence} />
      </div>
    </div>
  )
}
