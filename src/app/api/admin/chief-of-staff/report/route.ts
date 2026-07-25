// /api/admin/chief-of-staff/report
//
// The AI Chief of Staff daily briefing.
//   • POST — (re)generate today's briefing: aggregate the whole business,
//     ask OpenAI for a warm plain-English narrative (deterministic fallback
//     when there's no key / on error), upsert one row per date. Shares the
//     ONE generate implementation with the daily cron flow
//     (src/lib/chief-of-staff/generate.ts).
//   • GET  — read today's briefing (or the latest, or ?date=YYYY-MM-DD).
//
// Admin-only, mirroring the handover/report auth pattern.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generateChiefOfStaffReport, londonToday } from '@/lib/chief-of-staff/generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

export async function POST() {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    const admin = getAdmin()
    const report = await generateChiefOfStaffReport(admin, { userId: auth.adminId })
    return Response.json({ ok: true, report })
  } catch (e) {
    console.error('[chief-of-staff/report] POST failed:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    const admin = getAdmin()
    const url = new URL(req.url)
    const date = url.searchParams.get('date')

    if (date) {
      if (!DATE_RE.test(date)) {
        return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
      }
      const { data } = await admin
        .from('chief_of_staff_reports')
        .select('*')
        .eq('report_date', date)
        .maybeSingle()
      return Response.json({ report: data ?? null })
    }

    // Today's report, else the most recent one.
    const today = londonToday()
    const { data: todayRow } = await admin
      .from('chief_of_staff_reports')
      .select('*')
      .eq('report_date', today)
      .maybeSingle()
    if (todayRow) return Response.json({ report: todayRow })

    const { data: latest } = await admin
      .from('chief_of_staff_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    return Response.json({ report: latest ?? null })
  } catch (e) {
    console.error('[chief-of-staff/report] GET failed:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
