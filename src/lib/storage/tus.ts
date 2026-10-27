// Minimal TUS 1.0.0 client for Supabase Storage resumable uploads.
//
// Isomorphic (only uses fetch / Uint8Array / Blob), so the same code runs in
// the Node import route (streaming a Google Drive download) and in the browser
// (MediaPicker direct uploads). Memory is bounded to roughly one chunk: a
// stream source is accumulated into a single reusable 6 MB buffer which is
// PATCHed before more bytes are read (backpressure via `for await`).
//
// Supabase specifics:
//   endpoint  <SUPABASE_URL>/storage/v1/upload/resumable
//   chunks    exactly 6 MB, except the last one
//   metadata  bucketName, objectName, contentType, cacheControl
//   headers   authorization: Bearer <jwt>, apikey, x-upsert

import { TUS_CHUNK_BYTES } from '@/lib/media/limits'

export type TusSource = Blob | AsyncIterable<Uint8Array | string>

export interface TusUploadOptions {
  supabaseUrl: string
  /** Auth headers — `authorization: Bearer …` and `apikey`. */
  headers: Record<string, string>
  bucket: string
  objectName: string
  contentType: string
  cacheControl?: string
  upsert?: boolean
  /** Exact total size in bytes (TUS Upload-Length). */
  totalBytes: number
  source: TusSource
  onProgress?: (loaded: number, total: number) => void
  signal?: AbortSignal
  /** Per-chunk retries on network / 5xx errors. */
  retries?: number
}

export class TusAbortError extends Error {
  constructor() {
    super('Upload cancelled')
    this.name = 'AbortError'
  }
}

function b64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const j = JSON.parse(text) as { message?: string; error?: string }
    return j.message || j.error || text || `HTTP ${res.status}`
  } catch {
    return text || `HTTP ${res.status}`
  }
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new TusAbortError()
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Upload `source` to Supabase Storage via TUS. Resolves when the object exists. */
export async function tusUpload(opts: TusUploadOptions): Promise<void> {
  const {
    supabaseUrl,
    headers: authHeaders,
    bucket,
    objectName,
    contentType,
    cacheControl = '3600',
    upsert = false,
    totalBytes,
    source,
    onProgress,
    signal,
    retries = 3,
  } = opts

  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/upload/resumable`
  const base: Record<string, string> = { ...authHeaders, 'Tus-Resumable': '1.0.0' }

  checkAbort(signal)

  // 1. Create the upload.
  const metadata = [
    `bucketName ${b64(bucket)}`,
    `objectName ${b64(objectName)}`,
    `contentType ${b64(contentType || 'application/octet-stream')}`,
    `cacheControl ${b64(cacheControl)}`,
  ].join(',')
  const createRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...base,
      'Upload-Length': String(totalBytes),
      'Upload-Metadata': metadata,
      'x-upsert': upsert ? 'true' : 'false',
    },
    signal,
  })
  if (createRes.status !== 201) {
    throw new Error(`Upload could not start: ${await errorText(createRes)}`)
  }
  const location = createRes.headers.get('location')
  if (!location) throw new Error('Upload could not start: no upload URL returned')
  const uploadUrl = new URL(location, endpoint).toString()

  let offset = 0

  async function serverOffset(): Promise<number> {
    const res = await fetch(uploadUrl, { method: 'HEAD', headers: base, signal })
    if (!res.ok) throw new Error(`Upload status check failed (HTTP ${res.status})`)
    return Number(res.headers.get('upload-offset') ?? NaN)
  }

  // PATCH one chunk at `offset`, retrying transient failures.
  async function sendChunk(chunk: Uint8Array | Blob): Promise<void> {
    const size = chunk instanceof Blob ? chunk.size : chunk.byteLength
    let attempt = 0
    for (;;) {
      checkAbort(signal)
      try {
        const res = await fetch(uploadUrl, {
          method: 'PATCH',
          headers: {
            ...base,
            'Upload-Offset': String(offset),
            'Content-Type': 'application/offset+octet-stream',
          },
          body: chunk as BodyInit,
          signal,
        })
        if (res.status === 204 || res.ok) {
          const next = Number(res.headers.get('upload-offset') ?? offset + size)
          if (next !== offset + size) {
            throw new Error(`Unexpected upload offset ${next} (expected ${offset + size})`)
          }
          offset = next
          onProgress?.(offset, totalBytes)
          return
        }
        // 4xx (other than conflict/timeout) are not worth retrying.
        if (res.status < 500 && res.status !== 409 && res.status !== 408 && res.status !== 429) {
          throw Object.assign(new Error(await errorText(res)), { fatal: true })
        }
        throw new Error(await errorText(res))
      } catch (e) {
        if (signal?.aborted) throw new TusAbortError()
        if ((e as { fatal?: boolean }).fatal || attempt >= retries) throw e
        attempt++
        await wait(500 * attempt)
        // The chunk may have landed before the connection dropped.
        const at = await serverOffset().catch(() => NaN)
        if (at === offset + size) {
          offset = at
          onProgress?.(offset, totalBytes)
          return
        }
        if (at !== offset) throw e
      }
    }
  }

  try {
    if (source instanceof Blob) {
      for (let start = 0; start < totalBytes; start += TUS_CHUNK_BYTES) {
        await sendChunk(source.slice(start, Math.min(start + TUS_CHUNK_BYTES, totalBytes)))
      }
    } else {
      // Accumulate the stream into one reusable 6 MB buffer.
      const buf = new Uint8Array(TUS_CHUNK_BYTES)
      let filled = 0
      const encoder = new TextEncoder()
      for await (const piece of source) {
        checkAbort(signal)
        let bytes = typeof piece === 'string' ? encoder.encode(piece) : piece
        if (offset + filled + bytes.byteLength > totalBytes) {
          throw new Error('Source is larger than its declared size')
        }
        while (bytes.byteLength > 0) {
          const take = Math.min(bytes.byteLength, TUS_CHUNK_BYTES - filled)
          buf.set(bytes.subarray(0, take), filled)
          filled += take
          bytes = bytes.subarray(take)
          if (filled === TUS_CHUNK_BYTES) {
            await sendChunk(buf)
            filled = 0
          }
        }
      }
      if (filled > 0) await sendChunk(buf.subarray(0, filled))
    }
    if (offset !== totalBytes) {
      throw new Error(`Upload incomplete: ${offset} of ${totalBytes} bytes received`)
    }
  } catch (e) {
    // Best-effort TUS termination so the partial upload doesn't linger.
    fetch(uploadUrl, { method: 'DELETE', headers: base }).catch(() => {})
    if (signal?.aborted) throw new TusAbortError()
    throw e
  }
}
