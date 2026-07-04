// POST /api/admin/signatures/void
//
// Cancels (voids) a sent DocuSign envelope so it can no longer be signed, and
// marks the `signature_requests` row as voided.
//
// Body: { id: string, reason?: string }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { getDocuSignConfig, getAccessToken, voidEnvelope, DocuSignError } from '@/lib/docusign/client'
import type { Database } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  id?: string
  reason?: string
}

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

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return Response.json({ error: auth.error }, { status: auth.status })
    }

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.id) return Response.json({ error: 'id is required.' }, { status: 400 })

    const cfg = getDocuSignConfig()
    if (!cfg) return Response.json({ error: 'DocuSign isn’t configured yet.' }, { status: 400 })

    const admin = getAdminDb()
    const { data: row } = await admin
      .from('signature_requests')
      .select('*')
      .eq('id', body.id)
      .maybeSingle()
    if (!row) return Response.json({ error: 'Signature request not found.' }, { status: 404 })

    if (!row.envelope_id) {
      return Response.json({ error: 'This request has no DocuSign envelope to void.' }, { status: 400 })
    }
    if (['completed', 'declined', 'voided'].includes(row.status)) {
      return Response.json(
        { error: `This request is already ${row.status} and can’t be voided.` },
        { status: 400 },
      )
    }

    const reason = body.reason?.trim() || 'Cancelled by the club team.'
    const token = await getAccessToken(cfg)
    await voidEnvelope(cfg, token, row.envelope_id, reason)

    const { data: updated } = await admin
      .from('signature_requests')
      .update({ status: 'voided', declined_reason: reason, error: null })
      .eq('id', row.id)
      .select('*')
      .single()

    return Response.json({ ok: true, request: updated ?? row })
  } catch (err) {
    if (err instanceof DocuSignError) {
      return Response.json(
        { error: err.message, consentUrl: err.consentUrl },
        { status: err.status ?? 502 },
      )
    }
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return Response.json({ error: message }, { status: 500 })
  }
}
