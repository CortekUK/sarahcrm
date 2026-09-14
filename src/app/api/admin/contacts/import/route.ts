// POST /api/admin/contacts/import
//
// Bulk contact import. The browser parses the CSV (see src/lib/contacts/csv.ts)
// and posts already-structured rows, so this route never handles multipart.
//
// TWO MODES, one body shape:
//   • dry_run: true  → PREVIEW. Computes "X new, Y updated, Z unchanged"
//     without writing anything. The modal always previews before committing.
//   • dry_run: false → COMMIT. Applies the merge and records a contact_imports
//     audit row.
//
// THE MERGE RULE (the important part — agreed with the client)
//   Identity is lower(email).
//     1. Email not seen before          → insert.
//     2. Email already stored           → merge field by field:
//          • incoming has a value, stored is empty → fill it in   (enrichment)
//          • incoming has a value, stored has one  → incoming wins (fresher)
//          • incoming is BLANK, stored has a value → KEEP THE STORED VALUE.
//   That last line is why one generic upload handles both source files: the
//   thin 11k export loads everyone in, and a later Clay export uploaded over
//   the top only fills/updates the company fields. Uploading a thinner file
//   can never erase data.
//
// Admin only. Writes through the service-role client (the contacts tables are
// deliberately absent from src/types/database.ts), after the role check.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { SECTOR_KEYS, UNSEGMENTED } from '@/lib/contacts/sectors'
import type { ContactRow } from '@/lib/contacts/csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 11k rows in one upload — well past the 10s default.
export const maxDuration = 60

// Guard against a single request trying to carry an unbounded payload.
const MAX_ROWS = 50_000
// Postgres accepts large upserts, but chunking keeps each statement sane and
// lets a partial failure report progress instead of losing everything.
const CHUNK = 500
// Emails per `.in()` lookup. Kept small because the filter travels in the URL.
const EMAIL_LOOKUP_CHUNK = 100
// Above this many incoming rows, page the table instead of looking rows up by
// email — fewer round trips, and it can't build an over-long URL.
const LOOKUP_BY_EMAIL_MAX = 1_000
// Rows per page when reading the whole table.
const PAGE = 1_000

interface RequestBody {
  rows?: ContactRow[]
  dry_run?: boolean
  filename?: string
}

// Columns the merge considers. `email` is the key and never merged; sector is
// derived, so it's handled separately below.
const MERGE_FIELDS = [
  'first_name',
  'last_name',
  'company_name',
  'job_title',
  'website',
  'industry_raw',
  'employee_count',
  'company_size',
  'linkedin_url',
  'phone',
  'city',
  'location',
  'source',
] as const

type MergeField = (typeof MERGE_FIELDS)[number]

interface StoredContact {
  id: string
  email: string
  sector: string
  groups: string[] | null
  email_subscribed: boolean
  sms_subscribed: boolean
  is_member_flag: boolean
  [key: string]: unknown
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

/** A value counts as "present" only if it isn't null/undefined/blank. */
function has(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}

/**
 * Apply the merge rule to one pair. Returns the fields that would actually
 * change — an empty object means the row is unchanged, which is what lets the
 * preview report an honest "unchanged" count.
 */
function mergeInto(stored: StoredContact, incoming: ContactRow): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  for (const f of MERGE_FIELDS) {
    const next = incoming[f as keyof ContactRow]
    // Blank incoming never overwrites — this is the whole safety guarantee.
    if (!has(next)) continue
    if (stored[f] === next) continue
    patch[f] = next
  }

  // Sector is derived, so only upgrade it. Never downgrade a real sector back
  // to Unsegmented because this particular file had no industry column.
  if (incoming.sector && incoming.sector !== UNSEGMENTED && incoming.sector !== stored.sector) {
    patch.sector = incoming.sector
  }

  // Groups are additive — a new upload shouldn't drop tags an earlier one set.
  if (incoming.groups.length > 0) {
    const merged = Array.from(new Set([...(stored.groups ?? []), ...incoming.groups]))
    if (merged.length !== (stored.groups ?? []).length) patch.groups = merged
  }

  // Consent is one-way: once someone has opted out, no upload may re-subscribe
  // them. Only an explicit opt-out can flip these to false.
  if (stored.email_subscribed && !incoming.email_subscribed) {
    patch.email_subscribed = false
    patch.unsubscribed_at = new Date().toISOString()
  }
  if (stored.sms_subscribed && !incoming.sms_subscribed) patch.sms_subscribed = false

  // The member flag only ever turns on.
  if (incoming.is_member_flag && !stored.is_member_flag) patch.is_member_flag = true

