// Relationship scoring (Feature #4)
//
// Deterministic, transparent, cheap-to-compute scores written into the
// members table's (currently-null) score columns. Every score is an integer
// 0–100. The formulas are intentionally simple and fully commented so they
// can be sanity-checked and tuned by hand — no ML, no hidden state.
//
// Reuses `computeMemberRoi` for the commercial signals and layers engagement
// signals (email opens/clicks, event attendance, introductions, recency) on
// top. Accepts an injected supabase client so the client view and the admin
// recompute route share one implementation.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { supabase as browserClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { computeMemberRoi } from './roi'

type DbClient = SupabaseClient<Database>

export interface MemberScores {
  engagement_score: number
  churn_risk_score: number
  relationship_capital_score: number
  relationship_health_score: number
  lifetime_value_pence: number
  upgrade_potential: number
}

// Plain-English reasons behind each score, so admins can judge correctness.
// These are NOT persisted — they're an extra field the panel reads live.
export interface MemberScoreExplanations {
  engagement: string[]
  churn_risk: string[]
  relationship_capital: string[]
  relationship_health: string[]
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)))

const DAY_MS = 24 * 60 * 60 * 1000
const daysSince = (iso: string | null | undefined): number | null =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS) : null

const daysUntil = (iso: string | null | undefined): number | null =>
  iso ? Math.floor((new Date(iso).getTime() - Date.now()) / DAY_MS) : null

// Realised (paid) concierge stages — mirrors roi.ts. Recent activity in any
// concierge stage still signals engagement, so we track all statuses too.
const REALISED_CONCIERGE_STATUSES = new Set(['booked', 'delivered', 'feedback'])

