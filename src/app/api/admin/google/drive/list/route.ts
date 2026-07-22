// GET /api/admin/google/drive/list
//
// Lists images + videos in the configured Drive media folder for the CRM's
// media picker. Admin only. Thumbnails/previews are served via the sibling
// /file/[id] proxy (Drive files are private).

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listChildren } from '@/lib/google/drive'
import { getGoogleConfig, GoogleError } from '@/lib/google/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Admin only.', status: 403 as const }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // No folderId → start at the optional default landing folder
  // (GOOGLE_DRIVE_FOLDER_ID), else the Drive roots (shared drives + top folders).
  const param = new URL(req.url).searchParams.get('folderId') || undefined
  const folderId = param ?? getGoogleConfig()?.driveFolderId
  try {
    const { folders, media } = await listChildren({ folderId })
    return Response.json({ ok: true, folders, media, folderId: folderId ?? null })
  } catch (e) {
    const status = e instanceof GoogleError ? e.status ?? 502 : 502
    const message = e instanceof Error ? e.message : 'Failed to browse Drive'
    return Response.json({ error: message }, { status })
  }
}
