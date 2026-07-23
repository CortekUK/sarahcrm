// POST /api/admin/scorecards/summary
//
// Generates (or regenerates) a staff member's Friday weekly-scorecard summary
// for a given week. Admin-only. Computes the authoritative actuals server-side
// — manual actuals from scorecard_targets.manual_actual, tasks_completed from
// accountability_tasks marked done in the week, hours_logged from time_entries
// in the week — derives a performance score (% of targets met), asks OpenAI for
// a short narrative (reusing the repo's OpenAI setup — new OpenAI({apiKey}),
// OPENAI_MODEL || gpt-4o, chat.completions), and upserts scorecard_summaries.
//
// Falls back to a templated narrative if OpenAI is unavailable.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  computeScore,
  actualForTarget,
  isTargetMet,
  tasksCompletedInWeek,
  hoursLoggedInWeek,
  formatWeekRange,
  SCORECARD_SOURCE_META,
  type ScorecardTargetRow,
  type ScorecardSource,
} from '@/lib/scorecards'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  staff_id?: string
  week_start?: string
}

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only.', status: 403 as const }
  }
  return { adminId: profile.id }
}

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.staff_id) return Response.json({ error: 'staff_id is required' }, { status: 400 })
    if (!body.week_start || !WEEK_RE.test(body.week_start)) {
      return Response.json({ error: 'week_start (YYYY-MM-DD) is required' }, { status: 400 })
    }
    const staffId = body.staff_id
    const weekStart = body.week_start

    const admin = getAdmin()

    const [targetsRes, staffRes, tasksRes, entriesRes] = await Promise.all([
      admin
        .from('scorecard_targets')
        .select('*')
        .eq('staff_id', staffId)
        .eq('week_start', weekStart),
      admin.from('profiles').select('first_name, last_name').eq('id', staffId).single(),
      admin
        .from('accountability_tasks')
        .select('status, updated_at')
        .eq('owner_id', staffId),
      admin.from('time_entries').select('hours, entry_date').eq('staff_id', staffId),
    ])

    if (targetsRes.error) {
      return Response.json({ error: targetsRes.error.message }, { status: 500 })
    }
    const targets = (targetsRes.data ?? []) as ScorecardTargetRow[]
    if (targets.length === 0) {
      return Response.json(
        { error: 'No targets set for this staff member and week. Add targets first.' },
        { status: 400 },
      )
    }

    const auto = {
      tasksCompleted: tasksCompletedInWeek(tasksRes.data ?? [], weekStart),
      hoursLogged: hoursLoggedInWeek(entriesRes.data ?? [], weekStart),
    }
    const { met, total, score } = computeScore(targets, auto)

    const staffName =
      `${staffRes.data?.first_name ?? ''} ${staffRes.data?.last_name ?? ''}`.trim() ||
      'the team member'
    const weekLabel = formatWeekRange(weekStart)

    // Structured per-target lines for the model / fallback.
    const lines = targets.map((t) => {
      const actual = actualForTarget(t, auto)
      const metFlag = isTargetMet(t, auto)
      const srcLabel = SCORECARD_SOURCE_META[t.source as ScorecardSource]?.label ?? t.source
      return `- ${t.label}: ${actual} / ${Number(t.target_value)} (${srcLabel}) — ${
        metFlag ? 'MET' : 'not yet met'
      }`
    })

    const outstanding = targets
      .filter((t) => !isTargetMet(t, auto))
      .map((t) => t.label)

    let narrative = ''
    const apiKey = process.env.OPENAI_API_KEY
    if (apiKey) {
      try {
        const openai = new OpenAI({ apiKey })
        const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'
        const completion = await openai.chat.completions.create({
          model,
          temperature: 0.5,
          messages: [
            {
              role: 'system',
              content:
                "You write for The Club by Sarah Restrick, a private members' business club. Voice: warm, direct, British English — a manager giving a short, honest weekly check-in to a team member. You are writing a WEEKLY SCORECARD SUMMARY. Return 2 short paragraphs of plain prose (no headings, no lists, no greeting, no sign-off). Acknowledge what was hit, name what's still outstanding plainly but kindly, and close with a clear focus for next week. Do not invent numbers beyond those provided.",
            },
            {
              role: 'user',
              content: `Team member: ${staffName}\nWeek: ${weekLabel}\nTargets met: ${met} of ${total} (performance score ${score}%).\n\nTargets:\n${lines.join(
                '\n',
              )}\n\nWrite the weekly scorecard summary.`,
            },
          ],
        })
        narrative = completion.choices[0]?.message?.content?.trim() ?? ''
      } catch (e) {
        console.error('[scorecards/summary] OpenAI failed, using fallback:', e)
      }
    }

    if (!narrative) {
      const hitLine =
        met === total
          ? `${staffName} hit every target this week — a clean ${score}%.`
          : met === 0
            ? `${staffName} did not hit any of the ${total} targets this week (score ${score}%).`
            : `${staffName} met ${met} of ${total} targets this week (score ${score}%).`
      const nextLine =
        outstanding.length > 0
          ? `Still outstanding: ${outstanding.join(', ')}. Worth making these the focus for next week.`
          : `A strong week — the focus now is to keep the momentum going.`
      narrative = `${hitLine} ${nextLine}`
    }

    const { data: saved, error: upErr } = await admin
      .from('scorecard_summaries')
      .upsert(
        {
          staff_id: staffId,
          week_start: weekStart,
          performance_score: score,
          targets_met: met,
          targets_total: total,
          narrative,
          generated_at: new Date().toISOString(),
          generated_by: auth.adminId,
        },
        { onConflict: 'staff_id,week_start' },
      )
      .select('*')
      .single()

    if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

    return Response.json({ ok: true, summary: saved })
  } catch (e) {
    console.error('[scorecards/summary] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
