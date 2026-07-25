// Chief of Staff — ONE shared generate implementation.
//
// Both the admin report route (POST /api/admin/chief-of-staff/report) and the
// daily automation flow (chiefOfStaffDaily) call THIS so the aggregation +
// narrative + upsert logic lives in exactly one place.
//
// Mirrors the handover/report blueprint: build the structured data, ask OpenAI
// for a warm plain-English briefing (reusing the repo's OpenAI setup), fall
// back to a DETERMINISTIC templated narrative when there's no key / on error,
// and upsert one row per report_date (today, Europe/London).

import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'
import { buildChiefOfStaffData, type ChiefOfStaffData } from './aggregate'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

export interface ChiefOfStaffReport {
  id: string
  report_date: string
  sections: ChiefOfStaffData
  narrative: string
  generated_at: string
  generated_by: string | null
}

// Today's calendar date in Europe/London (YYYY-MM-DD) — the report is keyed
// to the UK business day, matching the daily-send-hour cron.
export function londonToday(now: Date = new Date()): string {
  // en-CA yields YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function gbp(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

// Deterministic, key-free briefing assembled straight from the numbers. Used
// verbatim as the fallback, and handed to the model as the factual base.
function templatedNarrative(d: ChiefOfStaffData): string {
  const parts: string[] = []

  parts.push(
    `Memberships: ${d.memberships.active} active, ${d.memberships.pending} application${
      d.memberships.pending === 1 ? '' : 's'
    } awaiting a decision, and ${d.memberships.renewingIn30} renewing in the next 30 days.`,
  )

  parts.push(
    `Sales: ${gbp(d.pipeline.totalOpenPence)} of open pipeline — membership ${gbp(
      d.pipeline.byStream.membership,
    )}, sponsorship ${gbp(d.pipeline.byStream.sponsorship)}, concierge ${gbp(
      d.pipeline.byStream.concierge,
    )}, introductions ${gbp(d.pipeline.byStream.introductions)}, with ${gbp(
      d.pipeline.byStream.commission,
    )} of commission still to collect.`,
  )

  if (d.events.upcoming.length > 0) {
    const next = d.events.upcoming[0]
    parts.push(
      `Events: ${d.events.upcoming.length} coming up in the next fortnight — next is “${next.title}” on ${fmtDay(
        next.start_date,
      )} (${next.daysAway === 0 ? 'today' : `in ${next.daysAway} day${next.daysAway === 1 ? '' : 's'}`}). ${
        d.events.deadlinesThisWeek > 0
          ? `${d.events.deadlinesThisWeek} sponsor deliverable${
              d.events.deadlinesThisWeek === 1 ? ' is' : 's are'
            } due this week.`
          : 'No sponsor deliverables due this week.'
      }`,
    )
  } else {
    parts.push('Events: nothing in the next fortnight.')
  }

  if (d.team.overdueCount > 0) {
    const lead = d.team.overdueTasks
      .slice(0, 3)
      .map((t) => `${t.title} (${t.owner})`)
      .join('; ')
    parts.push(
      `Team: ${d.team.overdueCount} overdue task${d.team.overdueCount === 1 ? '' : 's'}${
        lead ? ` — ${lead}` : ''
      }.`,
    )
  } else {
    parts.push('Team: no overdue tasks — the board is clear.')
  }

  parts.push(
    `Finance: ${gbp(d.finance.debtorsPence)} outstanding across debtors (${
      d.finance.overdueInvoiceCount
    } invoice${d.finance.overdueInvoiceCount === 1 ? '' : 's'} overdue), MRR ${gbp(
      d.finance.mrrPence,
    )}. ${d.introductions.toFollowUp} introduction${
      d.introductions.toFollowUp === 1 ? '' : 's'
    } awaiting follow-up (${d.introductions.thisMonth} made this month).`,
  )

  const riskBits: string[] = []
  if (d.risks.membersAtRisk.length > 0) {
    riskBits.push(
      `${d.risks.membersAtRisk.length} member${
        d.risks.membersAtRisk.length === 1 ? '' : 's'
      } at risk (${d.risks.membersAtRisk.map((m) => `${m.name} ${m.churn}`).join(', ')})`,
    )
  }
  if (d.risks.sponsorAssetsMissing > 0)
    riskBits.push(`${d.risks.sponsorAssetsMissing} sponsor asset(s) still missing`)
  if (d.risks.accountantOverdue > 0)
    riskBits.push(`${d.risks.accountantOverdue} accountant task(s) overdue`)
  parts.push(riskBits.length > 0 ? `Risks: ${riskBits.join('; ')}.` : 'Risks: nothing flagged today.')

  return parts.join('\n\n')
}

const SYSTEM_PROMPT =
  "You are Sarah's chief of staff; write a crisp, warm, plain-English morning briefing highlighting only what needs her attention today, grouped: Memberships, Sales, Events, Team, Finance, Risks. British English. No fluff."

export async function generateChiefOfStaffReport(
  admin: Admin,
  opts: { userId?: string; now?: Date } = {},
): Promise<ChiefOfStaffReport> {
  const now = opts.now ?? new Date()
  const reportDate = londonToday(now)
  const data = await buildChiefOfStaffData(admin, now)

  const fallback = templatedNarrative(data)
  let narrative = ''

  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey) {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'
    const startedAt = performance.now()
    try {
      const openai = new OpenAI({ apiKey })
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.5,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Date: ${reportDate}. Here is today's structured business data as JSON (money is in pence):\n\n${JSON.stringify(
              data,
            )}\n\nWrite Sarah's morning briefing. Reference the specific figures. If a section has nothing noteworthy, keep it to one reassuring line.`,
          },
        ],
      })
      narrative = completion.choices[0]?.message?.content?.trim() ?? ''
      await logOpenAIUsage({
        feature: 'chief_of_staff',
        model,
        startedAt,
        usage: completion.usage,
        userId: opts.userId,
      })
    } catch (e) {
      console.error('[chief-of-staff] OpenAI failed, using fallback:', e)
      await logOpenAIUsage({
        feature: 'chief_of_staff',
        model,
        startedAt,
        error: e instanceof Error ? e.message : 'unknown',
        userId: opts.userId,
      })
    }
  }

  if (!narrative) narrative = fallback

  const { data: saved, error } = await admin
    .from('chief_of_staff_reports')
    .upsert(
      {
        report_date: reportDate,
        sections: data,
        narrative,
        generated_at: new Date().toISOString(),
        generated_by: opts.userId ?? null,
      },
      { onConflict: 'report_date' },
    )
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return saved as ChiefOfStaffReport
}
