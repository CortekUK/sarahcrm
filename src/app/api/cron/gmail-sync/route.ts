// GET/POST /api/cron/gmail-sync
//
// Incrementally syncs the configured inboxes into public.gmail_messages so
// every contact gets an email history. Two ways to call it, same as
// /api/cron/automations:
//   1. Vercel Cron — `Authorization: Bearer <CRON_SECRET>`.
//   2. An admin (session-authenticated) from the CRM.
//
// Config-gated: the set of inboxes + the master switch live in app_settings
// key `gmail_sync_config` (see lib/google/sync-config). While the master
// switch is off — or no inbox is enabled — this route reads NO inbox and
// returns { skipped: true }. Per-inbox cursors + the fetch→upsert engine live
// in lib/google/sync-core (reused by the backfill module).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getGoogleConfig } from '@/lib/google/client'
import { getSyncConfig } from '@/lib/google/sync-config'
import { syncInboxIncremental } from '@/lib/google/sync-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminDb() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
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
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const viaCron = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`
  const viaAdmin = viaCron ? false : await isAdmin()
  if (!viaCron && !viaAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cfg = getGoogleConfig()
  if (!cfg) {
    return NextResponse.json({ error: 'Google integration not configured.' }, { status: 503 })
  }

  const db = getAdminDb()

  try {
    // Config gate: stay completely dormant while disabled — read no inbox.
    const config = await getSyncConfig(db)
    const enabledInboxes = config.inboxes.filter((i) => i.enabled)
    if (!config.enabled || enabledInboxes.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'sync disabled' })
    }

    // Sync each enabled inbox and aggregate the counts.
    let fetched = 0
    let upserted = 0
    let matched = 0
    for (const inbox of enabledInboxes) {
      const res = await syncInboxIncremental(db, inbox.email, { noiseFilter: config.noiseFilter })
      fetched += res.fetched
      upserted += res.upserted
      matched += res.matched
    }

    return NextResponse.json({
      ok: true,
      triggeredBy: viaCron ? 'cron' : 'admin',
      inboxes: enabledInboxes.length,
      fetched,
      upserted,
      matched,
    })
  } catch (e) {
    console.error('[cron/gmail-sync] failed:', e)
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
