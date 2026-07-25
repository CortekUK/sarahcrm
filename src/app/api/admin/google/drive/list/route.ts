// GET /api/admin/google/drive/list
//
// Lists images + videos in the configured Drive media folder for the CRM's
// media picker. Admin only. Thumbnails/previews are served via the sibling
// /file/[id] proxy (Drive files are private).

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { listChildren, getFileParents } from '@/lib/google/drive'
import { getGoogleConfig, GoogleError } from '@/lib/google/client'
import { getAllowedFolders, isMediaOwner, type AllowedFolder } from '@/lib/google/media-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createSupabaseAdminClient<Database>(
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
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Admin only.', status: 403 as const }
  return { userId: user.id }
}

// Walk a folder's parent chain (capped depth) to see if it descends from an
// approved folder. The folder id itself is checked by the caller.
async function isDescendantOfApproved(
  folderId: string,
  approvedIds: Set<string>,
): Promise<boolean> {
  const seen = new Set<string>()
  let frontier = [folderId]
  for (let depth = 0; depth < 10 && frontier.length; depth++) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      let parents: string[] = []
      try {
        parents = await getFileParents(id)
      } catch {
        parents = []
      }
      for (const p of parents) {
        if (approvedIds.has(p)) return true
        next.push(p)
      }
    }
    frontier = next
  }
  return false
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const param = new URL(req.url).searchParams.get('folderId') || undefined

  const db = getAdminDb()
  const [allowedFolders, owner] = await Promise.all([
    getAllowedFolders(db),
    isMediaOwner(db, auth.userId),
  ])

  // Safe default: no approved folders → behave exactly as before (browse all,
  // landing on GOOGLE_DRIVE_FOLDER_ID). Owner also always browses all.
  const restricted = allowedFolders.length > 0 && !owner

  try {
    if (!restricted) {
      // No folderId → start at the optional default landing folder
      // (GOOGLE_DRIVE_FOLDER_ID), else the Drive roots.
      const folderId = param ?? getGoogleConfig()?.driveFolderId
      const { folders, media } = await listChildren({ folderId })
      return Response.json({ ok: true, folders, media, folderId: folderId ?? null })
    }

    // Restricted (non-owner, allow-list active).
    // Root view → show only the approved folders, no media.
    if (!param) {
      const folders = allowedFolders.map((f: AllowedFolder) => ({ id: f.id, name: f.name }))
      return Response.json({ ok: true, folders, media: [], folderId: null })
    }

    // A specific folder → allow only if it's approved or a descendant of one.
    const approvedIds = new Set(allowedFolders.map((f) => f.id))
    const permitted =
      approvedIds.has(param) || (await isDescendantOfApproved(param, approvedIds))
    if (!permitted) {
      return Response.json({ ok: true, folders: [], media: [], folderId: param })
    }
    const { folders, media } = await listChildren({ folderId: param })
    return Response.json({ ok: true, folders, media, folderId: param })
  } catch (e) {
    const status = e instanceof GoogleError ? e.status ?? 502 : 502
    const message = e instanceof Error ? e.message : 'Failed to browse Drive'
    return Response.json({ error: message }, { status })
  }
}