  return patch
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const rows = body.rows ?? []
  const dryRun = body.dry_run !== false // default to preview — never write by accident

  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json({ error: 'No rows to import.' }, { status: 400 })
  }
  if (rows.length > MAX_ROWS) {
    return Response.json(
      { error: `Too many rows (${rows.length}). Split the file — the limit is ${MAX_ROWS}.` },
      { status: 400 },
    )
  }

  const admin = getServiceClient()

  // ── De-duplicate within the upload itself ────────────────────
  // A source file can list the same person twice; merge those before touching
  // the database so the counts are truthful and the upsert can't self-conflict.
  const byEmail = new Map<string, ContactRow>()
  let invalidRows = 0
  for (const r of rows) {
    const email = (r?.email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      invalidRows++
      continue
    }
    const sector = SECTOR_KEYS.includes(r.sector) ? r.sector : UNSEGMENTED
    const clean: ContactRow = { ...r, email, sector, groups: r.groups ?? [] }
    const prior = byEmail.get(email)
    if (!prior) {
      byEmail.set(email, clean)
    } else {
      // Same rule as the DB merge: fill blanks, don't erase.
      const merged = { ...prior }
      for (const f of MERGE_FIELDS) {
        const next = clean[f as keyof ContactRow]
        if (has(next)) (merged as Record<string, unknown>)[f] = next
      }
      if (clean.sector !== UNSEGMENTED) merged.sector = clean.sector
      merged.groups = Array.from(new Set([...prior.groups, ...clean.groups]))
      merged.email_subscribed = prior.email_subscribed && clean.email_subscribed
      merged.sms_subscribed = prior.sms_subscribed && clean.sms_subscribed
      merged.is_member_flag = prior.is_member_flag || clean.is_member_flag
      byEmail.set(email, merged)
    }
  }

  const incoming = [...byEmail.values()]
  const emails = incoming.map((r) => r.email)

  // ── Load whatever is already stored for these emails ─────────
  // supabase-js compiles `.in()` into the GET query string, so a few hundred
  // addresses blow past the URL length limit and the request dies as an
  // opaque "fetch failed". Small uploads therefore look people up in modest
  // batches; large ones page the table instead, which is also far cheaper
  // than several hundred round trips.
  const stored = new Map<string, StoredContact>()
  const SELECT_COLS =
    'id, email, sector, groups, email_subscribed, sms_subscribed, is_member_flag, ' +
    MERGE_FIELDS.join(', ')

  if (emails.length <= LOOKUP_BY_EMAIL_MAX) {
    for (let i = 0; i < emails.length; i += EMAIL_LOOKUP_CHUNK) {
      const slice = emails.slice(i, i + EMAIL_LOOKUP_CHUNK)
      const { data, error } = await admin.from('contacts').select(SELECT_COLS).in('email', slice)
      if (error) {
        console.error('[contacts/import] lookup failed', error)
        return Response.json({ error: `Lookup failed: ${error.message}` }, { status: 500 })
      }
      for (const row of (data ?? []) as unknown as StoredContact[]) {
        stored.set(row.email.toLowerCase(), row)
      }
    }
  } else {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from('contacts')
        .select(SELECT_COLS)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) {
        console.error('[contacts/import] page failed', error)
        return Response.json({ error: `Lookup failed: ${error.message}` }, { status: 500 })
      }
      for (const row of (data ?? []) as unknown as StoredContact[]) {
        stored.set(row.email.toLowerCase(), row)
      }
      if (!data || data.length < PAGE) break
    }
  }

  // ── Classify every incoming row ──────────────────────────────
  const toInsert: ContactRow[] = []
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = []
  let unchanged = 0

  for (const row of incoming) {
    const existing = stored.get(row.email)
    if (!existing) {
      toInsert.push(row)
      continue
    }
    const patch = mergeInto(existing, row)
    if (Object.keys(patch).length === 0) unchanged++
    else toUpdate.push({ id: existing.id, patch })
  }

  const summary = {
    total_rows: rows.length,
    unique_rows: incoming.length,
    inserted: toInsert.length,
    updated: toUpdate.length,
    unchanged,
    invalid: invalidRows,
  }

  // ── Preview stops here ───────────────────────────────────────
  if (dryRun) {
    return Response.json({
      dry_run: true,
      ...summary,
      sample_new: toInsert.slice(0, 5).map((r) => ({
        email: r.email,
        name: [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
        company: r.company_name,
        sector: r.sector,
      })),
    })
  }

  // ── Commit ───────────────────────────────────────────────────
  const errors: { email: string; error: string }[] = []

  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK)
    const { error } = await admin.from('contacts').insert(
      slice.map((r) => ({
        ...r,
        unsubscribed_at: r.email_subscribed ? null : new Date().toISOString(),
      })),
    )
    if (error) {
      console.error('[contacts/import] insert chunk failed', error)
      errors.push({ email: `${slice.length} rows from #${i}`, error: error.message })
    }
  }

  // Updates carry a different patch each, so they go one at a time. At ~2.4k
  // enrichment rows this is acceptable; the insert path is the bulk one.
  for (const { id, patch } of toUpdate) {
    const { error } = await admin.from('contacts').update(patch).eq('id', id)
    if (error) errors.push({ email: id, error: error.message })
  }

  // Audit row — one per committed upload.
  await admin.from('contact_imports').insert({
    filename: body.filename ?? null,
    total_rows: summary.total_rows,
    inserted_count: summary.inserted - errors.length,
    updated_count: summary.updated,
    skipped_count: summary.unchanged + summary.invalid,
    error_rows: errors.slice(0, 50),
    imported_by: auth.profile.id,
  })

  return Response.json({ dry_run: false, ...summary, errors: errors.slice(0, 20) })
}
