// GET/POST /api/cron/automations
//
// The daily heartbeat for the automated email flows. Two ways to call it:
//   1. Vercel Cron (scheduled) — sends `Authorization: Bearer <CRON_SECRET>`
//      automatically when CRON_SECRET is set. Runs for real (sends email).
//   2. An admin from the Automations page — authenticated by session.
//      Pass `?dryRun=true` to PREVIEW (see who would be emailed, send
//      nothing).
//
// Always idempotent: each flow skips anyone already handled, so running it
// twice in a day is safe.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { runAllAutomations } from '@/lib/automations/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// The Vercel cron runs hourly; the real batch should only fire once a day, at
// the admin-configured UK send-hour (Settings → Automation Send Time). Returns
// true when "now" (Europe/London) matches that hour.
async function isSendHourNow(): Promise<{ ok: boolean; configuredHour: number; ukHour: number }> {
  let configuredHour = 7
  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'daily_send_hour')
      .maybeSingle()
    const v = data?.value
    if (typeof v === 'number') configuredHour = v
    else if (typeof v === 'string' && v.trim() !== '') configuredHour = Number(v)
  } catch {
    // Fall back to the 07:00 default on any read failure.
  }
  const ukHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  ) % 24
  return { ok: ukHour === configuredHour, configuredHour, ukHour }
}

async function isAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    return profile?.role === 'admin'
  } catch {
    return false
  }
}

async function handle(req: NextRequest) {
  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === 'true'

  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const viaCron = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`
  const viaAdmin = viaCron ? false : await isAdmin()

  if (!viaCron && !viaAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Hourly cron, daily work: skip unless it's the configured UK send-hour.
  // Admin-triggered runs (and dry-runs) always proceed.
  if (viaCron && !dryRun) {
    const { ok, configuredHour, ukHour } = await isSendHourNow()
    if (!ok) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: `Not the send hour (UK ${ukHour}:00, configured ${configuredHour}:00).`,
      })
    }
  }

  try {
    const result = await runAllAutomations(dryRun)
    return NextResponse.json({ ok: true, triggeredBy: viaCron ? 'cron' : 'admin', ...result })
  } catch (e) {
    console.error('[cron/automations] failed:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}
