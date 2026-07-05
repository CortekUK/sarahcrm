// Member ROI rollup (Feature #5)
//
// Aggregates the commercial value The Club has delivered to — and captured
// from — a single member. EVERY money figure is an integer `*_pence` value;
// we keep all arithmetic in integer pence and only divide by 100 at display
// time (via `formatCurrency`).
//
// This runs in the client member-detail view using the browser supabase
// client by default, but accepts an injected client so the admin recompute
// API route can reuse the exact same logic with a service-role client.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { supabase as browserClient } from '@/lib/supabase/client'

type DbClient = SupabaseClient<Database>

export interface MemberRoi {
  memberId: string
  // Money captured from the member (all integer pence)
  revenuePaidPence: number       // payments marked paid
  eventSpendPence: number        // confirmed/paid event bookings
  sponsorshipSpendPence: number  // sponsorship packages (amount + event price)
  conciergeSpendPence: number    // quoted concierge fulfilment
  // Money the member has generated through the network (value delivered TO them)
  introRevenuePence: number      // realised revenue from their introductions
  pipelineValuePence: number     // estimated (not-yet-realised) intro value
  // Activity counts
  introsMade: number             // introductions where member is side A
  introsReceived: number         // introductions where member is side B
  introsTotal: number            // distinct introductions they're part of
  meetingsHeld: number           // introductions with a meeting logged
  dealsWon: number               // introductions with deal_status = 'won'
  eventsAttended: number         // bookings checked in + accepted invitations
  // Headline: the renewal number — commercial value The Club delivered to them,
  // i.e. realised revenue generated via their introductions.
  commercialValueDeliveredPence: number
  totalValuePence: number        // lifetime value: revenuePaid + introRevenue + sponsorship + event + realised concierge
}

const emptyRoi = (memberId: string): MemberRoi => ({
  memberId,
  revenuePaidPence: 0,
  eventSpendPence: 0,
  sponsorshipSpendPence: 0,
  conciergeSpendPence: 0,
  introRevenuePence: 0,
  pipelineValuePence: 0,
  introsMade: 0,
  introsReceived: 0,
  introsTotal: 0,
  meetingsHeld: 0,
  dealsWon: 0,
  eventsAttended: 0,
  commercialValueDeliveredPence: 0,
  totalValuePence: 0,
})

// Event bookings that represent real spend / attendance.
const ATTENDING_BOOKING_STATUSES = new Set(['confirmed'])

// Concierge requests that represent REALISED (paid-for) spend. Earlier stages
// ('enquiry', 'pending', 'sourcing', 'quoted') are unpaid quotes and must NOT
// be counted as money the member has spent.
const REALISED_CONCIERGE_STATUSES = new Set(['booked', 'delivered', 'feedback'])

export async function computeMemberRoi(
  memberId: string,
  client: DbClient = browserClient as unknown as DbClient,
): Promise<MemberRoi> {
  if (!memberId) return emptyRoi(memberId)

  const roi = emptyRoi(memberId)

  const [
    paymentsRes,
    bookingsRes,
    sponsorshipsRes,
    conciergeRes,
    introsRes,
    invitationsRes,
  ] = await Promise.all([
    client
      .from('payments')
      .select('amount_pence, status')
      .eq('member_id', memberId),
    client
      .from('bookings')
      .select('amount_pence, status, checked_in')
      .eq('member_id', memberId),
    client
      .from('sponsorships')
      .select('amount_pence, event_price_pence')
      .eq('member_id', memberId),
    client
      .from('concierge_requests')
      .select('quoted_amount_pence, status')
      .eq('member_id', memberId),
    client
      .from('introductions')
      .select(
        'member_a_id, member_b_id, revenue_pence, estimated_value_pence, deal_status, meeting_held_at',
      )
      .or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId}`),
    // event_invitations has NO declared FK to members — join manually, code
    // defensively against nullable member_id.
    client
      .from('event_invitations')
      .select('status')
      .eq('member_id', memberId),
  ])

  // ── Revenue paid ────────────────────────────────────────────────
  for (const p of paymentsRes.data ?? []) {
    if (p.status === 'paid') roi.revenuePaidPence += p.amount_pence ?? 0
  }

  // ── Event spend + attendance (checked-in bookings) ──────────────
  for (const b of bookingsRes.data ?? []) {
    if (ATTENDING_BOOKING_STATUSES.has(b.status)) {
      roi.eventSpendPence += b.amount_pence ?? 0
    }
    if (b.checked_in) roi.eventsAttended += 1
  }

  // ── Sponsorship spend (package amount + any event-specific price) ─
  for (const s of sponsorshipsRes.data ?? []) {
    roi.sponsorshipSpendPence += (s.amount_pence ?? 0) + (s.event_price_pence ?? 0)
  }

  // ── Concierge spend (only realised / booked fulfilment) ─────────
  // Unpaid quotes (enquiry/pending/sourcing/quoted) are excluded.
  for (const c of conciergeRes.data ?? []) {
    if (REALISED_CONCIERGE_STATUSES.has(c.status)) {
      roi.conciergeSpendPence += c.quoted_amount_pence ?? 0
    }
  }

  // ── Introductions ───────────────────────────────────────────────
  const introIds = new Set<string>()
  for (const i of introsRes.data ?? []) {
    if (i.member_a_id === memberId) roi.introsMade += 1
    if (i.member_b_id === memberId) roi.introsReceived += 1
    // A member could theoretically appear on both sides of one row; count the
    // row once for the total via the pair signature.
    introIds.add(`${i.member_a_id}:${i.member_b_id}`)
    roi.introRevenuePence += i.revenue_pence ?? 0
    roi.pipelineValuePence += i.estimated_value_pence ?? 0
    if (i.meeting_held_at) roi.meetingsHeld += 1
    if (i.deal_status === 'won') roi.dealsWon += 1
  }
  roi.introsTotal = (introsRes.data ?? []).length

  // ── Attendance via accepted invitations (defensive, additive) ───
  for (const inv of invitationsRes.data ?? []) {
    if (inv.status === 'accepted' || inv.status === 'attended') roi.eventsAttended += 1
  }

  // ── Headline: commercial value delivered (the renewal number) ───
  // Revenue The Club generated FOR them via introductions — kept distinct
  // from anything they spent.
  roi.commercialValueDeliveredPence = roi.introRevenuePence

  // ── Lifetime total value ────────────────────────────────────────
  roi.totalValuePence =
    roi.revenuePaidPence +
    roi.introRevenuePence +
    roi.sponsorshipSpendPence +
    roi.eventSpendPence +
    roi.conciergeSpendPence

  return roi
}
