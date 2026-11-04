'use client'

// Admin-gated door check-in landing. The QR on a member's booking
// confirmation encodes /checkin/<bookingId>; a team member scans it, and this
// page marks the booking attended (checked_in + attendance='attended').
//
// Gated two ways: the UI only offers the action to an admin session, and RLS
// on `bookings` only lets an admin write — so a guest scanning their own pass
// can never check themselves in.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { CheckCircle2, AlertTriangle, Loader2, XCircle } from 'lucide-react'
import { formatCurrency, formatDateTime, formatTime, formatDate } from '@/lib/utils'
import { eventErrorMessage } from '@/views/admin/events/eventErrors'

type Phase = 'loading' | 'not_admin' | 'not_found' | 'ready' | 'refused' | 'done' | 'error'

type BookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'refunded'

interface BookingInfo {
  id: string
  name: string
  eventTitle: string
  eventStart: string | null
  eventStatus: string | null
  status: BookingStatus
  amountPence: number
  paid: boolean
  checkedInAt: string | null
  alreadyIn: boolean
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  pending: 'Pending — not confirmed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

// Why a booking can't be checked in, in words for the door team.
function refusalReason(b: BookingInfo): string | null {
  if (b.status === 'cancelled') return 'This booking was cancelled. Do not admit on this pass.'
  if (b.status === 'refunded') return 'This booking was refunded. Do not admit on this pass.'
  if (b.status === 'pending')
    return b.amountPence > 0
      ? 'This booking is still pending — payment has not been taken. Ask the guest to speak to the team.'
      : 'This booking is still pending approval. Ask the guest to speak to the team.'
  if (b.eventStatus === 'cancelled') return 'This event has been cancelled.'
  return null
}

function paymentLine(b: BookingInfo): string {
  if (b.amountPence <= 0) return 'Complimentary'
  if (b.paid) return `Paid ${formatCurrency(b.amountPence)}`
  return `Not paid (${formatCurrency(b.amountPence)} due)`
}

export default function CheckinPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const [phase, setPhase] = useState<Phase>('loading')
  const [booking, setBooking] = useState<BookingInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  useEffect(() => {
    if (bookingId) load()
  }, [bookingId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setPhase('not_admin')
      return
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      setPhase('not_admin')
      return
    }

    const { data, error } = await supabase
      .from('bookings')
      .select(
        'id, status, amount_pence, stripe_payment_intent_id, payment_method, checked_in, checked_in_at, attendance, is_guest, guest_name, members(profiles(first_name, last_name)), events(title, start_date, status)',
      )
      .eq('id', bookingId)
      .maybeSingle()

    if (error || !data) {
      setPhase('not_found')
      return
    }
    const row = data as Record<string, unknown>
    const member = Array.isArray(row.members) ? row.members[0] : row.members
    const prof = member
      ? Array.isArray((member as Record<string, unknown>).profiles)
        ? ((member as Record<string, unknown>).profiles as unknown[])[0]
        : (member as Record<string, unknown>).profiles
      : null
    const p = prof as { first_name?: string; last_name?: string } | null
    const ev = (Array.isArray(row.events) ? row.events[0] : row.events) as {
      title?: string
      start_date?: string | null
      status?: string | null
    } | null
    const name = row.is_guest
      ? (row.guest_name as string) || 'Guest'
      : `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'Member'
    const status = row.status as BookingStatus
    const amountPence = Number(row.amount_pence ?? 0)
    const info: BookingInfo = {
      id: row.id as string,
      name,
      eventTitle: ev?.title || 'the event',
      eventStart: ev?.start_date ?? null,
      eventStatus: ev?.status ?? null,
      status,
      amountPence,
      // A confirmed paid booking has been charged (card/Stripe or settled by
      // the team); a pending one has not.
      paid: amountPence > 0 && (status === 'confirmed' || status === 'refunded') &&
        (Boolean(row.stripe_payment_intent_id) || row.payment_method != null),
      checkedInAt: (row.checked_in_at as string | null) ?? null,
      alreadyIn: row.checked_in === true,
    }
    setBooking(info)
    if (info.alreadyIn) setPhase('done')
    else if (refusalReason(info)) setPhase('refused')
    else setPhase('ready')
  }

  async function checkIn() {
    if (!booking || refusalReason(booking)) return
    setSaving(true)
    setErrorText(null)
    const now = new Date().toISOString()
    const { data: updated, error } = await supabase
      .from('bookings')
      .update({
        checked_in: true,
        checked_in_at: now,
        attendance: 'attended',
      })
      .eq('id', booking.id)
      // Only flip a booking that is still confirmed and not yet in — a pass
      // scanned twice at once can't double up.
      .eq('status', 'confirmed')
      .eq('checked_in', false)
      .select('id')
    setSaving(false)
    if (error) {
      setErrorText(eventErrorMessage(error, 'Please try again.'))
      setPhase('error')
      return
    }
    if (!updated || updated.length === 0) {
      // Someone else checked them in (or the booking changed) meanwhile —
      // re-read and show the real state.
      setPhase('loading')
      await load()
      return
    }
    setBooking({ ...booking, alreadyIn: false, checkedInAt: now })
    setPhase('done')
  }

  const details = booking && (
    <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-left text-sm">
      <dt className="text-text-dim">Event date</dt>
      <dd className="text-text">
        {booking.eventStart ? `${formatDateTime(booking.eventStart)} (UK)` : 'Date TBC'}
      </dd>
      <dt className="text-text-dim">Booking</dt>
      <dd className={booking.status === 'confirmed' ? 'text-text' : 'text-accent-warm font-medium'}>
        {STATUS_LABEL[booking.status] ?? booking.status}
      </dd>
      <dt className="text-text-dim">Payment</dt>
      <dd
        className={
          booking.amountPence > 0 && !booking.paid ? 'text-accent-warm font-medium' : 'text-text'
        }
      >
        {paymentLine(booking)}
      </dd>
    </dl>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <span className="font-[family-name:var(--font-heading)] text-2xl text-text">The Club</span>
          <p className="mt-2 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.28em] text-gold">
            Door check-in
          </p>
        </div>

        {phase === 'loading' && (
          <div className="flex items-center justify-center gap-2 text-text-muted">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Checking pass…</span>
          </div>
        )}

        {phase === 'not_admin' && (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface p-8">
            <AlertTriangle size={26} className="mx-auto text-accent-warm mb-4" />
            <p className="text-text font-medium mb-2">Admin sign-in required</p>
            <p className="text-sm text-text-muted mb-5">
              Only the team can check guests in. Sign in with an admin account, then scan again.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-full bg-gold px-6 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white"
            >
              Sign in
            </Link>
          </div>
        )}

        {phase === 'not_found' && (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface p-8">
            <AlertTriangle size={26} className="mx-auto text-accent-warm mb-4" />
            <p className="text-text font-medium">Booking not found</p>
            <p className="text-sm text-text-muted mt-2">This pass doesn’t match a booking.</p>
          </div>
        )}

        {phase === 'refused' && booking && (
          <div className="rounded-[var(--radius-md)] border border-accent-warm/40 bg-surface p-8">
            <XCircle size={30} className="mx-auto text-accent-warm mb-4" />
            <p className="font-[family-name:var(--font-heading)] text-xl text-text mb-1">
              {booking.name}
            </p>
            <p className="text-sm text-text-muted">{booking.eventTitle}</p>
            <p className="mt-4 text-sm font-medium text-accent-warm">Can’t check in</p>
            <p className="text-sm text-text-muted mt-1">{refusalReason(booking)}</p>
            {details}
          </div>
        )}

        {(phase === 'ready' || phase === 'done') && booking && (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface p-8">
            {phase === 'done' ? (
              booking.alreadyIn ? (
                <>
                  <AlertTriangle size={30} className="mx-auto text-accent-warm mb-4" />
                  <p className="text-text font-medium text-lg mb-1">{booking.name}</p>
                  <p className="text-sm font-medium text-accent-warm mb-1">
                    {booking.checkedInAt
                      ? `Already checked in at ${formatTime(booking.checkedInAt)} (UK)${
                          booking.eventStart &&
                          formatDate(booking.checkedInAt) !== formatDate(booking.eventStart)
                            ? ` on ${formatDate(booking.checkedInAt)}`
                            : ''
                        }`
                      : 'Already checked in'}
                  </p>
                  <p className="text-xs text-text-muted">
                    This pass has been used. If this isn’t the same guest, check with the team.
                  </p>
                  <p className="text-xs text-text-dim mt-2">{booking.eventTitle}</p>
                  {details}
                </>
              ) : (
                <>
                  <CheckCircle2 size={30} className="mx-auto text-accent mb-4" />
                  <p className="text-text font-medium text-lg mb-1">{booking.name}</p>
                  <p className="text-sm text-text-muted mb-1">
                    is checked in
                    {booking.checkedInAt ? ` at ${formatTime(booking.checkedInAt)} (UK)` : ''}.
                  </p>
                  <p className="text-xs text-text-dim">{booking.eventTitle}</p>
                </>
              )
            ) : (
              <>
                <p className="font-[family-name:var(--font-heading)] text-xl text-text mb-1">
                  {booking.name}
                </p>
                <p className="text-sm text-text-muted">{booking.eventTitle}</p>
                {details}
                <button
                  onClick={checkIn}
                  disabled={saving}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-gold px-8 py-3 text-[11px] font-medium uppercase tracking-[0.2em] text-white disabled:opacity-60"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Check in
                </button>
              </>
            )}
          </div>
        )}

        {phase === 'error' && (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface p-8">
            <AlertTriangle size={26} className="mx-auto text-accent-warm mb-4" />
            <p className="text-text font-medium">Couldn’t check in</p>
            <p className="text-sm text-text-muted mt-2">{errorText ?? 'Please try again.'}</p>
          </div>
        )}
      </div>
    </div>
  )
}
