// GET /api/admin/google/drive/file/[id]
//
// Proxies the bytes of a private Drive file so the CRM can preview thumbnails
// without world-sharing the client's Drive folder. Admin only.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFileStream } from '@/lib/google/drive'
import { Readable } from 'stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin'
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return new Response('Forbidden', { status: 403 })
  const { id } = await ctx.params
  try {
    const { stream, mimeType } = await getFileStream(id)
    // Adapt the Node stream to a web ReadableStream for the Response.
    const webStream = Readable.toWeb(stream as Readable) as unknown as ReadableStream
    return new Response(webStream, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch file'
    return new Response(message, { status: 502 })
  }
}
