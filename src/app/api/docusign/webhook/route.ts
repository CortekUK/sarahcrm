// POST /api/docusign/webhook?t=<secret>
//
// DocuSign Connect endpoint. DocuSign PUSHES an event here whenever an envelope
// changes (delivered / completed / declined / voided), so status updates and
// signed-PDF filing happen automatically — no polling, no manual refresh.
//
// This is a PUBLIC route (DocuSign has no session). It's verified by a shared
// secret in the query string (?t=), matched against DOCUSIGN_CONNECT_SECRET.
// It always ACKs with 200 once accepted so DocuSign doesn't retry-storm.

import { NextRequest } from 'next/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { getDocuSignConfig, getAccessToken } from '@/lib/docusign/client'
import { syncSignatureRequest } from '@/lib/docusign/reconcile'
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

// DocuSign sometimes probes the URL with a GET — answer so the config validates.
export async function GET() {
  return new Response('ok', { status: 200 })
}

export async function POST(req: NextRequest) {
  // Verify the shared secret when one is configured.
  const secret = process.env.DOCUSIGN_CONNECT_SECRET
  if (secret) {
    const t = req.nextUrl.searchParams.get('t')
    if (t !== secret) return new Response('unauthorized', { status: 401 })
  }

  let envelopeId: string | undefined
  try {
    const body = (await req.json()) as {
      event?: string
      data?: { envelopeId?: string; envelopeSummary?: { envelopeId?: string; status?: string } }
      envelopeId?: string
    }
    envelopeId =
      body?.data?.envelopeId || body?.data?.envelopeSummary?.envelopeId || body?.envelopeId
  } catch {
    // Non-JSON (or legacy XML) payloads — ack so DocuSign doesn't retry forever.
    return new Response('ok', { status: 200 })
  }

  if (!envelopeId) return new Response('ok', { status: 200 })

  const cfg = getDocuSignConfig()
  if (!cfg) return new Response('ok', { status: 200 })

  try {
    const admin = getAdminDb()
    const { data: row } = await admin
      .from('signature_requests')
      .select('*')
      .eq('envelope_id', envelopeId)
      .maybeSingle()
    if (row) {
      const token = await getAccessToken(cfg)
      await syncSignatureRequest(admin, cfg, token, row)
    }
  } catch (e) {
    // Log and still ACK — a failed reconcile shouldn't trigger endless retries;
    // the next event or an on-load refresh will catch up.
    console.error('[docusign/webhook] reconcile failed:', e)
  }

  return new Response('ok', { status: 200 })
}
