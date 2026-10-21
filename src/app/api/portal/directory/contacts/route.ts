// GET /api/portal/directory/contacts?q=&sector=&cursor=&limit=24
//
// The "Wider network" half of the member directory: CRM contacts who aren't
// members, as name / company / role / sector only. Keyset-paginated on
// (lower("last first"), id) — never OFFSET, never more than 50 per page.
//
// Active members or admins only. The SQL function directory_contacts() selects
// just the permitted columns; nothing else ever leaves the database.

import { NextRequest } from 'next/server'
import {
  cleanSearch,
  decodeCursor,
  encodeCursor,
  requireDirectoryViewer,
} from '@/lib/directory/server'
import type { DirectoryContact, DirectoryContactsPage } from '@/lib/directory/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 24
const MAX_LIMIT = 50

interface Row {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  job_title: string | null
  sector_key: string | null
  sector_label: string | null
  sort_key: string
  requested: boolean
}

export async function GET(req: NextRequest) {
  const viewer = await requireDirectoryViewer()
  if (!viewer.ok) return Response.json({ error: viewer.error }, { status: viewer.status })

  const sp = req.nextUrl.searchParams
  const q = cleanSearch(sp.get('q'))
  const sectorRaw = (sp.get('sector') ?? '').trim()
  const sector = /^[a-z_]{1,40}$/.test(sectorRaw) ? sectorRaw : null
  const limit = Math.min(Math.max(Number(sp.get('limit')) || DEFAULT_LIMIT, 1), MAX_LIMIT)
  const after = decodeCursor(sp.get('cursor'))

  // Fetch one extra row to know whether another page exists.
  const { data, error } = await viewer.admin.rpc('directory_contacts', {
    p_q: q,
    p_sector: sector,
    p_after_key: after?.key ?? null,
    p_after_id: after?.id ?? null,
    p_limit: Math.min(limit + 1, MAX_LIMIT + 1),
    p_requester: viewer.memberId,
  })
  if (error) {
    console.error('[directory/contacts] rpc failed:', error)
    return Response.json({ error: 'Could not load the wider network.' }, { status: 500 })
  }

  const rows = (data ?? []) as Row[]
  const pageRows = rows.slice(0, limit)
  const last = pageRows[pageRows.length - 1]
  const contacts: DirectoryContact[] = pageRows.map((r) => ({
    id: r.id,
    name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
    company: r.company_name,
    role: r.job_title,
    // "Unsegmented" is a CRM bucket, not something to show a member.
    sectorLabel: r.sector_key && r.sector_key !== 'unsegmented' ? r.sector_label : null,
    requested: Boolean(r.requested),
  }))

  const body: DirectoryContactsPage = {
    contacts,
    nextCursor: rows.length > limit && last ? encodeCursor(last.sort_key, last.id) : null,
  }
  return Response.json(body)
}
