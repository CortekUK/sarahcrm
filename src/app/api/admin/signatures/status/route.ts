// POST /api/admin/signatures/status
//
// Polls DocuSign for the current status of one signature request (by `id`) or
// every not-yet-finished request for a member (by `member_id`), updating the
// rows and filing the signed PDF into the member vault on completion. Shares
// the reconcile logic with the DocuSign Connect webhook.
//
// Body: { id?: string } | { member_id?: string }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { getDocuSignConfig, getAccessToken, DocuSignError } from '@/lib/docusign/client'
import { syncSignatureRequest, isSettled } from '@/lib/docusign/reconcile'
import type { Database } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SignatureRow = Database['public']['Tables']['signature_requests']['Row']

interface RequestBody {
  id?: string
  member_id?: string
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
    if (!body.id && !body.member_id) {
      return Response.json({ error: 'id or member_id is required.' }, { status: 400 })
    }

    const cfg = getDocuSignConfig()
    if (!cfg) {
      return Response.json({ error: 'DocuSign isn’t configured yet.' }, { status: 400 })
    }

    const admin = getAdminDb()

    let rows: SignatureRow[] = []
    if (body.id) {
      const { data } = await admin.from('signature_requests').select('*').eq('id', body.id).maybeSingle()
      if (!data) return Response.json({ error: 'Signature request not found.' }, { status: 404 })
      rows = [data]
    } else {
      const { data } = await admin
        .from('signature_requests')
        .select('*')
        .eq('member_id', body.member_id as string)
      rows = (data ?? []).filter((r) => !isSettled(r))
    }

    if (rows.length === 0) return Response.json({ ok: true, requests: [] })

    const token = await getAccessToken(cfg)
    const updated: SignatureRow[] = []
    for (const row of rows) {
      updated.push(await syncSignatureRequest(admin, cfg, token, row))
    }

    return Response.json({ ok: true, requests: updated })
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
