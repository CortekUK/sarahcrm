// Chief of Staff — business-wide aggregation.
//
// Pure server function that fans out targeted, service-role reads and folds
// them into ONE typed briefing object. Every query is defensive: any single
// sub-query that errors defaults to 0 / [] with a console.warn and NEVER
// aborts the whole aggregation, so a briefing is always producible.
//
// The per-stream pipeline maths reuses the shared stage model
// (src/lib/pipeline/stages.ts) so the figures reconcile with the Executive
// Dashboard and the Pipeline board rather than inventing new metrics.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isOpenStage,
  membershipStage,
  sponsorshipStage,
  conciergeStage,
  introductionStage,
} from '@/lib/pipeline/stages'

// The service-role client is intentionally untyped for these tables (several
// live outside src/types/database.ts), so accept a loose client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

// ── Section shapes ────────────────────────────────────────────────────
export interface CosUpcomingEvent {
  title: string
  start_date: string
  daysAway: number
}
export interface CosOverdueTask {
  title: string
  owner: string
  deadline: string | null
}
export interface CosAtRiskMember {
  id: string
  name: string
  churn: number
}

export interface ChiefOfStaffData {
  memberships: { active: number; pending: number; renewingIn30: number }
  pipeline: {
    totalOpenPence: number
    byStream: {
      membership: number
      sponsorship: number
      concierge: number
      introductions: number
      commission: number
    }
  }
  events: { upcoming: CosUpcomingEvent[]; deadlinesThisWeek: number }
  team: { overdueTasks: CosOverdueTask[]; overdueCount: number }
  finance: { debtorsPence: number; overdueInvoiceCount: number; mrrPence: number }
  introductions: { toFollowUp: number; thisMonth: number }
  risks: {
    membersAtRisk: CosAtRiskMember[]
    sponsorAssetsMissing: number
    accountantOverdue: number
  }
}

// Run a section builder, swallowing any failure to a safe default so one bad
// query can never sink the whole briefing.
async function safe<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    console.warn(`[chief-of-staff] section "${label}" failed, using fallback:`, e)
    return fallback
  }
}

