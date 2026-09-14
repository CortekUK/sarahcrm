// GET /api/admin/contacts
//   ?q=          search across name / email / company
//   &sector=     canonical sector key, or 'all'
//   &subscribed= '1' to show only emailable contacts
//   &limit=&offset=
//
// Paginated contact list for the admin Contacts screen, plus the per-sector
// counts that drive the filter pills.
//
// Read through the service-role client (the contacts tables are deliberately
// absent from src/types/database.ts) AFTER the admin role check — same shape
// as the Inbox routes.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { SECTOR_KEYS } from '@/lib/contacts/sectors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

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

// PostgREST `or=` takes a comma-separated filter list, so a search term
// containing a comma or parenthesis would break out of the expression.
function escapeSearch(q: string): string {
  return q.replace(/[,()*\\]/g, ' ').trim()
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const sp = req.nextUrl.searchParams
  const q = escapeSearch(sp.get('q') ?? '')
  const sector = sp.get('sector') ?? 'all'
  const subscribedOnly = sp.get('subscribed') === '1'
  const limit = Math.min(Number(sp.get('limit')) || DEFAULT_LIMIT, MAX_LIMIT)
  const offset = Math.max(Number(sp.get('offset')) || 0, 0)

  const admin = getServiceClient()

  let query = admin
    .from('contacts')
    .select(
      'id, email, first_name, last_name, company_name, job_title, website, sector, city, ' +
        'location, employee_count, company_size, linkedin_url, industry_raw, groups, ' +
        'email_subscribed, sms_subscribed, is_member_flag, source, notes, created_at',
      { count: 'exact' },
    )

  if (sector !== 'all' && SECTOR_KEYS.includes(sector)) query = query.eq('sector', sector)
  if (subscribedOnly) query = query.eq('email_subscribed', true)
  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%`,
    )
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[contacts] list failed', error)
    return Response.json({ error: 'Failed to load contacts.' }, { status: 500 })
  }

  return Response.json({
    contacts: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  })
}