// Numeric scores plus their explanations. `computeMemberScores` (the stable,
// DB-writable shape the recompute route relies on) returns only the numbers;
// this internal worker computes both.
async function computeScoreDetail(
  memberId: string,
  client: DbClient,
): Promise<{ scores: MemberScores; explanations: MemberScoreExplanations }> {
  const roi = await computeMemberRoi(memberId, client)

  const now = Date.now()
  const ninetyDaysAgo = new Date(now - 90 * DAY_MS).toISOString()
  const twelveMonthsAgo = new Date(now - 365 * DAY_MS).toISOString()

  const [memberRes, commsRes, recentCommsRes, referralsRes, paymentsRes, conciergeRes] =
    await Promise.all([
      client
        .from('members')
        .select(
          'renewal_date, membership_end_date, intros_used_this_month, monthly_intro_quota, member_satisfaction_score, nps_score',
        )
        .eq('id', memberId)
        .single(),
      // Most-recent engagement touchpoint (recency signal).
      client
        .from('communications')
        .select('opened_at, clicked_at, sent_at')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(50),
      // Opens/clicks in the last 90 days (freshness signal).
      client
        .from('communications')
        .select('opened_at, clicked_at')
        .eq('member_id', memberId)
        .gte('created_at', ninetyDaysAgo),
      // Members this person referred (relationship capital).
      client.from('members').select('id').eq('referred_by', memberId),
      // Payments (recency + trailing-12-month spend signal).
      client
        .from('payments')
        .select('amount_pence, status, paid_at')
        .eq('member_id', memberId),
      // Concierge activity (recent request = active relationship).
      client
        .from('concierge_requests')
        .select('status, updated_at, created_at')
        .eq('member_id', memberId),
    ])

  const member = memberRes.data
  const comms = commsRes.data ?? []
  const recentComms = recentCommsRes.data ?? []
  const referralCount = (referralsRes.data ?? []).length

  // ── Engagement signals (last 90 days) ───────────────────────────
  const opens90 = recentComms.filter((c) => c.opened_at).length
  const clicks90 = recentComms.filter((c) => c.clicked_at).length

  // Most-recent activity across every channel we track (for recency).
  const activityDates: number[] = []
  for (const c of comms) {
    for (const d of [c.opened_at, c.clicked_at, c.sent_at]) {
      if (d) activityDates.push(new Date(d).getTime())
    }
  }
  const lastActivityDays =
    activityDates.length > 0
      ? Math.floor((now - Math.max(...activityDates)) / DAY_MS)
      : null

  // ── Spend + payment recency signals ─────────────────────────────
  // A paying, recently-active member must NOT be flagged max churn.
  const paidPayments = (paymentsRes.data ?? []).filter((p) => p.status === 'paid')
  const paymentDates = paidPayments
    .map((p) => (p.paid_at ? new Date(p.paid_at).getTime() : null))
    .filter((t): t is number => t !== null)
  const lastPaymentDays =
    paymentDates.length > 0 ? Math.floor((now - Math.max(...paymentDates)) / DAY_MS) : null
  const spend12moPence = paidPayments
    .filter((p) => p.paid_at && p.paid_at >= twelveMonthsAgo)
    .reduce((sum, p) => sum + (p.amount_pence ?? 0), 0)

  const conciergeRows = conciergeRes.data ?? []
  const recentConcierge = conciergeRows.some((c) => {
    const d = c.updated_at ?? c.created_at
    return !!d && d >= ninetyDaysAgo
  })
  const realisedConcierge = conciergeRows.some((c) => REALISED_CONCIERGE_STATUSES.has(c.status))

  // Total realised spend across the relationship (from roi, always paid/booked).
  const totalSpendPence =
    roi.revenuePaidPence +
    roi.eventSpendPence +
    roi.sponsorshipSpendPence +
    roi.conciergeSpendPence

  const recentSpend90 = lastPaymentDays !== null && lastPaymentDays <= 90
  const anySpend = totalSpendPence > 0 || realisedConcierge

  const introsUsed = member?.intros_used_this_month ?? 0
  const introQuota = member?.monthly_intro_quota ?? 0
  const renewalDays = daysUntil(member?.renewal_date ?? member?.membership_end_date)

  const engagementReasons: string[] = []
  const churnReasons: string[] = []

  // ── ENGAGEMENT SCORE (0–100) ────────────────────────────────────
  // Rewards recent inbound interest, real-world participation AND spend.
  //   opens (90d)      → 5 pts each, cap 25
  //   clicks (90d)     → 10 pts each, cap 20
  //   events attended  → 8 pts each, cap 20
  //   intros involved  → 5 pts each, cap 15
  //   spend signal     → recent (≤90d) 15 / any realised spend 8 / 0
  //   recency bonus    → 10 (comms <30d) / 5 (<90d) / 0
  const spendEngagement = recentSpend90 || recentConcierge ? 15 : anySpend ? 8 : 0
  const engagement_score = clamp(
    Math.min(25, opens90 * 5) +
      Math.min(20, clicks90 * 10) +
      Math.min(20, roi.eventsAttended * 8) +
      Math.min(15, roi.introsTotal * 5) +
      spendEngagement +
      (lastActivityDays !== null && lastActivityDays < 30
        ? 10
        : lastActivityDays !== null && lastActivityDays < 90
          ? 5
          : 0),
  )

  engagementReasons.push(
    opens90 > 0 ? `${opens90} email opens in last 90 days` : 'No email opens in last 90 days',
  )
  if (clicks90 > 0) engagementReasons.push(`${clicks90} email clicks in last 90 days`)
  engagementReasons.push(
    roi.eventsAttended > 0
      ? `${roi.eventsAttended} events attended`
      : 'No events attended',
  )
  engagementReasons.push(
    roi.introsTotal > 0
      ? `${roi.introsTotal} introductions involved in`
      : 'No introductions yet',
  )
  if (recentSpend90 || recentConcierge) {
    engagementReasons.push('Active spend / concierge in last 90 days')
  } else if (anySpend) {
    engagementReasons.push('Has spent with The Club (not recently)')
  }
  if (lastActivityDays !== null) {
    engagementReasons.push(`Last engagement ${lastActivityDays} days ago`)
  }

  // ── CHURN RISK SCORE (0–100, higher = more at risk) ─────────────
  // Additive risk flags, then reduced by recent spend / payments so a paying,
  // active member is never flagged max churn.
  //   no activity / stale (>90d, or never)  → +30
  //   quietening (60–90d)                    → +15
  //   never attended an event                → +20
  //   never in an introduction               → +15
  //   renewal within 60 days                 → +20
  //   no opens/clicks in last 90 days        → +15
  //   intro quota exists but unused this mo. → +10
  //   ── mitigations ──
  //   payment received in last 90 days       → −30
  //   recent concierge activity (≤90d)       → −15
  //   any realised spend on record           → −15
  let churn = 0
  if (lastActivityDays === null || lastActivityDays > 90) {
    churn += 30
    churnReasons.push('No engagement activity in over 90 days')
  } else if (lastActivityDays > 60) {
    churn += 15
    churnReasons.push('Engagement quietening (60–90 days)')
  }
  if (roi.eventsAttended === 0) {
    churn += 20
    churnReasons.push('No events attended')
  }
  if (roi.introsTotal === 0) {
    churn += 15
    churnReasons.push('Not involved in any introductions')
  }
  if (renewalDays !== null && renewalDays >= 0 && renewalDays <= 60) {
    churn += 20
    churnReasons.push(`Renewal in ${renewalDays} days`)
  }
  if (opens90 === 0 && clicks90 === 0) {
    churn += 15
    churnReasons.push('No email opens or clicks in last 90 days')
  }
  if (introQuota > 0 && introsUsed === 0) {
    churn += 10
    churnReasons.push('Intro quota unused this month')
  }
  if (recentSpend90) {
    churn -= 30
    churnReasons.push(`Paid ${formatCurrency(spend12moPence)} in last 12 months`)
  } else if (spend12moPence > 0) {
    churnReasons.push(`${formatCurrency(spend12moPence)} paid in last 12 months`)
  }
  if (recentConcierge) {
    churn -= 15
    churnReasons.push('Active concierge request in last 90 days')
  }
  if (anySpend) churn -= 15
  const churn_risk_score = clamp(churn)
  if (churnReasons.length === 0) churnReasons.push('No churn risk flags')

  // ── RELATIONSHIP CAPITAL SCORE (0–100) ──────────────────────────
  // The client's "Relationship Capital" spec: event attendance +
  // introductions made/received + revenue generated + sponsorship +
  // referrals + engagement.
  //   event attendance   → 6 pts each, cap 25
  //   intros made/rec'd  → 4 pts each, cap 20
  //   intro revenue      → 5 pts / £5,000, cap 20
  //   sponsorship spend  → flat 10 if any
  //   referrals brought  → 5 pts each, cap 10
  //   engagement blend   → 15% of engagement_score, cap 15
  const introRevenuePounds = roi.introRevenuePence / 100
  const relationship_capital_score = clamp(
    Math.min(25, roi.eventsAttended * 6) +
      Math.min(20, roi.introsTotal * 4) +
      Math.min(20, Math.floor(introRevenuePounds / 5000) * 5) +
      (roi.sponsorshipSpendPence > 0 ? 10 : 0) +
      Math.min(10, referralCount * 5) +
      Math.min(15, engagement_score * 0.15),
  )

  const capitalReasons: string[] = []
  if (roi.introsMade > 0) capitalReasons.push(`${roi.introsMade} introductions made`)
  if (roi.introsReceived > 0) capitalReasons.push(`${roi.introsReceived} introductions received`)
  if (roi.introRevenuePence > 0)
    capitalReasons.push(`${formatCurrency(roi.introRevenuePence)} revenue generated via intros`)
  if (roi.sponsorshipSpendPence > 0)
    capitalReasons.push(`${formatCurrency(roi.sponsorshipSpendPence)} sponsorship`)
  if (referralCount > 0) capitalReasons.push(`${referralCount} members referred`)
  if (roi.eventsAttended > 0) capitalReasons.push(`${roi.eventsAttended} events attended`)
  if (capitalReasons.length === 0) capitalReasons.push('No relationship capital signals yet')

  // ── RELATIONSHIP HEALTH SCORE (0–100) ───────────────────────────
  // Overall health = half engagement, half the inverse of churn risk,
  // nudged by an explicit satisfaction/NPS signal when we have one.
  const satisfaction = member?.member_satisfaction_score ?? member?.nps_score ?? null
  let health = 0.5 * engagement_score + 0.5 * (100 - churn_risk_score)
  if (satisfaction !== null) {
    // Blend in satisfaction at 20% weight (assumes a 0–100 or 0–10 scale;
    // scale up small values so a 0–10 NPS still contributes meaningfully).
    const satPct = satisfaction <= 10 ? satisfaction * 10 : satisfaction
    health = 0.8 * health + 0.2 * satPct
  }
  const relationship_health_score = clamp(health)

  const healthReasons: string[] = [
    `Engagement ${engagement_score}/100`,
    `Churn risk ${churn_risk_score}/100`,
  ]
  if (satisfaction !== null) healthReasons.push(`Satisfaction/NPS on record (${satisfaction})`)

  // ── UPGRADE POTENTIAL (0–100) ───────────────────────────────────
  // High engagement + high relationship capital + low churn signals a
  // member primed to move up a tier. (Assumption: a single 0–100 index; the
  // admin reads it as "room / appetite to upgrade".)
  const upgrade_potential = clamp(
    0.4 * engagement_score + 0.4 * relationship_capital_score + 0.2 * (100 - churn_risk_score),
  )

  return {
    scores: {
      engagement_score,
      churn_risk_score,
      relationship_capital_score,
      relationship_health_score,
      lifetime_value_pence: roi.totalValuePence,
      upgrade_potential,
    },
    explanations: {
      engagement: engagementReasons,
      churn_risk: churnReasons,
      relationship_capital: capitalReasons,
      relationship_health: healthReasons,
    },
  }
}

// Stable, DB-writable shape the recompute route relies on: returns ONLY the
// numeric score columns so `.update(scores)` never touches a nonexistent
// column.
export async function computeMemberScores(
  memberId: string,
  client: DbClient = browserClient as unknown as DbClient,
): Promise<MemberScores> {
  const { scores } = await computeScoreDetail(memberId, client)
  return scores
}

// Live variant the panel uses to render the meters WITH their plain-English
// explanations. No DB write path touches this, so the extra field is safe.
export async function computeMemberScoresWithExplanations(
  memberId: string,
  client: DbClient = browserClient as unknown as DbClient,
): Promise<{ scores: MemberScores; explanations: MemberScoreExplanations }> {
  return computeScoreDetail(memberId, client)
}
