// GET /api/admin/members/success
//
// The data source for the admin "Member Success" view. Returns active,
// non-deleted members that currently have at least one attention flag, each
// with plain-English reasons and the raw scores behind them.
//
// Scores (churn_risk_score, engagement_score, upgrade_potential) are read
// from the persisted members columns — kept fresh daily by the
// `memberSuccessSweep` automation flow (and the "Recompute now" button, which
// POSTs /api/admin/members/recompute-scores). This route adds two LIVE signals
// that aren't stored as columns:
//   • last_attended — MAX(bookings.checked_in_at) where checked_in = true
//   • intros_total  — count of introductions the member is on either side of
// Both are computed in BATCH (one bookings query + one introductions query for
// all members, aggregated in JS) — never per-member, to avoid N+1.
//
// Admin only. Reads go through a service-role client so member-facing RLS
// doesn't hide rows. Optional ?flag=<flag> filters server-side.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Flag thresholds (single source of truth) ─────────────────────────
const CHURN_AT_RISK = 60 // churn_risk_score >= 60  → at risk
const RENEWAL_SOON_DAYS = 30 // renewal within next 30 days
const DORMANT_DAYS = 90 // no attendance in 90+ days (or never)
const UPGRADE_READY = 70 // upgrade_potential >= 70

type SuccessFlag =
  | 'at_risk'
  | 'renewal_soon'
  | 'no_intros'
  | 'dormant'
  | 'upgrade_ready'

const ALL_FLAGS: SuccessFlag[] = [
  'at_risk',
  'renewal_soon',
  'no_intros',
  'dormant',
  'upgrade_ready',
]

const DAY_MS = 24 * 60 * 60 * 1000

function getAdmin() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

interface ProfileJoin {
  first_name: string | null
  last_name: string | null
  email: string | null
  avatar_url: string | null
  company_name: string | null
  job_title: string | null
}

interface MemberRow {
  id: string
  membership_tier: Database['public']['Enums']['membership_tier']
  company_name: string | null
  renewal_date: string | null
  churn_risk_score: number | null
  engagement_score: number | null
  upgrade_potential: number | null
  profiles: ProfileJoin | ProfileJoin[] | null
}

