// POST /api/admin/revalidate
//
// Flushes the Next.js ISR cache for one or more paths so a fresh public
// page is served on the next request — useful after the admin edits a
// hero / membership plan / etc. and wants to see the change immediately
// rather than waiting for the page's revalidate window.
//
// Body: { paths: string[] }   e.g. { paths: ['/', '/about'] }
//
// Admin-only.

import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  paths?: string[]
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only.', status: 403 as const }
  }
  return { ok: true as const }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return Response.json({ error: auth.error }, { status: auth.status })
    }

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const paths = (body.paths ?? []).filter(
      (p): p is string => typeof p === 'string' && p.startsWith('/'),
    )
    if (paths.length === 0) {
      return Response.json({ error: 'paths array required (each must start with /)' }, {
        status: 400,
      })
    }

    for (const path of paths) {
      revalidatePath(path)
    }

    return Response.json({ ok: true, revalidated: paths })
  } catch (e) {
    console.error('[revalidate] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
