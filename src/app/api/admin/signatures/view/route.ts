// GET /api/admin/signatures/view?id=<signature_request id>
//
// Streams the DocuSign envelope's current combined PDF for inline viewing.
// Works at any stage — shows the document as sent, and once completed shows the
// signed copy (the same artefact DocuSign displays). Admin-only.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import {
  getDocuSignConfig,
  getAccessToken,
  getCombinedDocument,
  DocuSignError,
} from '@/lib/docusign/client'
import type { Database } from '@/types/database'

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

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return Response.json({ error: auth.error }, { status: auth.status })
    }

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return Response.json({ error: 'id is required.' }, { status: 400 })

    const cfg = getDocuSignConfig()
    if (!cfg) return Response.json({ error: 'DocuSign isn’t configured yet.' }, { status: 400 })

    const admin = getAdminDb()
    const { data: row } = await admin
      .from('signature_requests')
      .select('envelope_id, title, source_file_name')
      .eq('id', id)
      .maybeSingle()
    if (!row || !row.envelope_id) {
      return Response.json({ error: 'No DocuSign document for this request.' }, { status: 404 })
    }

    const token = await getAccessToken(cfg)
    const pdf = await getCombinedDocument(cfg, token, row.envelope_id)

    const name = (row.title || row.source_file_name || 'document').replace(/[^a-z0-9-_ ]/gi, '').slice(0, 60) || 'document'
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${name}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    if (err instanceof DocuSignError) {
      return Response.json({ error: err.message, consentUrl: err.consentUrl }, { status: err.status ?? 502 })
    }
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return Response.json({ error: message }, { status: 500 })
  }
}