interface FlaggedMember {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  company_name: string | null
  job_title: string | null
  membership_tier: MemberRow['membership_tier']
  renewal_date: string | null
  renewal_in_days: number | null
  churn_risk_score: number
  engagement_score: number
  upgrade_potential: number
  last_attended: string | null
  intros_total: number
  flags: SuccessFlag[]
  reasons: string[]
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export async function GET(req: NextRequest) {
  try {
    // ── Admin gate (mirrors recompute-scores/route.ts) ───────────────
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const adminDb = getAdmin()
    const flagParam = req.nextUrl.searchParams.get('flag')
    const filterFlag =
      flagParam && ALL_FLAGS.includes(flagParam as SuccessFlag)
        ? (flagParam as SuccessFlag)
        : null

    // ── Members (active, non-deleted) + joined profile ───────────────
    const { data: rawMembers, error: memberErr } = await adminDb
      .from('members')
      .select(
        'id, membership_tier, company_name, renewal_date, churn_risk_score, engagement_score, upgrade_potential, profiles(first_name, last_name, email, avatar_url, company_name, job_title)',
      )
      .eq('membership_status', 'active')
      .is('deleted_at', null)
    if (memberErr) return Response.json({ error: memberErr.message }, { status: 500 })

    const members = (rawMembers ?? []) as unknown as MemberRow[]
    const ids = members.map((m) => m.id)

    // ── Two BATCH queries for the live signals (no N+1) ──────────────
    const lastAttended = new Map<string, string>()
    const introCount = new Map<string, number>()

    if (ids.length > 0) {
      const [bookingsRes, introsRes] = await Promise.all([
        // All checked-in bookings for these members in one query; reduce to
        // the latest checked_in_at per member in JS.
        adminDb
          .from('bookings')
          .select('member_id, checked_in_at')
          .in('member_id', ids)
          .eq('checked_in', true),
        // All introductions touching any of these members in one query;
        // count per member (either side) in JS.
        adminDb
          .from('introductions')
          .select('member_a_id, member_b_id')
          .or(`member_a_id.in.(${ids.join(',')}),member_b_id.in.(${ids.join(',')})`),
      ])

      for (const b of (bookingsRes.data ?? []) as {
        member_id: string | null
        checked_in_at: string | null
      }[]) {
        if (!b.member_id || !b.checked_in_at) continue
        const prev = lastAttended.get(b.member_id)
        if (!prev || b.checked_in_at > prev) lastAttended.set(b.member_id, b.checked_in_at)
      }

      const memberIdSet = new Set(ids)
      for (const i of (introsRes.data ?? []) as {
        member_a_id: string | null
        member_b_id: string | null
      }[]) {
        if (i.member_a_id && memberIdSet.has(i.member_a_id)) {
          introCount.set(i.member_a_id, (introCount.get(i.member_a_id) ?? 0) + 1)
        }
        // Guard against a self-intro row double-counting the same member.
        if (
          i.member_b_id &&
          memberIdSet.has(i.member_b_id) &&
          i.member_b_id !== i.member_a_id
        ) {
          introCount.set(i.member_b_id, (introCount.get(i.member_b_id) ?? 0) + 1)
        }
      }
    }

    const now = Date.now()

    // ── Derive flags + reasons per member ────────────────────────────
    const flagged: FlaggedMember[] = []
    for (const m of members) {
      const prof = one(m.profiles)
      const churn = m.churn_risk_score ?? 0
      const engagement = m.engagement_score ?? 0
      const upgrade = m.upgrade_potential ?? 0
      const last = lastAttended.get(m.id) ?? null
      const intros = introCount.get(m.id) ?? 0

      const renewalInDays =
        m.renewal_date != null
          ? Math.floor((new Date(m.renewal_date).getTime() - now) / DAY_MS)
          : null
      const daysSinceAttended =
        last != null ? Math.floor((now - new Date(last).getTime()) / DAY_MS) : null

      const flags: SuccessFlag[] = []
      const reasons: string[] = []

      if (churn >= CHURN_AT_RISK) {
        flags.push('at_risk')
        reasons.push(`High churn risk (${churn}/100)`)
      }
      if (renewalInDays !== null && renewalInDays >= 0 && renewalInDays <= RENEWAL_SOON_DAYS) {
        flags.push('renewal_soon')
        reasons.push(
          renewalInDays === 0 ? 'Renews today' : `Renews in ${renewalInDays} day${renewalInDays === 1 ? '' : 's'}`,
        )
      }
      if (intros === 0) {
        flags.push('no_intros')
        reasons.push('No introductions yet')
      }
      if (daysSinceAttended === null) {
        flags.push('dormant')
        reasons.push('Never attended an event')
      } else if (daysSinceAttended > DORMANT_DAYS) {
        flags.push('dormant')
        reasons.push(`No attendance in ${daysSinceAttended} days`)
      }
      if (upgrade >= UPGRADE_READY) {
        flags.push('upgrade_ready')
        reasons.push(`Strong upgrade potential (${upgrade}/100)`)
      }

      if (flags.length === 0) continue
      if (filterFlag && !flags.includes(filterFlag)) continue

      const name =
        `${prof?.first_name ?? ''} ${prof?.last_name ?? ''}`.trim() ||
        prof?.email ||
        'Unnamed member'

      flagged.push({
        id: m.id,
        name,
        email: prof?.email ?? null,
        avatar_url: prof?.avatar_url ?? null,
        company_name: m.company_name ?? prof?.company_name ?? null,
        job_title: prof?.job_title ?? null,
        membership_tier: m.membership_tier,
        renewal_date: m.renewal_date,
        renewal_in_days: renewalInDays,
        churn_risk_score: churn,
        engagement_score: engagement,
        upgrade_potential: upgrade,
        last_attended: last,
        intros_total: intros,
        flags,
        reasons,
      })
    }

    // Most at-risk first.
    flagged.sort((a, b) => b.churn_risk_score - a.churn_risk_score)

    // Per-flag tallies for the view's summary tiles. The view fetches WITHOUT
    // a ?flag param and does its chip filtering client-side, so these counts
    // always reflect the full flagged set (when ?flag IS passed by an API
    // consumer, counts naturally reflect the narrowed result).
    const counts: Record<SuccessFlag, number> = {
      at_risk: 0,
      renewal_soon: 0,
      no_intros: 0,
      dormant: 0,
      upgrade_ready: 0,
    }
    for (const f of flagged) for (const fl of f.flags) counts[fl] += 1

    return Response.json({
      members: flagged,
      counts,
      total: flagged.length,
      thresholds: {
        at_risk: CHURN_AT_RISK,
        renewal_soon_days: RENEWAL_SOON_DAYS,
        dormant_days: DORMANT_DAYS,
        upgrade_ready: UPGRADE_READY,
      },
    })
  } catch (e) {
    console.error('[members/success] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
