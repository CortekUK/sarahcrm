// POST /api/admin/enquiries/enrich
//
// Admin-only manual (re-)enrichment of a single enquiry. Runs the best-effort
// enrichEnquiry path behind the provider interface (Clay today, swappable
// later). This is the ONLY way an enquiry gets enriched — the public intake
// no longer auto-enriches, so Clay search quota is spent deliberately.
//
// Body: { enquiryId: string }
// Returns: { ok: true, status } or { error }

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { enrichEnquiry } from '@/lib/enrichment'

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

export async function POST(request: Request) {
  // ── Admin gate ──────────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return Response.json({ error: 'Admin only.' }, { status: 403 })
  }

  // ── Parse + validate ────────────────────────────────────────────
  let payload: { enquiryId?: string }
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const enquiryId = payload.enquiryId?.trim()
  if (!enquiryId) {
    return Response.json({ error: 'enquiryId is required.' }, { status: 400 })
  }

  // ── Enrich (best-effort — never throws) ─────────────────────────
  // 'failed' (provider error, e.g. the Clay search failed or its quota is used
  // up) is returned as a 502 with the reason, so the admin sees a failure
  // toast rather than "Enrichment complete — Status: failed".
  try {
    const { status, error } = await enrichEnquiry(getAdminDb(), enquiryId)
    if (status === 'failed') {
      return Response.json(
        { error: error ?? 'Enrichment failed.', status },
        { status: 502 },
      )
    }
    return Response.json({ ok: true, status })
  } catch (e) {
    console.error('[admin/enquiries/enrich] failed:', e)
    return Response.json({ error: 'Enrichment failed.' }, { status: 500 })
  }
}
