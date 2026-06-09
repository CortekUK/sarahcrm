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
import { runAllAutomations } from '@/lib/automations/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
