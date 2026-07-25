// GET/PUT /api/admin/google/drive/folders
//
// Admin control surface for Drive media access. GET returns the current media
// owner, the owner-approved folder allow-list, and the admin roster (for the
// owner picker). PUT sets the owner (once/by owner) and the allow-list (owner
// only). Backed by app_settings via the service role.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getMediaOwnerId,
  setMediaOwner,
  getAllowedFolders,
  setAllowedFolders,
  type AllowedFolder,
} from '@/lib/google/media-access'

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
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only.', status: 403 as const }
  }
  return { userId: user.id }
}

interface AdminRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

function adminName(a: AdminRow): string {
  return `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || a.email || 'Unnamed'
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const db = getAdminDb()
  const [ownerProfileId, allowedFolders, adminsRes] = await Promise.all([
    getMediaOwnerId(db),
    getAllowedFolders(db),
    db.from('profiles').select('id, first_name, last_name, email').eq('role', 'admin'),
  ])

  const admins = ((adminsRes.data as AdminRow[] | null) ?? []).map((a) => ({
    id: a.id,
    name: adminName(a),
    email: a.email,
  }))

  return Response.json({
    ok: true,
    ownerProfileId,
    isOwner: !!ownerProfileId && ownerProfileId === auth.userId,
    allowedFolders,
    admins,
  })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  const db = getAdminDb()
  const currentOwnerId = await getMediaOwnerId(db)
  const callerIsOwner = !!currentOwnerId && currentOwnerId === auth.userId

  // --- ownerProfileId: set only if no owner yet, or caller is current owner. ---
  if (b.ownerProfileId !== undefined) {
    if (typeof b.ownerProfileId !== 'string' || !b.ownerProfileId) {
      return Response.json({ error: '`ownerProfileId` must be a non-empty string' }, { status: 400 })
    }
    if (currentOwnerId && !callerIsOwner) {
      return Response.json({ error: 'Only the current media owner can reassign ownership.' }, { status: 403 })
    }
    // Target must be an admin.
    const { data: target } = await db
      .from('profiles')
      .select('id, role')
      .eq('id', b.ownerProfileId)
      .single()
    if (!target || target.role !== 'admin') {
      return Response.json({ error: 'Owner must be an admin profile.' }, { status: 400 })
    }
    await setMediaOwner(db, b.ownerProfileId)
  }

  // --- allowedFolders: owner only. ---
  if (b.allowedFolders !== undefined) {
    // Re-evaluate ownership in case ownership was just claimed above.
    const ownerNow = (await getMediaOwnerId(db)) === auth.userId
    if (!ownerNow) {
      return Response.json({ error: 'Only the media owner can manage approved folders.' }, { status: 403 })
    }
    if (!Array.isArray(b.allowedFolders)) {
      return Response.json({ error: '`allowedFolders` must be an array' }, { status: 400 })
    }
    const folders: AllowedFolder[] = []
    for (const raw of b.allowedFolders) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return Response.json({ error: 'Each folder must be an object' }, { status: 400 })
      }
      const f = raw as Record<string, unknown>
      if (typeof f.id !== 'string' || !f.id || typeof f.name !== 'string') {
        return Response.json({ error: 'Each folder needs a string id and name' }, { status: 400 })
      }
      folders.push({ id: f.id, name: f.name })
    }
    await setAllowedFolders(db, folders)
  }

  return Response.json({ ok: true })
}
