// GET  /api/admin/google/gmail/filtered   — list distinct noise-filtered senders
// POST /api/admin/google/gmail/filtered   — restore one (add_lead) or leave (dismiss)
//
// Manual escape hatch for the noise filter: senders whose unmatched messages
// were flagged is_noise=true never appear in "Detected from email". This route
// lists them so an admin can rescue anyone wrongly filtered. `add_lead` creates
// an enquiry (same lead pipeline as the extractions route) AND clears is_noise
// for that sender's messages so they stay restored. Admin only.

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

interface FilteredSender {
  email: string
  name: string | null
  subject: string | null
  count: number
  lastAt: string
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const db = getAdminDb()
  // Pull filtered, unmatched inbound rows newest-first and fold to distinct
  // senders in memory (Supabase has no distinct-on helper). Cap the scan.
  const { data } = await db
    .from('gmail_messages')
    .select('counterpart_email, from_email, subject, internal_date')
    .eq('is_noise', true)
    .is('member_id', null)
    .order('internal_date', { ascending: false })
    .limit(1000)

  const byEmail = new Map<string, FilteredSender>()
  for (const row of data ?? []) {
    const email = (row.counterpart_email ?? '').toLowerCase()
    if (!email) continue
    const existing = byEmail.get(email)
    if (existing) {
      existing.count += 1
    } else {
      byEmail.set(email, {
        email,
        name: null,
        subject: row.subject ?? null,
        count: 1,
        lastAt: row.internal_date,
      })
    }
  }

  const senders = [...byEmail.values()].slice(0, 100)
  return Response.json({ ok: true, senders })
}

// Best-effort name split from an email local-part (e.g. "jane.doe" → Jane / Doe).
function namesFromEmail(email: string): { first: string; last: string } {
  const local = (email.split('@')[0] ?? '').replace(/[._-]+/g, ' ').trim()
  if (!local) return { first: '(unknown)', last: '' }
  const parts = local.split(/\s+/).filter(Boolean)
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return {
    first: cap(parts[0] ?? '(unknown)'),
    last: parts.slice(1).map(cap).join(' '),
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: { email?: string; action?: 'add_lead' | 'dismiss' }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const email = (body.email ?? '').toLowerCase().trim()
  if (!email || !body.action) return Response.json({ error: 'email and action are required.' }, { status: 400 })

  const db = getAdminDb()

  if (body.action === 'add_lead') {
    const { first, last } = namesFromEmail(email)
    // Create an enquiry (same lead pipeline the extractions route uses).
    await db.from('enquiries').insert({
      first_name: first,
      last_name: last,
      email,
      message: 'Restored from filtered inbound email.',
      source: 'gmail',
      status: 'new',
    })
    // Restore the sender so it isn't re-hidden next time it appears.
    await db
      .from('gmail_messages')
      .update({ is_noise: false })
      .eq('counterpart_email', email)
      .eq('is_noise', true)
  }

  // `dismiss` is a no-op: the sender simply stays filtered.
  return Response.json({ ok: true })
}
