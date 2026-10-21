// GET /api/portal/directory/sectors
//
// Sector filter options for the wider-network directory, with the number of
// listable contacts in each (one GROUP BY over ~11k rows). The CRM's
// "Unsegmented" bucket is left out — it isn't a meaningful filter for members.

import { requireDirectoryViewer } from '@/lib/directory/server'
import type { DirectorySector } from '@/lib/directory/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const viewer = await requireDirectoryViewer()
  if (!viewer.ok) return Response.json({ error: viewer.error }, { status: viewer.status })

  const { data, error } = await viewer.admin.rpc('directory_contact_sectors')
  if (error) {
    console.error('[directory/sectors] rpc failed:', error)
    return Response.json({ error: 'Could not load sectors.' }, { status: 500 })
  }

  const sectors: DirectorySector[] = (
    (data ?? []) as { key: string; label: string; contact_count: number | string }[]
  )
    .filter((s) => s.key !== 'unsegmented')
    .map((s) => ({ key: s.key, label: s.label, count: Number(s.contact_count) || 0 }))

  return Response.json({ sectors })
}
