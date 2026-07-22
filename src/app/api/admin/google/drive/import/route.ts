// POST /api/admin/google/drive/import
//
// Copies a chosen Drive media file into the Supabase `gallery` storage bucket
// so it gets a stable PUBLIC url usable in the website, emails and brochures —
// without world-sharing the client's Drive folder. Admin only.
//
// Body: { file_id: string }
// Returns: { ok, url, path }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getFileStream } from '@/lib/google/drive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'gallery'

function getAdminDb() {
  return createAdminClient<Database>(
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
  return { ok: true }
}

function slugName(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : 'bin'
  const base =
    (dot >= 0 ? name.slice(0, dot) : name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'file'
  return `${base}.${ext}`
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    if (typeof chunk === 'string') chunks.push(Buffer.from(chunk))
    else if (Buffer.isBuffer(chunk)) chunks.push(chunk)
    else chunks.push(Buffer.from(chunk as Uint8Array))
  }
  return Buffer.concat(chunks)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: { file_id?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.file_id) return Response.json({ error: 'file_id is required.' }, { status: 400 })

  try {
    const { stream, mimeType, name } = await getFileStream(body.file_id)
    const buffer = await streamToBuffer(stream)
    const path = `drive/${Date.now()}-${slugName(name)}`

    const db = getAdminDb()
    const up = await db.storage.from(BUCKET).upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
      cacheControl: '3600',
    })
    if (up.error) return Response.json({ error: up.error.message }, { status: 502 })

    const { data } = db.storage.from(BUCKET).getPublicUrl(path)
    return Response.json({ ok: true, url: data.publicUrl, path })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to import file'
    return Response.json({ error: message }, { status: 502 })
  }
}
