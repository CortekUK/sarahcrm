// /api/admin/contacts/enrich — bulk company enrichment for the Contacts table.
//
// Keyed on the contact's EMAIL DOMAIN (see
// supabase/migrations/20261104_contact_domain_enrichment.sql): one Clay
// company search fills every contact at that company, each domain is searched
// at most once (cached in contact_domain_enrichments), personal mailboxes are
// never searched, and applying a result only fills EMPTY fields.
//
//   GET                         → { plan, clay_configured }
//   POST { action: 'seed' }     → copy company data from colleagues already
//                                 enriched at the same domain (free, no Clay).
//   POST { action: 'batch', size? }
//                               → search the next `size` (≤ MAX_BATCH)
//                                 domains, most contacts first, and apply.
//                                 The browser loops batches so each request
//                                 stays inside maxDuration; it stops when the
//                                 Clay quota runs out (stopped: 'quota').
//
// Every batch spends Clay quota, so nothing here runs automatically — only
// when an admin presses the button. Admin only; DB work goes through the
// service-role client after the role check.

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { getEnrichmentProvider } from '@/lib/enrichment'
import { lookupCompanyByDomain } from '@/lib/enrichment/clay'
import type { ClayQuota } from '@/lib/enrichment/clay-client'
import { toSector, UNSEGMENTED } from '@/lib/contacts/sectors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Company searches usually take a few seconds; a slow one can take ~25s. The
// batch starts no new search after BATCH_BUDGET_MS, so a request always ends
// well inside maxDuration. Sequential on purpose: Clay answers parallel
// searches with 429 "too many concurrent requests".
const MAX_BATCH = 4
const BATCH_BUDGET_MS = 30_000

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase.from('profiles').select('id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Admin only.', status: 403 as const }
  return { profile }
}

function getServiceClient() {
  return createSupabaseAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type Db = ReturnType<typeof getServiceClient>

async function loadPlan(db: Db) {
  const { data, error } = await db.rpc('contact_enrichment_plan')
  if (error) throw new Error(error.message)
  return data as Record<string, number>
}

function clayConfigured(): boolean {
  return getEnrichmentProvider().name === 'clay'
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  try {
    const plan = await loadPlan(getServiceClient())
    return Response.json({ plan, clay_configured: clayConfigured() })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Could not load the plan' }, { status: 500 })
  }
}

interface BatchItem {
  domain: string
  contacts: number
  status: 'found' | 'not_found' | 'failed'
  company: string | null
  sector: string | null
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: { action?: string; size?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const db = getServiceClient()

  // ── Free: seed from colleagues already enriched, then apply everything ──
  if (body.action === 'seed') {
    const seeded = await db.rpc('contact_enrichment_seed')
    if (seeded.error) return Response.json({ error: seeded.error.message }, { status: 500 })
    const applied = await db.rpc('contact_enrichment_apply', { p_domains: null })
    if (applied.error) return Response.json({ error: applied.error.message }, { status: 500 })
    return Response.json({
      seeded_domains: seeded.data as number,
      updated_contacts: applied.data as number,
      plan: await loadPlan(db),
    })
  }

  if (body.action !== 'batch') return Response.json({ error: 'Unknown action' }, { status: 400 })

  // ── Clay batch ─────────────────────────────────────────────────
  if (!clayConfigured()) {
    return Response.json(
      { error: 'Clay is not configured (CLAY_API_KEY missing, or ENRICHMENT_PROVIDER is not "clay").' },
      { status: 409 },
    )
  }
  const size = Math.max(1, Math.min(MAX_BATCH, Math.floor(Number(body.size) || MAX_BATCH)))
  const next = await db.rpc('contact_enrichment_next_domains', { p_limit: size })
  if (next.error) return Response.json({ error: next.error.message }, { status: 500 })
  const domains = (next.data ?? []) as { domain: string; contacts: number }[]

  const startedAt = Date.now()
  const items: BatchItem[] = []
  let quota: ClayQuota | null = null
  let stopped: null | 'quota' = null
  let stopMessage: string | null = null

  for (const { domain, contacts } of domains) {
    if (Date.now() - startedAt > BATCH_BUDGET_MS) break
    const res = await lookupCompanyByDomain(domain)

    if (res.status === 'failed' && res.kind === 'quota_exhausted') {
      // Nothing was searched — leave the domain pending for the next period.
      stopped = 'quota'
      stopMessage = res.message
      break
    }

    if (res.status === 'found') {
      quota = res.quota ?? quota
      const sector = toSector(res.company.industry)
      const row = {
        domain,
        status: 'found',
        source: 'clay',
        company_name: res.name,
        industry_raw: res.company.industry,
        sector: sector === UNSEGMENTED ? null : sector,
        website: res.company.website,
        linkedin_url: res.company.linkedinUrl,
        company_size: res.company.employeeRange ?? null,
        employee_count: res.company.employeeCount,
        description: res.company.description,
        error: null,
        raw: res.raw as object,
        searched_at: new Date().toISOString(),
      }
      const up = await db.from('contact_domain_enrichments').upsert(row, { onConflict: 'domain' })
      if (up.error) return Response.json({ error: up.error.message }, { status: 500 })
      items.push({ domain, contacts, status: 'found', company: res.name, sector: row.sector })
    } else {
      if (res.status === 'not_found') quota = res.quota ?? quota
      const up = await db.from('contact_domain_enrichments').upsert(
        {
          domain,
          status: res.status,
          source: 'clay',
          error: res.status === 'failed' ? res.message : null,
          searched_at: new Date().toISOString(),
        },
        { onConflict: 'domain' },
      )
      if (up.error) return Response.json({ error: up.error.message }, { status: 500 })
      items.push({ domain, contacts, status: res.status, company: null, sector: null })
    }
  }

  const found = items.filter((i) => i.status === 'found').map((i) => i.domain)
  let updated = 0
  if (found.length) {
    const applied = await db.rpc('contact_enrichment_apply', { p_domains: found })
    if (applied.error) return Response.json({ error: applied.error.message }, { status: 500 })
    updated = applied.data as number
  }

  return Response.json({
    items,
    updated_contacts: updated,
    quota,
    stopped,
    stop_message: stopMessage,
    // No more domains to search once a batch comes back empty without a stop.
    done: !stopped && domains.length === 0,
    plan: await loadPlan(db),
  })
}
