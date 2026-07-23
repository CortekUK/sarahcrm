// POST /api/admin/handover/report
//
// Generates (or regenerates) "Sarah's Daily Leadership Report" for a given
// date. Admin-only. Reads every active staff member's handover for the date
// (service-role, server-side authority), asks OpenAI for one concise
// leadership narrative (reusing the repo's OpenAI setup — new OpenAI({apiKey}),
// OPENAI_MODEL || gpt-4o, chat.completions), and upserts daily_reports.
//
// Falls back to a templated narrative if OpenAI is unavailable.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  HANDOVER_FIELDS,
  handoverHasContent,
  formatHandoverDate,
  type DailyHandoverRow,
} from '@/lib/handover'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  report_date?: string
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function personName(p: { first_name?: string | null; last_name?: string | null }): string {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'A team member'
}

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
    if (!body.report_date || !DATE_RE.test(body.report_date)) {
      return Response.json({ error: 'report_date (YYYY-MM-DD) is required' }, { status: 400 })
    }
    const reportDate = body.report_date

    const admin = getAdmin()

    const [staffRes, handoversRes] = await Promise.all([
      admin
        .from('profiles')
        .select('id, first_name, last_name')
        .in('role', ['team_member', 'freelancer'])
        .eq('staff_status', 'active'),
      admin.from('daily_handovers').select('*').eq('handover_date', reportDate),
    ])

    if (staffRes.error) return Response.json({ error: staffRes.error.message }, { status: 500 })
    if (handoversRes.error) {
      return Response.json({ error: handoversRes.error.message }, { status: 500 })
    }

    const staff = staffRes.data ?? []
    const handovers = (handoversRes.data ?? []) as DailyHandoverRow[]
    const byStaff = new Map(handovers.map((h) => [h.staff_id, h]))
    const nameById = new Map(staff.map((s) => [s.id, personName(s)]))

    const staffTotal = staff.length
    // Count only handovers that actually have content.
    const submitted = staff.filter((s) => handoverHasContent(byStaff.get(s.id)))
    const submittedCount = submitted.length
    const notSubmitted = staff
      .filter((s) => !handoverHasContent(byStaff.get(s.id)))
      .map((s) => nameById.get(s.id) ?? 'A team member')

    if (submittedCount === 0) {
      return Response.json(
        { error: 'No handovers submitted for this date yet. Nothing to summarise.' },
        { status: 400 },
      )
    }

    const dateLabel = formatHandoverDate(reportDate)

    // Structured per-person block for the model / fallback.
    const blocks = submitted.map((s) => {
      const h = byStaff.get(s.id)!
      const lines = HANDOVER_FIELDS.map((f) => {
        const val = (h[f.key] ?? '').trim()
        return `  ${f.label}: ${val || '—'}`
      })
      return `${nameById.get(s.id)}:\n${lines.join('\n')}`
    })

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
                "You write for The Club by Sarah Restrick, a private members' business club. You are preparing SARAH'S DAILY LEADERSHIP REPORT — a concise end-of-day briefing for Sarah, the owner, condensing her team's individual handovers into one clear narrative. Voice: warm, direct, British English. Return plain prose (no greeting, no sign-off). Structure it into short paragraphs covering: what the team collectively moved forward today; what's in flight for tomorrow; and — most importantly — anything BLOCKED or where SUPPORT is needed that Sarah should act on, naming the person. Be concise and factual. Do not invent anything beyond what's provided.",
            },
            {
              role: 'user',
              content: `Date: ${dateLabel}\nHandovers submitted: ${submittedCount} of ${staffTotal}.${
                notSubmitted.length > 0
                  ? `\nNot yet submitted: ${notSubmitted.join(', ')}.`
                  : ''
              }\n\nTeam handovers:\n\n${blocks.join(
                '\n\n',
              )}\n\nWrite Sarah's daily leadership report.`,
            },
          ],
        })
        narrative = completion.choices[0]?.message?.content?.trim() ?? ''
      } catch (e) {
        console.error('[handover/report] OpenAI failed, using fallback:', e)
      }
    }

    if (!narrative) {
      // Templated fallback.
      const parts: string[] = []
      parts.push(
        `Daily leadership report for ${dateLabel}. ${submittedCount} of ${staffTotal} handovers submitted.`,
      )
      const blockedItems = submitted
        .map((s) => ({ name: nameById.get(s.id)!, blocked: (byStaff.get(s.id)!.blocked ?? '').trim() }))
        .filter((x) => x.blocked !== '')
      const supportItems = submitted
        .map((s) => ({
          name: nameById.get(s.id)!,
          support: (byStaff.get(s.id)!.support_needed ?? '').trim(),
        }))
        .filter((x) => x.support !== '')
      if (blockedItems.length > 0) {
        parts.push(
          'Blockers: ' +
            blockedItems.map((x) => `${x.name} — ${x.blocked}`).join('; ') +
            '.',
        )
      } else {
        parts.push('No blockers were reported.')
      }
      if (supportItems.length > 0) {
        parts.push(
          'Support needed: ' +
            supportItems.map((x) => `${x.name} — ${x.support}`).join('; ') +
            '.',
        )
      }
      if (notSubmitted.length > 0) {
        parts.push(`Still to submit: ${notSubmitted.join(', ')}.`)
      }
      narrative = parts.join('\n\n')
    }

    const { data: saved, error: upErr } = await admin
      .from('daily_reports')
      .upsert(
        {
          report_date: reportDate,
          narrative,
          submitted_count: submittedCount,
          staff_total: staffTotal,
          generated_at: new Date().toISOString(),
          generated_by: auth.adminId,
        },
        { onConflict: 'report_date' },
      )
      .select('*')
      .single()

    if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

    return Response.json({ ok: true, report: saved })
  } catch (e) {
    console.error('[handover/report] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
