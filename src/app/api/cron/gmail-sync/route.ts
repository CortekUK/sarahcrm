// GET/POST /api/cron/gmail-sync
//
// Incrementally syncs the connected inbox (GOOGLE_WORKSPACE_SUBJECT — Sarah's)
// into public.gmail_messages so every contact gets an email history. Two ways
// to call it, same as /api/cron/automations:
//   1. Vercel Cron — `Authorization: Bearer <CRON_SECRET>`.
//   2. An admin (session-authenticated) from the CRM.
//
// Idempotent: messages upsert on gmail_message_id. A cursor (Gmail historyId)
// is persisted in app_settings key `gmail_sync_state`. First run (no cursor)
// seeds from the most recent messages; if the stored historyId is too old,
// Gmail returns 404 and we re-seed.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getGoogleConfig, gmailClient } from '@/lib/google/client'
import {
  getMessage,
  getStartHistoryId,
  listAddedSince,
  listRecentMessageIds,
  type ParsedMessage,
} from '@/lib/google/gmail'
import { resolveMembersByEmail } from '@/lib/google/match'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SEED_LIMIT = 150 // messages fetched on first run
const BATCH_CAP = 200 // safety cap per run

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

type Db = ReturnType<typeof getAdminDb>

async function loadHistoryId(db: Db): Promise<string | null> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'gmail_sync_state')
    .maybeSingle()
  const v = data?.value as { historyId?: string } | null
  return v?.historyId ?? null
}

async function saveHistoryId(db: Db, historyId: string): Promise<void> {
  await db
    .from('app_settings')
    .upsert({ key: 'gmail_sync_state', value: { historyId } }, { onConflict: 'key' })
}

// Given the impersonated mailbox address, work out the counterpart (the other
// party) and the direction of the message.
function classify(msg: ParsedMessage, mailbox: string): { direction: 'inbound' | 'outbound'; counterpart: string | null } {
  const me = mailbox.toLowerCase()
  const outbound = msg.fromEmail === me
  if (outbound) {
    const counterpart = msg.to.find((t) => t !== me) ?? msg.to[0] ?? null
    return { direction: 'outbound', counterpart }
  }
  return { direction: 'inbound', counterpart: msg.fromEmail || null }
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
  const gmail = gmailClient() // read-only, impersonates the configured subject

  try {
    // 1. Determine which message ids to fetch.
    const cursor = await loadHistoryId(db)
    let ids: string[]
    let reseeded = false
    if (!cursor) {
      ids = await listRecentMessageIds(gmail, SEED_LIMIT)
      reseeded = true
    } else {
      const res = await listAddedSince(gmail, cursor)
      if (res.expired) {
        ids = await listRecentMessageIds(gmail, SEED_LIMIT)
        reseeded = true
      } else {
        ids = res.ids
      }
    }
    ids = ids.slice(0, BATCH_CAP)

    // 2. Fetch + parse each message.
    const parsed: ParsedMessage[] = []
    for (const id of ids) {
      try {
        parsed.push(await getMessage(gmail, id))
      } catch {
        /* skip individual failures */
      }
    }

    // 3. Resolve counterparts → members in one batch.
    const classified = parsed.map((m) => ({ msg: m, ...classify(m, cfg.subject) }))
    const counterparts = classified.map((c) => c.counterpart).filter((e): e is string => Boolean(e))
    const memberByEmail = await resolveMembersByEmail(db, counterparts)

    // 4. Upsert rows (idempotent on gmail_message_id).
    let matched = 0
    const rows = classified.map(({ msg, direction, counterpart }) => {
      const memberId = counterpart ? memberByEmail.get(counterpart) ?? null : null
      if (memberId) matched++
      return {
        gmail_message_id: msg.id,
        gmail_thread_id: msg.threadId,
        direction,
        from_email: msg.fromEmail || null,
        to_emails: msg.to,
        counterpart_email: counterpart,
        subject: msg.subject,
        snippet: msg.snippet,
        body_text: msg.bodyText,
        internal_date: msg.internalDate,
        member_id: memberId,
      }
    })
    if (rows.length) {
      await db.from('gmail_messages').upsert(rows, { onConflict: 'gmail_message_id' })
    }

    // 5. Advance the cursor to the mailbox's current historyId.
    const latest = await getStartHistoryId(gmail)
    if (latest) await saveHistoryId(db, latest)

    return NextResponse.json({
      ok: true,
      triggeredBy: viaCron ? 'cron' : 'admin',
      reseeded,
      fetched: parsed.length,
      upserted: rows.length,
      matched,
      unmatched: rows.length - matched,
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
