// GET /api/events/seats?ids=<uuid>,<uuid>…
//
// Seats taken per event, for the member portal's "N seats remaining" /
// "Fully booked" labels. Members can only read their OWN bookings under RLS,
// so the browser can't count other members' seats — this route counts with
// the service role and returns only the totals (no booking details).
//
// Seats = sum of (1 + guests_invited) over confirmed | pending bookings — the
// same rule the bookings BEFORE INSERT trigger enforces. Abandoned Stripe
// Checkout holds past the release window are not counted (they're released on
// the next booking attempt).
//
// Response: { [eventId]: seatsTaken }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { AWAITING_CHECKOUT, CHECKOUT_HOLD_MINUTES } from '@/lib/stripe/server-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 100

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const ids = Array.from(
      new Set(
        (req.nextUrl.searchParams.get('ids') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => UUID_RE.test(s)),
      ),
    ).slice(0, MAX_IDS)
    if (ids.length === 0) return NextResponse.json({})

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Only events members can see (published / live / completed).
    const { data: events } = await admin
      .from('events')
      .select('id')
      .in('id', ids)
      .in('status', ['published', 'live', 'completed'])
    const visible = (events ?? []).map((e: { id: string }) => e.id)
    const result: Record<string, number> = Object.fromEntries(visible.map((id) => [id, 0]))
    if (visible.length === 0) return NextResponse.json(result)

    const { data: rows, error } = await admin
      .from('bookings')
      .select('event_id, guests_invited, status, charge_error, updated_at')
      .in('event_id', visible)
      .in('status', ['confirmed', 'pending'])
    if (error) return NextResponse.json({ error: 'Could not load seats.' }, { status: 500 })

    const cutoff = Date.now() - CHECKOUT_HOLD_MINUTES * 60 * 1000
    for (const b of rows ?? []) {
      const stale =
        b.status === 'pending' &&
        b.charge_error === AWAITING_CHECKOUT &&
        new Date(b.updated_at).getTime() < cutoff
      if (stale) continue
      result[b.event_id] = (result[b.event_id] ?? 0) + 1 + (b.guests_invited ?? 0)
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Could not load seats.' }, { status: 500 })
  }
}
