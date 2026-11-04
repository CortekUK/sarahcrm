// GET    /api/admin/contacts/[id]  — one contact's full record (deep links, directory flag)
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
  'directory_hidden',
] as const

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Max lengths for the free-text fields (anything longer is a paste error).
const MAX_LEN: Record<string, number> = {
  first_name: 100,
  last_name: 100,
  company_name: 200,
  job_title: 150,
  website: 500,
  phone: 40,
  city: 150,
  location: 200,
  notes: 10000,
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!UUID_RE.test(id)) return Response.json({ error: 'Contact not found.' }, { status: 404 })
  const admin = getServiceClient()
  // '*' so the route keeps working before directory_hidden's migration lands.
  const { data, error } = await admin.from('contacts').select('*').eq('id', id).maybeSingle()
  if (error) {
    console.error('[contacts] read failed', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (!data) return Response.json({ error: 'Contact not found.' }, { status: 404 })
  return Response.json({ contact: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!UUID_RE.test(id)) return Response.json({ error: 'Contact not found.' }, { status: 404 })
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
    } else if (field === 'directory_hidden') {
      patch.directory_hidden = Boolean(v)
    } else if (field === 'email_subscribed' || field === 'sms_subscribed') {
      patch[field] = Boolean(v)
      // Stamp the opt-out time so the marketing side can report on it.
      if (field === 'email_subscribed' && !v) patch.unsubscribed_at = new Date().toISOString()
    } else {
      const s = typeof v === 'string' ? v.trim() : ''
      if (s.length > (MAX_LEN[field] ?? 1000)) {
        return Response.json(
          { error: `${field.replace('_', ' ')} must be ${MAX_LEN[field] ?? 1000} characters or fewer.` },
          { status: 400 },
        )
      }
      patch[field] = s === '' ? null : s
    }
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const admin = getServiceClient()

  // Consent: a contact who unsubscribed can't be silently opted back in by
  // an admin toggle (PECR — consent has to come from the contact). It is
  // only allowed with `resubscribe_reason` recording how the contact asked
  // to be re-added; the opt-out date is then cleared and the reason is
  // appended to the contact's notes as an audit line.
  if (patch.email_subscribed === true) {
    const { data: current } = await admin
      .from('contacts')
      .select('email_subscribed, unsubscribed_at, notes')
      .eq('id', id)
      .maybeSingle()
    if (!current) return Response.json({ error: 'Contact not found.' }, { status: 404 })
    if (current.unsubscribed_at || current.email_subscribed === false) {
      const reason =
        typeof body.resubscribe_reason === 'string' ? body.resubscribe_reason.trim().slice(0, 500) : ''
      if (reason.length < 5) {
        return Response.json(
          {
            error:
              'This contact unsubscribed. They can only be re-subscribed if they asked to be — add a short note of how they asked (resubscribe_reason).',
          },
          { status: 409 },
        )
      }
      patch.unsubscribed_at = null
      const stamp = new Date().toISOString().slice(0, 10)
      const auditLine = `[${stamp}] Re-subscribed to email by an admin: ${reason}`
      const baseNotes = typeof patch.notes === 'string' ? patch.notes : (current.notes as string | null)
      patch.notes = baseNotes ? `${baseNotes}\n${auditLine}` : auditLine
    }
  }

  const { data, error } = await admin
    .from('contacts')
    .update(patch)
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[contacts] update failed', error)
    return Response.json({ error: 'Could not save the contact.' }, { status: 500 })
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
  if (!UUID_RE.test(id)) return Response.json({ error: 'Contact not found.' }, { status: 404 })
  const admin = getServiceClient()
  const { data, error } = await admin.from('contacts').delete().eq('id', id).select('id')

  if (error) {
    console.error('[contacts] delete failed', error)
    return Response.json({ error: 'Could not delete the contact.' }, { status: 500 })
  }
  if (!data || data.length === 0) return Response.json({ error: 'Contact not found.' }, { status: 404 })
  return Response.json({ ok: true })
}
