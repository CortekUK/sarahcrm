// PATCH  /api/admin/contacts/[id]  — edit one contact from the detail drawer
// DELETE /api/admin/contacts/[id]  — remove one contact
//
// Only the fields a human would reasonably correct by hand are writable;
// everything else is import-owned. Admin only.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { SECTOR_KEYS } from '@/lib/contacts/sectors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Hand-editable fields. `email` is excluded on purpose — it's the import
// identity key, so changing it would orphan the row from future uploads.
const EDITABLE = [
  'first_name',
  'last_name',
  'company_name',
  'job_title',
  'website',
  'phone',
  'city',
  'location',
  'sector',
  'notes',
  'email_subscribed',
  'sms_subscribed',
] as const

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  for (const field of EDITABLE) {
    if (!(field in body)) continue
    const v = body[field]
    if (field === 'sector') {
      if (typeof v !== 'string' || !SECTOR_KEYS.includes(v)) {
        return Response.json({ error: 'Unknown sector.' }, { status: 400 })
      }
      patch.sector = v
    } else if (field === 'email_subscribed' || field === 'sms_subscribed') {
      patch[field] = Boolean(v)
      // Stamp the opt-out time so the marketing side can report on it.
      if (field === 'email_subscribed' && !v) patch.unsubscribed_at = new Date().toISOString()
    } else {
      const s = typeof v === 'string' ? v.trim() : ''
      patch[field] = s === '' ? null : s
    }
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const admin = getServiceClient()
  const { data, error } = await admin
    .from('contacts')
    .update(patch)
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[contacts] update failed', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (!data) return Response.json({ error: 'Contact not found.' }, { status: 404 })

  return Response.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = getServiceClient()
  const { error } = await admin.from('contacts').delete().eq('id', id)

  if (error) {
    console.error('[contacts] delete failed', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ ok: true })
}
