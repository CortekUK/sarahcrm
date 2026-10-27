// POST /api/admin/google/drive/import
//
// Copies a chosen Drive media file into the Supabase `gallery` storage bucket
// so it gets a stable PUBLIC url usable in the website, emails and brochures —
// without world-sharing the client's Drive folder. Admin only.
//
// Body: { file_id: string }
//
// The Drive download is streamed straight into Supabase Storage (TUS resumable
// upload, 6 MB chunks) so memory stays bounded to ~one chunk. Files ≤ 6 MB use
// the simple single-request upload. Oversize files (per Drive metadata) are
// refused with 413 BEFORE anything is downloaded.
//
// Response modes:
//   • `Accept: application/x-ndjson` → newline-delimited JSON progress stream:
//       {"type":"progress","loaded":n,"total":n}
//       … then {"type":"done","ok":true,"url","path"} or {"type":"error","error"}
//     Aborting the request cancels the copy (partial object is removed).
//   • otherwise → a single JSON body { ok, url, path } (legacy shape).

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getFileMeta, getFileMediaStream, type DriveFileMeta } from '@/lib/google/drive'
import { tusUpload, TusAbortError } from '@/lib/storage/tus'
import {
  MEDIA_IMPORT_MAX_BYTES,
  MEDIA_TOO_LARGE_MESSAGE,
  TUS_CHUNK_BYTES,
} from '@/lib/media/limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 300s is the max on our Vercel plan. Very large files on a slow Drive link may
// still exceed it on Vercel — moving this to background processing is a future
// step.
export const maxDuration = 300

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

class TooLargeError extends Error {
  constructor() {
    super(MEDIA_TOO_LARGE_MESSAGE)
  }
}

// Buffer a (small / unknown-size) stream, refusing anything over `cap` bytes.
async function streamToBuffer(stream: NodeJS.ReadableStream, cap: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of stream) {
    const buf =
      typeof chunk === 'string'
        ? Buffer.from(chunk)
        : Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as Uint8Array)
    total += buf.byteLength
    if (total > cap) throw new TooLargeError()
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

// Download from Drive and upload to Storage, streaming. Cleans up on failure.
async function copyDriveFileToStorage(opts: {
  fileId: string
  meta: DriveFileMeta
  path: string
  signal: AbortSignal
  onProgress: (loaded: number, total: number) => void
}): Promise<void> {
  const { fileId, meta, path, signal, onProgress } = opts
  const db = getAdminDb()
  const stream = await getFileMediaStream(fileId)
  const destroy = () => (stream as unknown as { destroy?: () => void }).destroy?.()
  signal.addEventListener('abort', destroy, { once: true })

  try {
    const size = meta.sizeBytes
    if (size == null || size <= TUS_CHUNK_BYTES) {
      // Small (or size unknown) → simple single upload, exactly as fast as before.
      const buffer = await streamToBuffer(stream, MEDIA_IMPORT_MAX_BYTES)
      if (signal.aborted) throw new TusAbortError()
      const up = await db.storage.from(BUCKET).upload(path, buffer, {
        contentType: meta.mimeType,
        upsert: false,
        cacheControl: '3600',
      })
      if (up.error) throw new Error(up.error.message)
      onProgress(buffer.byteLength, buffer.byteLength)
      return
    }

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    await tusUpload({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      headers: { authorization: `Bearer ${key}`, apikey: key },
      bucket: BUCKET,
      objectName: path,
      contentType: meta.mimeType,
      cacheControl: '3600',
      upsert: false,
      totalBytes: size,
      source: stream as unknown as AsyncIterable<Uint8Array | string>,
      onProgress,
      signal,
    })
  } catch (e) {
    destroy()
    // Best-effort: remove any partial / just-completed object.
    await db.storage
      .from(BUCKET)
      .remove([path])
      .catch(() => {})
    throw e
  } finally {
    signal.removeEventListener('abort', destroy)
  }
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
  const fileId = body.file_id

  // Metadata first — refuse oversize files before downloading anything.
  let meta: DriveFileMeta
  try {
    meta = await getFileMeta(fileId)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to read file from Drive'
    return Response.json({ error: message }, { status: 502 })
  }
  if (meta.sizeBytes != null && meta.sizeBytes > MEDIA_IMPORT_MAX_BYTES) {
    return Response.json({ error: MEDIA_TOO_LARGE_MESSAGE }, { status: 413 })
  }

  const path = `drive/${Date.now()}-${slugName(meta.name)}`
  const publicUrl = () => getAdminDb().storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  // Client disconnect / abort cancels the copy.
  const abort = new AbortController()
  req.signal?.addEventListener('abort', () => abort.abort(), { once: true })

  const wantsNdjson = (req.headers.get('accept') ?? '').includes('application/x-ndjson')

  if (!wantsNdjson) {
    try {
      await copyDriveFileToStorage({ fileId, meta, path, signal: abort.signal, onProgress: () => {} })
      return Response.json({ ok: true, url: publicUrl(), path })
    } catch (e) {
      const status = e instanceof TooLargeError ? 413 : 502
      const message = e instanceof Error ? e.message : 'Failed to import file'
      return Response.json({ error: message }, { status })
    }
  }

  const encoder = new TextEncoder()
  const total = meta.sizeBytes ?? 0
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (obj: Record<string, unknown>) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
        } catch {
          closed = true
        }
      }
      send({ type: 'progress', loaded: 0, total })
      try {
        await copyDriveFileToStorage({
          fileId,
          meta,
          path,
          signal: abort.signal,
          onProgress: (loaded, t) => send({ type: 'progress', loaded, total: t }),
        })
        send({ type: 'done', ok: true, url: publicUrl(), path })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to import file'
        send({ type: 'error', error: message })
      } finally {
        closed = true
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      // no-transform stops compression middleware buffering the stream.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