function iso(d: Date): string {
  return d.toISOString()
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function buildChiefOfStaffData(admin: Admin, now: Date): Promise<ChiefOfStaffData> {
  const todayStr = ymd(now)
  const in30Str = ymd(new Date(now.getTime() + 30 * 86_400_000))
  const in14Str = ymd(new Date(now.getTime() + 14 * 86_400_000))
  const in7Str = ymd(new Date(now.getTime() + 7 * 86_400_000))
  const startOfMonth = `${todayStr.slice(0, 7)}-01`

  const [
    memberships,
    pipeline,
    events,
    team,
    finance,
    introductions,
    risks,
  ] = await Promise.all([
    // ── Memberships ────────────────────────────────────────────────────
    safe('memberships', { active: 0, pending: 0, renewingIn30: 0 }, async () => {
      const [activeRes, pendingRes, renewingRes] = await Promise.all([
        admin
          .from('members')
          .select('id', { count: 'exact', head: true })
          .eq('membership_status', 'active')
          .is('deleted_at', null),
        admin
          .from('membership_applications')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        admin
          .from('members')
          .select('id', { count: 'exact', head: true })
          .eq('membership_status', 'active')
          .is('deleted_at', null)
          .not('renewal_date', 'is', null)
          .gte('renewal_date', todayStr)
          .lte('renewal_date', in30Str),
      ])
      return {
        active: activeRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        renewingIn30: renewingRes.count ?? 0,
      }
    }),

    // ── Pipeline (open = New + Qualified + Proposal) ────────────────────
    safe(
      'pipeline',
      {
        totalOpenPence: 0,
        byStream: { membership: 0, sponsorship: 0, concierge: 0, introductions: 0, commission: 0 },
      },
      async () => {
        const [appsRes, sponsorsRes, conciergeRes, introsRes] = await Promise.all([
          admin.from('membership_applications').select('status, amount_paid_pence'),
          admin.from('sponsorships').select('amount_pence, status'),
          admin
            .from('concierge_requests')
            .select('status, sale_price_pence, quoted_amount_pence, commission_pence, commission_status'),
          admin
            .from('introductions')
            .select('status, deal_status, estimated_value_pence, commission_pence, commission_status'),
        ])

        let membership = 0
        for (const a of (appsRes.data ?? []) as Array<{ status: string; amount_paid_pence: number | null }>) {
          if (isOpenStage(membershipStage(a.status))) membership += a.amount_paid_pence ?? 0
        }

        let sponsorship = 0
        for (const s of (sponsorsRes.data ?? []) as Array<{ amount_pence: number | null; status: string | null }>) {
          if (isOpenStage(sponsorshipStage((s.status ?? '').toLowerCase()))) sponsorship += s.amount_pence ?? 0
        }

        let concierge = 0
        let commission = 0
        for (const c of (conciergeRes.data ?? []) as Array<{
          status: string | null
          sale_price_pence: number | null
          quoted_amount_pence: number | null
          commission_pence: number | null
          commission_status: string | null
        }>) {
          if (isOpenStage(conciergeStage((c.status ?? '').toLowerCase())))
            concierge += c.sale_price_pence ?? c.quoted_amount_pence ?? 0
          if (c.commission_pence != null && c.commission_status !== 'paid') commission += c.commission_pence
        }

        let introductions = 0
        for (const i of (introsRes.data ?? []) as Array<{
          status: string
          deal_status: string | null
          estimated_value_pence: number | null
          commission_pence: number | null
          commission_status: string | null
        }>) {
          if (isOpenStage(introductionStage(i.status, i.deal_status)))
            introductions += i.estimated_value_pence ?? 0
          if (i.commission_pence != null && i.commission_status !== 'paid') commission += i.commission_pence
        }

        const totalOpenPence = membership + sponsorship + concierge + introductions + commission
        return {
          totalOpenPence,
          byStream: { membership, sponsorship, concierge, introductions, commission },
        }
      },
    ),

    // ── Events ──────────────────────────────────────────────────────────
    safe('events', { upcoming: [] as CosUpcomingEvent[], deadlinesThisWeek: 0 }, async () => {
      const [eventsRes, deliverablesRes] = await Promise.all([
        admin
          .from('events')
          .select('title, start_date')
          .gte('start_date', iso(now))
          .lte('start_date', iso(new Date(now.getTime() + 14 * 86_400_000)))
          .order('start_date', { ascending: true })
          .limit(8),
        admin
          .from('sponsor_deliverables')
          .select('id, status, due_date')
          .not('due_date', 'is', null)
          .neq('status', 'received')
          .gte('due_date', todayStr)
          .lte('due_date', in7Str),
      ])
      const upcoming: CosUpcomingEvent[] = ((eventsRes.data ?? []) as Array<{
        title: string
        start_date: string
      }>).map((e) => ({
        title: e.title,
        start_date: e.start_date,
        daysAway: Math.max(
          0,
          Math.round((new Date(e.start_date).getTime() - now.getTime()) / 86_400_000),
        ),
      }))
      return { upcoming, deadlinesThisWeek: (deliverablesRes.data ?? []).length }
    }),

    // ── Team (accountability tasks overdue) ─────────────────────────────
    safe('team', { overdueTasks: [] as CosOverdueTask[], overdueCount: 0 }, async () => {
      const { data } = await admin
        .from('accountability_tasks')
        .select('title, deadline, status, owner_id')
        .neq('status', 'done')
        .not('deadline', 'is', null)
        .lt('deadline', iso(now))
        .order('deadline', { ascending: true })
        .limit(50)
      const rows = (data ?? []) as Array<{
        title: string
        deadline: string | null
        status: string
        owner_id: string
      }>
      // Resolve owner names in one round-trip.
      const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id).filter(Boolean)))
      const nameById = new Map<string, string>()
      if (ownerIds.length > 0) {
        const { data: people } = await admin
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', ownerIds)
        for (const p of (people ?? []) as Array<{
          id: string
          first_name: string | null
          last_name: string | null
        }>) {
          nameById.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'A team member')
        }
      }
      const overdueTasks: CosOverdueTask[] = rows.slice(0, 8).map((r) => ({
        title: r.title,
        owner: nameById.get(r.owner_id) ?? 'A team member',
        deadline: r.deadline,
      }))
      return { overdueTasks, overdueCount: rows.length }
    }),

    // ── Finance (debtors + overdue count + MRR) ─────────────────────────
    safe('finance', { debtorsPence: 0, overdueInvoiceCount: 0, mrrPence: 0 }, async () => {
      const [outstandingRes, subsRes, plansRes] = await Promise.all([
        admin.from('payments').select('amount_pence, status').in('status', ['pending', 'overdue']),
        admin
          .from('members')
          .select('membership_tier')
          .not('stripe_subscription_id', 'is', null)
          .eq('membership_status', 'active')
          .is('deleted_at', null),
        admin
          .from('membership_plans')
          .select('tier_classification, monthly_price_pence')
          .eq('is_active', true),
      ])

      const outstanding = (outstandingRes.data ?? []) as Array<{
        amount_pence: number | null
        status: string
      }>
      const debtorsPence = outstanding.reduce((s, p) => s + (p.amount_pence ?? 0), 0)
      const overdueInvoiceCount = outstanding.filter((p) => p.status === 'overdue').length

      const priceByTier = new Map<string, number>()
      for (const p of (plansRes.data ?? []) as Array<{
        tier_classification: string | null
        monthly_price_pence: number
      }>) {
        if (p.tier_classification) priceByTier.set(p.tier_classification, p.monthly_price_pence)
      }
      const mrrPence = ((subsRes.data ?? []) as Array<{ membership_tier: string }>).reduce(
        (s, m) => s + (priceByTier.get(m.membership_tier) ?? 0),
        0,
      )

      return { debtorsPence, overdueInvoiceCount, mrrPence }
    }),

    // ── Introductions ───────────────────────────────────────────────────
    safe('introductions', { toFollowUp: 0, thisMonth: 0 }, async () => {
      const [followRes, monthRes] = await Promise.all([
        admin
          .from('introductions')
          .select('id', { count: 'exact', head: true })
          .in('status', ['sent', 'scheduled', 'accepted'])
          .is('outcome', null),
        admin
          .from('introductions')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfMonth),
      ])
      return { toFollowUp: followRes.count ?? 0, thisMonth: monthRes.count ?? 0 }
    }),

    // ── Risks ────────────────────────────────────────────────────────────
    safe(
      'risks',
      { membersAtRisk: [] as CosAtRiskMember[], sponsorAssetsMissing: 0, accountantOverdue: 0 },
      async () => {
        const [atRiskRes, assetsRes, financeRes] = await Promise.all([
          admin
            .from('members')
            .select('id, churn_risk_score, profiles(first_name, last_name)')
            .eq('membership_status', 'active')
            .is('deleted_at', null)
            .gte('churn_risk_score', 60)
            .order('churn_risk_score', { ascending: false })
            .limit(5),
          // Sponsor assets not yet received with a deadline inside the next 14
          // days — i.e. missing assets near an event window.
          admin
            .from('sponsor_deliverables')
            .select('id, status, due_date')
            .not('due_date', 'is', null)
            .neq('status', 'received')
            .gte('due_date', todayStr)
            .lte('due_date', in14Str),
          // Finance task occurrences past their due date and still pending.
          admin
            .from('finance_task_occurrences')
            .select('id, status, due_date')
            .eq('status', 'pending')
            .lt('due_date', todayStr),
        ])

        const membersAtRisk: CosAtRiskMember[] = ((atRiskRes.data ?? []) as unknown as Array<{
          id: string
          churn_risk_score: number | null
          profiles: { first_name: string | null; last_name: string | null } | null
        }>).map((m) => ({
          id: m.id,
          name:
            `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim() || 'A member',
          churn: m.churn_risk_score ?? 0,
        }))

        return {
          membersAtRisk,
          sponsorAssetsMissing: (assetsRes.data ?? []).length,
          accountantOverdue: (financeRes.data ?? []).length,
        }
      },
    ),
  ])

  return { memberships, pipeline, events, team, finance, introductions, risks }
}
