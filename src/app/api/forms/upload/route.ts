// POST /api/forms/upload
//
// PUBLIC (anonymous) — issues a one-time SIGNED UPLOAD URL into the PRIVATE
// `form-uploads` bucket for a website form attachment (PITCH founder deck,
// financials, cap table). The browser then uploads the file straight to
// Supabase Storage with `uploadToSignedUrl(path, token, file)` — the file
// never passes through this function (Vercel's request body limit is far
// below the 20MB cap), and nothing in the bucket is ever public by URL.
//
// The returned `path` goes back to /api/enquiries/intake in
// form_data.files, where it is pattern-checked; admins open it through
// /api/forms/file (short-lived signed download URL, admin-only).
//
// Body: { slot: 'pitch-deck' | 'pitch-financials' | 'pitch-cap-table',
//         filename: string, size: number, content_type?: string }
// Returns: { ok: true, path, token } or { ok: false, error }
//
// Validation: slot whitelist; extension pdf / pptx / xlsx / docx; declared
// size ≤ 20MB (the bucket's own file_size_limit + allowed_mime_types,
// set in 20261106_d_forms.sql, enforce the real upload); the stored name is
// sanitised and prefixed by a random UUID folder. Rate limited per IP.

import { randomUUID } from 'crypto'
import { getAdmin } from '@/lib/marketing/admin'
import { clientIp, overLimit } from '@/lib/public-intake/rate-limit'
import {
  FORM_UPLOAD_BUCKET,
  FORM_UPLOAD_MAX_BYTES,
  FORM_UPLOAD_SLOTS,
  FORM_UPLOAD_TYPES,
} from '@/components/website/forms/sources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PER_IP_PER_10_MIN = 12
const MAX_GLOBAL_PER_10_MIN = 120

function fail(error: string, status: number) {
  return Response.json({ ok: false, error }, { status })
}

// "My Deck (final) v2.PDF" → "My-Deck-final-v2"
function safeBase(name: string): string {
  const base = name.replace(/\.[^.]*$/, '')
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 80)
    .replace(/[-.]+$/, '')
  return cleaned || 'file'
}

export async function POST(request: Request) {
  let body: { slot?: unknown; filename?: unknown; size?: unknown; content_type?: unknown }
  try {
    body = await request.json()
  } catch {
    return fail('Invalid JSON body.', 400)
  }
  if (!body || typeof body !== 'object') return fail('Invalid JSON body.', 400)

  const slot = typeof body.slot === 'string' ? body.slot : ''
  if (!(FORM_UPLOAD_SLOTS as readonly string[]).includes(slot)) return fail('Unknown upload.', 400)

  const filename = typeof body.filename === 'string' ? body.filename.trim() : ''
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (!filename || filename.length > 255 || !Object.prototype.hasOwnProperty.call(FORM_UPLOAD_TYPES, ext)) {
    return fail('Please upload a PDF, PowerPoint (.pptx), Excel (.xlsx) or Word (.docx) file.', 400)
  }
  const size = typeof body.size === 'number' ? body.size : NaN
  if (!Number.isFinite(size) || size <= 0) return fail('The file looks empty.', 400)
  if (size > FORM_UPLOAD_MAX_BYTES) return fail('Files must be 20MB or smaller.', 400)

  if (
    overLimit(`form-upload:${clientIp(request)}`, MAX_PER_IP_PER_10_MIN, 10 * 60_000) ||
    overLimit('form-upload:global', MAX_GLOBAL_PER_10_MIN, 10 * 60_000)
  ) {
    return fail('Too many uploads — please try again in a few minutes.', 429)
  }

  const path = `${slot}/${randomUUID()}/${safeBase(filename)}.${ext}`
  try {
    const admin = getAdmin()
    const { data, error } = await admin.storage
      .from(FORM_UPLOAD_BUCKET)
      .createSignedUploadUrl(path)
    if (error || !data) {
      console.error('[forms/upload] signed upload failed:', error)
      return fail('Uploads are unavailable right now — please email your files instead.', 503)
    }
    return Response.json({ ok: true, path: data.path, token: data.token })
  } catch (e) {
    console.error('[forms/upload] failed:', e)
    return fail('Uploads are unavailable right now — please email your files instead.', 503)
  }
}
