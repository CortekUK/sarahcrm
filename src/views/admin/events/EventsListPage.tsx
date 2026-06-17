'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/providers/ThemeProvider'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { ImageUpload } from '@/components/ui/ImageUpload'
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
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import {
  Plus,
  CalendarDays,
  MapPin,
  Sparkles,
  TrendingUp,
  Ticket,
  Pencil,
  Trash2,
  ExternalLink,
  MoreVertical,
} from 'lucide-react'
import type { Database } from '@/types/database'

type EventType = Database['public']['Enums']['event_type']
type EventStatus = Database['public']['Enums']['event_status']
type PrivateEvent = Database['public']['Tables']['curated_experiences']['Row']

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

// Six tabs. `private_events` is a different beast — it manages the
// curated_experiences table (showcase cards with external links) used
// on /private-event-services, NOT bookable events. Everything else
// filters the events table.
type TabKey = EventType | 'all' | 'past' | 'private_events'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'member_event', label: 'Member Events' },
  { key: 'curated_luxury', label: 'Curated Luxury' },
  { key: 'retreat', label: 'Retreats' },
  { key: 'past', label: 'Past' },
  { key: 'private_events', label: 'Private Events' },
]

export function EventsListPage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventRow[]>([])
  const [privateEvents, setPrivateEvents] = useState<PrivateEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [eventsRes, privateRes] = await Promise.all([
      supabase
        .from('events')
        .select(
          'id, title, slug, start_date, venue_name, venue_city, event_type, status, capacity, member_price_pence, cover_image_url, bookings(count)',
        )
        .order('start_date', { ascending: false }),
      supabase
        .from('curated_experiences')
        .select('*')
        .order('display_order', { ascending: true }),
    ])

    if (eventsRes.data) {
      // One pass over bookings → revenue map, instead of N round-trips.
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
        (eventsRes.data as unknown as EventRow[]).map((e) => ({
          ...e,
          booking_revenue: revenueByEvent[e.id] ?? 0,
        })),
      )
    }
    if (privateRes.data) setPrivateEvents(privateRes.data)
    setLoading(false)
  }

  const now = useMemo(() => new Date(), [])

  const filtered = useMemo(() => {
    if (activeTab === 'all') return events.filter((e) => new Date(e.start_date) >= now)
    if (activeTab === 'past') return events.filter((e) => new Date(e.start_date) < now)
    if (activeTab === 'private_events') return [] // separate render path
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
      private: privateEvents.filter((p) => p.is_active).length,
      bookings: totalBookings,
      revenue: totalRevenue,
    }
  }, [events, privateEvents, now])

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading events…</span>
        </div>
      </div>
    )
  }

  const isPrivateTab = activeTab === 'private_events'

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Events"
        description="Member nights, curated luxury, retreats — and a separate Private Events tab for the showcase cards on the Private Events page (external-link commissions, not bookable here)."
        meta={
          <span className="text-xs text-text-dim">
            {events.length} bookable · {stats.upcoming} upcoming · {privateEvents.length} private showcases · {stats.bookings} bookings
          </span>
        }
        actions={
          isPrivateTab ? null : (
            <Button
              icon={<Plus size={16} />}
              onClick={() => router.push('/dashboard/events/new')}
            >
              Create event
            </Button>
          )
        }
      />

      {/* Stats — collapse to 2-up on mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatTile label="Upcoming" value={stats.upcoming} icon={<CalendarDays size={14} />} />
        <StatTile
          label="Private showcases"
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

      {/* Tabs — horizontally scrollable on narrow viewports */}
      <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {tabs.map((tab) => {
          const count =
            tab.key === 'all'
              ? events.filter((e) => new Date(e.start_date) >= now).length
              : tab.key === 'past'
                ? events.filter((e) => new Date(e.start_date) < now).length
                : tab.key === 'private_events'
                  ? privateEvents.length
                  : events.filter(
                      (e) => e.event_type === tab.key && new Date(e.start_date) >= now,
                    ).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3 md:px-4 py-2.5 text-sm transition-colors relative whitespace-nowrap',
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

      {/* Body — switches between bookable-events list and private events grid */}
      {isPrivateTab ? (
        <PrivateEventsPanel items={privateEvents} onRefetch={fetchAll} />
      ) : (
        <BookableEventsPanel rows={filtered} activeTab={activeTab} onRefetch={fetchAll} />
      )}
    </div>
  )
}

// ─── Bookable events panel — desktop table, mobile cards ─────────

function BookableEventsPanel({
  rows,
  activeTab,
  onRefetch,
}: {
  rows: EventRow[]
  activeTab: TabKey
  onRefetch: () => void
}) {
  const router = useRouter()
  const confirm = useConfirm()

  async function handleDelete(event: EventRow) {
    const bookingCount = event.bookings?.[0]?.count ?? 0
    const ok = await confirm({
      title: `Delete "${event.title}"?`,
      description: (
        <span>
          The event row, its public detail page, and{' '}
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
    const { error: err } = await supabase.from('events').delete().eq('id', event.id)
    if (err) {
      // Real errors here would be RLS / FK violations. Surface to the user.
      await confirm({
        title: 'Delete failed',
        description: err.message,
        confirmLabel: 'Close',
        tone: 'warning',
      })
      return
    }
    onRefetch()
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <AdminEmptyState
            icon={CalendarDays}
            title={
              activeTab === 'past'
                ? 'No past events yet'
                : 'No upcoming events in this category'
            }
            description="Create your first event to start taking bookings."
            action={
              <Button icon={<Plus size={16} />} onClick={() => router.push('/dashboard/events/new')}>
                Create event
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }
  return (
    <>
      {/* Desktop table — fixed layout so the title column always wins the
         space contest and titles never wrap one-word-per-line. The
         thumbnail lives inline with the title in the same cell. */}
      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[940px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[320px]">Event</TableHead>
                <TableHead className="w-[130px]">Date</TableHead>
                <TableHead className="w-[200px]">Venue</TableHead>
                <TableHead className="w-[140px]">Type</TableHead>
                <TableHead className="w-[100px]">Bookings</TableHead>
                <TableHead className="w-[110px] text-right hidden xl:table-cell">Revenue</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((event) => {
                const bookingCount = event.bookings?.[0]?.count ?? 0
                return (
                  <TableRow
                    key={event.id}
                    className="cursor-pointer group"
                    onClick={() => router.push(`/dashboard/events/${event.id}`)}
                  >
                    {/* Title cell — thumb + title + slug share one column so
                       the title gets the full min-w-[320px] to itself. */}
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Thumbnail
                          src={event.cover_image_url}
                          alt={event.title}
                          aspect="16 / 10"
                          width={48}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-medium text-text leading-snug line-clamp-2">
                            {event.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-text-dim font-mono truncate">
                            /{event.slug}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-text-muted whitespace-nowrap text-xs">
                      {formatDate(event.start_date)}
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {event.venue_name ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MapPin size={11} className="text-text-dim flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs truncate">{event.venue_name}</p>
                            {event.venue_city && (
                              <p className="text-[11px] text-text-dim truncate">
                                {event.venue_city}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-text-dim">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <TypePill type={event.event_type} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      <span className="text-text font-medium">{bookingCount}</span>
                      {event.capacity && (
                        <span className="text-text-dim text-xs"> / {event.capacity}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap hidden xl:table-cell text-sm">
                      {event.booking_revenue > 0 ? (
                        formatCurrency(event.booking_revenue)
                      ) : (
                        <span className="text-text-dim text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[event.status]} dot>
                        {event.status}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        onEdit={() => router.push(`/dashboard/events/${event.id}/edit`)}
                        onDelete={() => handleDelete(event)}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile cards — table is unreadable below md */}
      <div className="md:hidden space-y-3">
        {rows.map((event) => {
          const bookingCount = event.bookings?.[0]?.count ?? 0
          return (
            <Card
              key={event.id}
              className="cursor-pointer hover:border-border-hover transition-colors"
              onClick={() => router.push(`/dashboard/events/${event.id}`)}
            >
              <CardContent className="p-3">
                <div className="flex gap-3">
                  <Thumbnail
                    src={event.cover_image_url}
                    alt={event.title}
                    aspect="16 / 10"
                    width={84}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium text-text leading-snug line-clamp-2">
                        {event.title}
                      </h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Badge variant={statusVariant[event.status]} dot>
                          {event.status}
                        </Badge>
                        <div onClick={(e) => e.stopPropagation()}>
                          <RowActions
                            onEdit={() => router.push(`/dashboard/events/${event.id}/edit`)}
                            onDelete={() => handleDelete(event)}
                            alwaysVisible
                          />
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-text-dim font-normal mt-0.5 truncate">
                      /{event.slug}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <TypePill type={event.event_type} />
                      <span className="text-xs text-text-muted whitespace-nowrap">
                        {formatDate(event.start_date)}
                      </span>
                    </div>
                    {(event.venue_name || event.venue_city) && (
                      <p className="mt-1.5 text-xs text-text-muted truncate">
                        <MapPin size={10} className="inline mr-1 text-text-dim" />
                        {[event.venue_name, event.venue_city].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <span className="text-text-muted">
                        <span className="text-text font-medium">{bookingCount}</span>
                        {event.capacity && (
                          <span className="text-text-dim"> / {event.capacity}</span>
                        )}{' '}
                        bookings
                      </span>
                      {event.booking_revenue > 0 && (
                        <span className="text-accent font-medium">
                          {formatCurrency(event.booking_revenue)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </>
  )
}

// ─── Row actions menu — edit + delete dropdown ──────────────────
// Used on both the desktop table and mobile cards. Closes on click-out.

function RowActions({
  onEdit,
  onDelete,
  alwaysVisible = false,
}: {
  onEdit: () => void
  onDelete: () => void
  alwaysVisible?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const { theme } = useTheme()

  function placeMenu() {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const menuW = 150
    const menuH = 90
    const openUp = window.innerHeight - r.bottom < menuH + 16
    setCoords({
      top: openUp ? r.top - menuH - 4 : r.bottom + 4,
      left: Math.max(8, r.right - menuW),
    })
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (open) {
      setOpen(false)
      return
    }
    placeMenu()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const handler = () => placeMenu()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open])

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={cn(
          'p-1.5 rounded hover:bg-surface-2 text-text-dim hover:text-text transition-colors',
          !alwaysVisible && 'opacity-0 group-hover:opacity-100',
          open && 'opacity-100',
        )}
        aria-label="Row actions"
      >
        <MoreVertical size={14} strokeWidth={1.8} />
      </button>
      {open && coords && typeof window !== 'undefined' &&
        createPortal(
          <div className={theme === 'night' ? 'theme-night-admin' : ''}>
            <div className="fixed inset-0 z-60" onClick={() => setOpen(false)} />
            <div
              className="fixed bg-surface border border-border rounded-md shadow-lg py-1 min-w-[150px] z-61"
              style={{ top: coords.top, left: coords.left }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  onEdit()
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex items-center gap-2 text-text"
              >
                <Pencil size={12} />
                Edit
              </button>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  onDelete()
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex items-center gap-2 text-accent-warm"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function TypePill({ type }: { type: EventType }) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.12em] px-2 py-1 rounded-full',
        type === 'curated_luxury'
          ? 'bg-gold-muted text-gold-dark'
          : type === 'retreat'
            ? 'bg-[rgba(91,123,106,0.12)] text-accent'
            : 'bg-[rgba(90,123,150,0.12)] text-accent-blue',
      )}
    >
      {typeLabels[type]}
    </span>
  )
}

// ─── Private events panel — curated_experiences CRUD ─────────────

const privateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  image_url: z.string().optional(),
  link_url: z.string().optional(),
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
})
type PrivateFormData = z.infer<typeof privateSchema>

function PrivateEventsPanel({
  items,
  onRefetch,
}: {
  items: PrivateEvent[]
  onRefetch: () => void
}) {
  const confirm = useConfirm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PrivateEvent | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<PrivateFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(privateSchema) as any,
    defaultValues: {
      title: '',
      description: '',
      image_url: '',
      link_url: '',
      display_order: 0,
      is_active: true,
    },
  })

  useEffect(() => {
    if (modalOpen) {
      if (editing) {
        form.reset({
          title: editing.title,
          description: editing.description ?? '',
          image_url: editing.image_url ?? '',
          link_url: editing.link_url ?? '',
          display_order: editing.display_order,
          is_active: editing.is_active,
        })
      } else {
        form.reset({
          title: '',
          description: '',
          image_url: '',
          link_url: '',
          display_order: items.length,
          is_active: true,
        })
      }
      setError(null)
    }
  }, [modalOpen, editing, form, items.length])

  async function onSubmit(data: PrivateFormData) {
    setSaving(true)
    setError(null)
    const payload = {
      title: data.title,
      description: data.description || null,
      image_url: data.image_url || null,
      link_url: data.link_url || null,
      display_order: data.display_order,
      is_active: data.is_active,
    }
    try {
      if (editing) {
        const { error: err } = await supabase
          .from('curated_experiences')
          .update(payload)
          .eq('id', editing.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('curated_experiences').insert(payload)
        if (err) throw err
      }
      setModalOpen(false)
      setEditing(null)
      onRefetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item: PrivateEvent) {
    const ok = await confirm({
      title: 'Delete private event?',
      description: `"${item.title}" will be removed from the public Private Events page. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('curated_experiences').delete().eq('id', item.id)
    onRefetch()
  }

  async function handleToggleActive(item: PrivateEvent, next: boolean) {
    await supabase.from('curated_experiences').update({ is_active: next }).eq('id', item.id)
    onRefetch()
  }

  return (
    <>
      {/* Panel header — separate Create button because the page-header
         button is hidden on the private tab (different action label). */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-sm text-text-muted leading-relaxed max-w-2xl">
            These cards appear on{' '}
            <span className="text-text font-medium">/private-event-services</span> under “Curated
            Luxury Events”. Each card links out to an external page — there is no internal detail
            page or bookings flow.
          </p>
        </div>
        <Button
          icon={<Plus size={16} />}
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
          className="flex-shrink-0"
        >
          <span className="hidden sm:inline">Add private event</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={Sparkles}
              title="No private events yet"
              description="Add one to feature it on the Private Events page. The public site still has fallback mocked data, so the page won't look empty until your first card is published."
              action={
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setEditing(null)
                    setModalOpen(true)
                  }}
                >
                  Add first private event
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <PrivateEventCard
              key={item.id}
              item={item}
              onEdit={() => {
                setEditing(item)
                setModalOpen(true)
              }}
              onDelete={() => handleDelete(item)}
              onToggle={(next) => handleToggleActive(item, next)}
            />
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Edit private event' : 'Add private event'}
        size="lg"
      >
        {error && (
          <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
            <p className="text-sm text-accent-warm">{error}</p>
          </div>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g. Monaco Grand Prix"
            error={form.formState.errors.title?.message}
            {...form.register('title')}
          />
          <Textarea
            label="Description"
            rows={5}
            placeholder="What was the experience? Same voice as the public site — editorial, specific, concise."
            hint="Shown under the title on the card. Hidden if blank."
            {...form.register('description')}
          />
          <ImageUpload
            label="Image"
            value={form.watch('image_url')}
            onChange={(url) => form.setValue('image_url', url ?? '', { shouldDirty: true })}
            bucket="content"
            folder="experiences"
            aspect="4 / 3"
            hint="Card thumbnail. Falls back to the title's first letter if blank."
          />
          <Input
            label="External link"
            placeholder="https://"
            hint="Where the card click takes the visitor. Opens in a new tab."
            {...form.register('link_url')}
          />
          <Input
            label="Display order"
            type="number"
            hint="Lower numbers appear first on the public page."
            {...form.register('display_order')}
          />
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-border text-gold accent-gold"
              {...form.register('is_active')}
            />
            <span className="text-sm text-text">Active on Private Events page</span>
          </label>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-5 border-t border-border mt-5 -mx-6 px-6">
            <div>
              {editing && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    handleDelete(editing)
                    setModalOpen(false)
                    setEditing(null)
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-3 sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setModalOpen(false)
                  setEditing(null)
                }}
                className="flex-1 sm:flex-none"
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving} className="flex-1 sm:flex-none">
                {editing ? 'Save changes' : 'Add private event'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  )
}

function PrivateEventCard({
  item,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: PrivateEvent
  onEdit: () => void
  onDelete: () => void
  onToggle: (next: boolean) => void
}) {
  return (
    <Card
      className={cn(
        'overflow-hidden transition-opacity',
        !item.is_active && 'opacity-60',
      )}
    >
      <div className="relative aspect-[4/3] bg-surface-2">
        {item.image_url ? (
          // Image is from external Supabase storage — the Thumbnail component
          // is sized for tiny rows. Use a plain img tag with object-cover for
          // a proper card hero.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-[family-name:var(--font-heading)] text-5xl text-text-dim">
              {item.title.charAt(0)}
            </span>
          </div>
        )}
        {!item.is_active && (
          <span className="absolute top-2 left-2 inline-block px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] rounded-full bg-ink/80 backdrop-blur text-ivory-soft border border-graphite-line">
            Hidden
          </span>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-text leading-snug line-clamp-2">
          {item.title}
        </h3>
        {item.description && (
          <p className="mt-1.5 text-xs text-text-muted line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}
        {item.link_url && (
          <a
            href={item.link_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-text-dim hover:text-gold transition-colors truncate max-w-full"
          >
            <ExternalLink size={11} className="flex-shrink-0" />
            <span className="truncate">{item.link_url.replace(/^https?:\/\//, '')}</span>
          </a>
        )}
        <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
          <ActiveToggle active={item.is_active} onChange={onToggle} />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 text-text-dim hover:text-text rounded hover:bg-surface-2 transition-colors"
              aria-label="Edit"
            >
              <Pencil size={14} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 text-text-dim hover:text-accent-warm rounded hover:bg-surface-2 transition-colors"
              aria-label="Delete"
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
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
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center gap-1.5">
          <span className={toneClass}>{icon}</span>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
            {label}
          </p>
        </div>
        <p className="font-[family-name:var(--font-heading)] text-xl md:text-2xl lg:text-3xl font-semibold text-text mt-2">
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
