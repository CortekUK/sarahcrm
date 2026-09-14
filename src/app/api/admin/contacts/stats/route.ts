// GET /api/admin/contacts/stats
//
// Per-sector counts for the filter pills, plus the headline totals. Kept
// separate from the list route so paging through contacts doesn't recount
// 11k rows on every page change.
//
// Counts respect the same `q` / `subscribed` filters as the list, so the pill
// numbers always match what clicking one will actually show.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { SECTOR_KEYS, SECTOR_LABELS } from '@/lib/contacts/sectors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function escapeSearch(q: string): string {
  return q.replace(/[,()*\\]/g, ' ').trim()
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const sp = req.nextUrl.searchParams
  const q = escapeSearch(sp.get('q') ?? '')
  const subscribedOnly = sp.get('subscribed') === '1'

  const admin = getServiceClient()

  // A head-only count per sector. Cheap (index scan, no rows returned) and
  // avoids needing a Postgres function for a group-by.
  function countFor(sector?: string) {
    let query = admin.from('contacts').select('id', { count: 'exact', head: true })
    if (sector) query = query.eq('sector', sector)
    if (subscribedOnly) query = query.eq('email_subscribed', true)
    if (q) {
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%`,
      )
    }
    return query
  }

  const [totalRes, subRes, ...sectorRes] = await Promise.all([
    countFor(),
    admin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('email_subscribed', true),
    ...SECTOR_KEYS.map((k) => countFor(k)),
  ])

  if (totalRes.error) {
    console.error('[contacts/stats] failed', totalRes.error)
    return Response.json({ error: 'Failed to load stats.' }, { status: 500 })
  }

  const sectors = SECTOR_KEYS.map((key, i) => ({
    key,
    label: SECTOR_LABELS[key],
    count: sectorRes[i]?.count ?? 0,
  }))

  return Response.json({
    total: totalRes.count ?? 0,
    subscribed: subRes.count ?? 0,
    sectors,
  })
}
