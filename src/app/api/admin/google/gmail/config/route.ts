// GET/PUT /api/admin/google/gmail/config
//
// Admin control surface for the Gmail sync. GET returns the stored config
// (or safe defaults); PUT validates + persists it. Reads/writes app_settings
// key `gmail_sync_config` via the service role.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getSyncConfig,
  saveSyncConfig,
  type GmailSyncConfig,
  type SyncInbox,
} from '@/lib/google/sync-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createSupabaseAdminClient<Database>(
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
  return { admin: profile }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) {
    return Response.json({ error: auth.error }, { status: auth.status })
  }
  const config = await getSyncConfig(getAdminDb())
  return Response.json({ ok: true, config })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) {
    return Response.json({ error: auth.error }, { status: auth.status })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid config' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  if (typeof b.enabled !== 'boolean') {
    return Response.json({ error: '`enabled` must be a boolean' }, { status: 400 })
  }
  if (typeof b.noiseFilter !== 'boolean') {
    return Response.json({ error: '`noiseFilter` must be a boolean' }, { status: 400 })
  }
  if (typeof b.historyMonths !== 'number' || !Number.isFinite(b.historyMonths)) {
    return Response.json({ error: '`historyMonths` must be a number' }, { status: 400 })
  }
  if (!Array.isArray(b.inboxes)) {
    return Response.json({ error: '`inboxes` must be an array' }, { status: 400 })
  }

  const inboxes: SyncInbox[] = []
  for (const raw of b.inboxes) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return Response.json({ error: 'Each inbox must be an object' }, { status: 400 })
    }
    const i = raw as Record<string, unknown>
    if (typeof i.email !== 'string' || typeof i.label !== 'string' || typeof i.enabled !== 'boolean') {
      return Response.json(
        { error: 'Each inbox needs string email, string label, boolean enabled' },
        { status: 400 },
      )
    }
    inboxes.push({ email: i.email, label: i.label, enabled: i.enabled })
  }

  // Clamp history window to a sane 1..120 months.
  const historyMonths = Math.min(120, Math.max(1, Math.round(b.historyMonths)))

  const config: GmailSyncConfig = {
    enabled: b.enabled,
    inboxes,
    historyMonths,
    noiseFilter: b.noiseFilter,
  }

  await saveSyncConfig(getAdminDb(), config)
  return Response.json({ ok: true })
}
