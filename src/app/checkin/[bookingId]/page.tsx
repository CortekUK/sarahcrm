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
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

type Phase = 'loading' | 'not_admin' | 'not_found' | 'ready' | 'done' | 'error'

interface BookingInfo {
  id: string
  name: string
  eventTitle: string
  alreadyIn: boolean
}

export default function CheckinPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const [phase, setPhase] = useState<Phase>('loading')
  const [booking, setBooking] = useState<BookingInfo | null>(null)
  const [saving, setSaving] = useState(false)

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
        'id, checked_in, attendance, is_guest, guest_name, members(profiles(first_name, last_name)), events(title)',
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
    const ev = Array.isArray(row.events) ? row.events[0] : row.events
    const name = row.is_guest
      ? (row.guest_name as string) || 'Guest'
      : `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'Member'
    setBooking({
      id: row.id as string,
      name,
      eventTitle: (ev as { title?: string } | null)?.title || 'the event',
      alreadyIn: row.checked_in === true || row.attendance === 'attended',
    })
    setPhase(row.checked_in === true ? 'done' : 'ready')
  }

  async function checkIn() {
    if (!booking) return
    setSaving(true)
    const { error } = await supabase
      .from('bookings')
      .update({
        checked_in: true,
        checked_in_at: new Date().toISOString(),
        attendance: 'attended',
      })
      .eq('id', booking.id)
    setSaving(false)
    setPhase(error ? 'error' : 'done')
  }

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

        {(phase === 'ready' || phase === 'done') && booking && (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface p-8">
            {phase === 'done' ? (
              <>
                <CheckCircle2 size={30} className="mx-auto text-accent mb-4" />
                <p className="text-text font-medium text-lg mb-1">{booking.name}</p>
                <p className="text-sm text-text-muted mb-1">is checked in.</p>
                <p className="text-xs text-text-dim">{booking.eventTitle}</p>
              </>
            ) : (
              <>
                <p className="font-[family-name:var(--font-heading)] text-xl text-text mb-1">
                  {booking.name}
                </p>
                <p className="text-sm text-text-muted mb-6">{booking.eventTitle}</p>
                <button
                  onClick={checkIn}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gold px-8 py-3 text-[11px] font-medium uppercase tracking-[0.2em] text-white disabled:opacity-60"
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
            <p className="text-sm text-text-muted mt-2">Please try again.</p>
          </div>
        )}
      </div>
    </div>
  )
}
