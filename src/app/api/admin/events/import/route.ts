// POST /api/admin/events/import
//
// Bulk event import from Sarah's planning spreadsheet. The browser parses the
// workbook (see src/lib/events/import.ts) and posts structured rows, so this
// route never handles multipart — same shape as the contacts importer.
//
// TWO MODES, one body:
//   • dry_run: true  → PREVIEW. Says how many are new and how many were
//     already imported, and writes nothing.
//   • dry_run: false → COMMIT.
//
// Everything lands as status 'planning': visible to admins, invisible to
// members and the public (existing RLS only exposes published/live/completed),
// not bookable, and excluded from counts. Each row's cells are stored verbatim
// in planning_data for the admin to transcribe from; nothing is parsed into
// the bookable columns except a date cell Excel itself typed as a date.
//
// Re-uploading the same workbook is safe: the slug is the identity key, so
// rows already imported are skipped rather than duplicated.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import type { EventImportRow } from '@/lib/events/import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_ROWS = 2_000
const CHUNK = 100

const EVENT_TYPES = ['member_event', 'curated_luxury', 'retreat'] as const

interface RequestBody {
  rows?: EventImportRow[]
  dry_run?: boolean
  filename?: string
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
  return { profile }
}

function getServiceClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Keep only what we expect, so a hand-crafted payload can't set other columns. */
function clean(row: EventImportRow) {
  const title = String(row.title ?? '').trim().slice(0, 200)
  const slug = String(row.slug ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 200)
  if (!title || !slug) return null

  const planning: Record<string, string> = {}
  if (row.planning && typeof row.planning === 'object') {
    for (const [k, v] of Object.entries(row.planning)) {
      if (typeof v === 'string' && v.trim() !== '') planning[k] = v.slice(0, 8_000)
    }
  }

  const type = EVENT_TYPES.includes(row.event_type) ? row.event_type : 'member_event'

  // Only a genuine date survives; anything unparseable stays text in planning.
  let startDate: string | null = null
  if (row.start_date) {
    const d = new Date(row.start_date)
    if (!Number.isNaN(d.getTime())) startDate = d.toISOString()
  }

  return {
    title,
    slug,
    event_type: type,
    start_date: startDate,
    planning: {
      ...planning,
      source_sheet: typeof row.sheet === 'string' ? row.sheet : null,
      source_section: typeof row.section === 'string' ? row.section : null,
    } as Record<string, string | null>,
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return json({ error: auth.error }, auth.status)

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }

  const incoming = Array.isArray(body.rows) ? body.rows : []
  if (incoming.length === 0) return json({ error: 'No rows to import.' }, 400)
  if (incoming.length > MAX_ROWS) {
    return json({ error: `That file has ${incoming.length} rows — the limit is ${MAX_ROWS}.` }, 400)
  }

  const cleaned = incoming.map(clean)
  const rows = cleaned.filter((r): r is NonNullable<typeof r> => r !== null)
  const invalid = cleaned.length - rows.length

  const svc = getServiceClient()

  // Which slugs already exist? Those rows were imported (or hand-made) before,
  // so they are skipped rather than duplicated or overwritten — an admin may
  // already have filled in the real venue and date on them.
  const slugs = rows.map((r) => r.slug)
  const existing = new Set<string>()
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const { data, error } = await svc
      .from('events')
      .select('slug')
      .in('slug', slugs.slice(i, i + CHUNK))
    if (error) return json({ error: `Could not check existing events: ${error.message}` }, 500)
    for (const e of data ?? []) existing.add(e.slug as string)
  }

  const toInsert = rows.filter((r) => !existing.has(r.slug))
  const skippedExisting = rows.length - toInsert.length

  const summary = {
    total_rows: incoming.length,
    invalid,
    to_create: toInsert.length,
    already_imported: skippedExisting,
    sample: toInsert.slice(0, 8).map((r) => ({
      title: r.title,
      sheet: (r.planning.source_sheet as string) ?? null,
      date: r.planning.date ?? null,
      location: r.planning.location ?? null,
    })),
  }

  if (body.dry_run !== false) return json(summary)

  const now = new Date().toISOString()
  let created = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK).map((r) => ({
      title: r.title,
      slug: r.slug,
      event_type: r.event_type,
      status: 'planning' as const,
      start_date: r.start_date,
      planning_data: r.planning,
      import_source: 'import',
      imported_at: now,
      created_by: auth.profile.id,
    }))
    const { error, count } = await svc
      .from('events')
      .insert(chunk, { count: 'exact' })
    if (error) {
      return json(
        { error: `Import stopped after ${created} events: ${error.message}`, created },
        500,
      )
    }
    created += count ?? chunk.length
  }

  return json({ ...summary, created })
}
