// GET  /api/admin/google/gmail/extractions        — list pending extractions
// POST /api/admin/google/gmail/extractions         — approve or dismiss one
//
// Approving a `new_contact` extraction creates an `enquiries` row (reusing the
// existing lead pipeline). Dismissing just marks it. Admin only.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient<Database>(
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
  const { data: profile } = await supabase.from('profiles').select('id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Admin only.', status: 403 as const }
  return { profile }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const db = getAdminDb()
  const { data } = await db
    .from('gmail_extractions')
    .select('id, kind, payload, status, created_at, gmail_message_id')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)
  return Response.json({ ok: true, extractions: data ?? [] })
}

interface ContactPayload {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  company?: string | null
  position?: string | null
  reason?: string | null
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: { id?: string; action?: 'approve' | 'dismiss' }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.id || !body.action) return Response.json({ error: 'id and action are required.' }, { status: 400 })

  const db = getAdminDb()
  const { data: row } = await db.from('gmail_extractions').select('*').eq('id', body.id).single()
  if (!row) return Response.json({ error: 'Extraction not found.' }, { status: 404 })

  if (body.action === 'approve' && row.kind === 'new_contact') {
    const p = (row.payload ?? {}) as ContactPayload
    // Create an enquiry (the existing lead pipeline) from the extracted contact.
    await db.from('enquiries').insert({
      first_name: p.first_name ?? '(unknown)',
      last_name: p.last_name ?? '',
      email: p.email ?? '',
      company: p.company ?? null,
      position: p.position ?? null,
      message: p.reason ?? 'Detected from an inbound email.',
      source: 'gmail',
      status: 'new',
    })
  }

  await db
    .from('gmail_extractions')
    .update({
      status: body.action === 'approve' ? 'approved' : 'dismissed',
      reviewed_by: auth.profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', body.id)

  return Response.json({ ok: true })
}
