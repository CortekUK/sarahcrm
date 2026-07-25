// GET/POST /api/cron/gmail-backfill
//
// Resumable historical backfill: pages each enabled inbox back to
// `historyMonths` months and stores + matches the messages into
// public.gmail_messages, reusing the same fetch→parse→match→upsert engine as
// the incremental sync (lib/google/sync-core#processMessageIds). Unlike the
// live sync, this deliberately does NO AI extraction — it only stores +
// matches, to keep cost low.
//
// Auth + guards are identical to /api/cron/gmail-sync:
//   1. Vercel Cron — `Authorization: Bearer <CRON_SECRET>`.
//   2. An admin (session-authenticated) from the CRM.
//
// Config-gated: shares the `gmail_sync_config` master switch + inbox list. While
// disabled — or no inbox is enabled — this route reads NO inbox and returns
// { skipped: true }. Per-inbox progress (Gmail list pageToken + a done flag)
// lives in app_settings key `gmail_backfill_state`, so a run that hits the time
// budget resumes exactly where it left off on the next cron tick. Once every
// enabled inbox is done the route self-no-ops.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getGoogleConfig, gmailClient } from '@/lib/google/client'
import { getSyncConfig } from '@/lib/google/sync-config'
import { processMessageIds } from '@/lib/google/sync-core'
import { listMessageIdsByQuery } from '@/lib/google/gmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Db = SupabaseClient<Database>

// Rough per-invocation message budget. Keeps a single cron run well under
// maxDuration; state is persisted after each page so the remainder resumes next
// tick.
const RUN_BUDGET = 200

const BACKFILL_STATE_KEY = 'gmail_backfill_state'

interface InboxBackfillState {
  pageToken?: string
  done: boolean
}
type BackfillState = Record<string, InboxBackfillState>

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

// Read the whole backfill-state map (defensively — never throws on bad data).
async function loadBackfillState(db: Db): Promise<BackfillState> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', BACKFILL_STATE_KEY)
    .maybeSingle()
  const v = data?.value
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: BackfillState = {}
  for (const [mailbox, s] of Object.entries(v as Record<string, unknown>)) {
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      const rec = s as Record<string, unknown>
      out[mailbox] = {
        pageToken: typeof rec.pageToken === 'string' ? rec.pageToken : undefined,
        done: rec.done === true,
      }
    }
  }
  return out
}

// Read-modify-write a single mailbox's state, preserving every other mailbox's
// entry (progress must survive between runs).
async function saveInboxState(
  db: Db,
  mailbox: string,
  next: InboxBackfillState,
): Promise<void> {
  const state = await loadBackfillState(db)
  state[mailbox] = next
  await db
    .from('app_settings')
    .upsert(
      {
        key: BACKFILL_STATE_KEY,
        value: state as unknown as Database['public']['Tables']['app_settings']['Insert']['value'],
      },
      { onConflict: 'key' },
    )
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

    const q = `newer_than:${config.historyMonths * 30}d`
    const state = await loadBackfillState(db)

    // All enabled inboxes already backfilled → self-no-op.
    if (enabledInboxes.every((i) => state[i.email]?.done)) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'backfill complete' })
    }

    let budget = RUN_BUDGET
    let processed = 0
    const perInbox: Record<string, { processed: number; done: boolean }> = {}

    for (const inbox of enabledInboxes) {
      if (budget <= 0) break
      const current = state[inbox.email] ?? { done: false }
      if (current.done) continue

      const gmail = gmailClient({ subject: inbox.email })

      // Page this inbox until the run budget is exhausted or it's exhausted.
      let pageToken = current.pageToken
      let inboxProcessed = 0
      let done = false
      while (budget > 0) {
        const { ids, nextPageToken } = await listMessageIdsByQuery(gmail, q, pageToken)
        if (ids.length) {
          await processMessageIds(db, gmail, inbox.email, ids, { noiseFilter: config.noiseFilter })
          inboxProcessed += ids.length
          processed += ids.length
          budget -= ids.length
        }

        pageToken = nextPageToken
        done = !nextPageToken

        // Persist progress after EACH page so a mid-run timeout resumes cleanly.
        await saveInboxState(db, inbox.email, { pageToken: nextPageToken, done })
        state[inbox.email] = { pageToken: nextPageToken, done }

        if (done) break
      }

      perInbox[inbox.email] = { processed: inboxProcessed, done }
    }

    return NextResponse.json({
      ok: true,
      triggeredBy: viaCron ? 'cron' : 'admin',
      processed,
      perInbox,
    })
  } catch (e) {
    console.error('[cron/gmail-backfill] failed:', e)
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
