// GET /api/admin/introductions/contact-requests?status=pending|approved|declined|completed|open|all
//
// Wider-network intro requests (member → CRM contact) for the admin
// Introductions page. Admins see the contact's full CRM details here.
// Default status filter is 'open' (pending + approved).

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/marketing/admin'
import { getServiceDb } from '@/lib/directory/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUSES = ['pending', 'approved', 'declined', 'completed']

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const status = req.nextUrl.searchParams.get('status') ?? 'open'
  const admin = getServiceDb()
  let query = admin
    .from('contact_intro_requests')
    .select(
      'id, status, reason, desired_outcome, admin_note, handled_at, created_at, ' +
        'contact:contacts(id, email, first_name, last_name, company_name, job_title, phone, ' +
        'linkedin_url, website, sector, city, location), ' +
        'requester:members(id, company_name, ' +
        'profiles(first_name, last_name, email))',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (status === 'open') query = query.in('status', ['pending', 'approved'])
  else if (STATUSES.includes(status)) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    // 42P01 = table missing (migration not applied yet) → empty, not an error.
    if (error.code === '42P01' || error.code === 'PGRST205') return Response.json({ requests: [] })
    console.error('[contact-requests] list failed:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ requests: data ?? [] })
}
