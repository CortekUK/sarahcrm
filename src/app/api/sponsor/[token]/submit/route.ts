// POST /api/sponsor/[token]/submit
//
// Token-gated sponsor submission — NO admin gate. The per-sponsor
// booking_token in the URL IS the auth (same token the public Sponsor
// Portal resolves by). A sponsor uploads an asset and/or marks a
// deliverable provided from /sponsor/<token>.
//
// SECURITY: the token resolves to exactly ONE sponsorship. We verify the
// posted deliverable_id belongs to THAT sponsorship before writing — a
// token can only ever touch its own deliverables, never another sponsor's.
//
// Files land in the PRIVATE 'sponsor-assets' bucket (no public read); admins
// read them later through short-lived signed URLs (mirrors member-documents).

import { NextRequest } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isSponsorPortalOpen } from '@/lib/sponsors/portal'
import { clientIp, overLimit } from '@/lib/public-intake/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'sponsor-assets'
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB
const MAX_NOTE = 2000
// Multipart framing overhead allowed on top of the file + note.
const FORM_OVERHEAD_BYTES = 64 * 1024
const TOO_LARGE = 'File is larger than 15 MB. Please upload a smaller file.'
// Per-token submissions per 10 minutes (best-effort, per instance).
const RATE_MAX = 10
const RATE_WINDOW_MS = 10 * 60 * 1000

// Content type is derived from the EXTENSION (never the client's claim), and
// the file's first bytes must match that extension (see sniffMatches).
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ai: 'application/postscript',
  eps: 'application/postscript',
  zip: 'application/zip',
}
const ALLOWED_EXT = new Set(Object.keys(CONTENT_TYPES))

function startsWith(b: Buffer, sig: number[], offset = 0): boolean {
  return b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v)
}
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

// Magic-byte check: does the file's content match its extension?
function sniffMatches(ext: string, b: Buffer): boolean {
  const PDF = ascii('%PDF')
  const PS = ascii('%!PS')
  const ZIP = [0x50, 0x4b, 0x03, 0x04]
  const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  switch (ext) {
    case 'pdf':
      return startsWith(b, PDF)
    case 'png':
      return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'jpg':
    case 'jpeg':
      return startsWith(b, [0xff, 0xd8, 0xff])
    case 'gif':
      return startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a'))
    case 'webp':
      return startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8)
    case 'doc':
    case 'ppt':
    case 'xls':
      return startsWith(b, OLE)
    case 'docx':
    case 'pptx':
    case 'xlsx':
    case 'zip':
      return startsWith(b, ZIP) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])
    case 'ai':
      return startsWith(b, PDF) || startsWith(b, PS)
    case 'eps':
      return startsWith(b, PS) || startsWith(b, [0xc5, 0xd0, 0xd3, 0xc6])
    case 'svg': {
      // Text SVG only, and no active content (scripts / event handlers /
      // javascript: links / embedded HTML) — it is an image, nothing more.
      const text = b.subarray(0, 512 * 1024).toString('utf8')
      if (!/^\uFEFF?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text)) return false
      return !/<script|<foreignObject|\son[a-z]+\s*=|javascript:|<iframe|<object|<embed/i.test(text)
    }
    default:
      return false
  }
}

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// Storage-safe object path segment: <timestamp>-<rand>-<slug>.<ext>
function safeFileName(fileName: string): { safe: string; ext: string } {
  const dot = fileName.lastIndexOf('.')
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin'
  const base = (dot >= 0 ? fileName.slice(0, dot) : fileName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'file'
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return { safe: `${stamp}-${rand}-${base}.${ext}`, ext }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    if (!token || token.length < 6) {
      return Response.json({ error: 'Invalid link' }, { status: 404 })
    }

    const admin = getAdmin()

    // ── Resolve the sponsorship by its token ──────────────────────
    const { data: sp, error: spErr } = await admin
      .from('sponsorships')
      .select('id, status')
      .eq('booking_token', token)
      .maybeSingle()
    // Declined / cancelled sponsorships: the link no longer works.
    if (spErr || !sp || !isSponsorPortalOpen(sp.status as string | null)) {
      return Response.json({ error: 'Sponsor not found' }, { status: 404 })
    }

    // ── Simple flood guard (per token and per IP) ─────────────────
    if (
      overLimit(`sponsor-submit:${sp.id}`, RATE_MAX, RATE_WINDOW_MS) ||
      overLimit(`sponsor-submit-ip:${clientIp(req)}`, RATE_MAX * 3, RATE_WINDOW_MS)
    ) {
      return Response.json(
        { error: 'Too many submissions — please wait a few minutes and try again.' },
        { status: 429 },
      )
    }

    // Refuse an oversized upload before parsing it, with the real reason.
    const declared = Number(req.headers.get('content-length') ?? 0)
    if (declared > MAX_BYTES + FORM_OVERHEAD_BYTES) {
      return Response.json({ error: TOO_LARGE }, { status: 413 })
    }

    // ── Parse the multipart form ──────────────────────────────────
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return Response.json({ error: 'Invalid form data' }, { status: 400 })
    }
    const deliverableId = String(form.get('deliverable_id') ?? '').trim()
    const note = String(form.get('note') ?? '').trim()
    if (note.length > MAX_NOTE) {
      return Response.json(
        { error: `Please keep the note under ${MAX_NOTE.toLocaleString('en-GB')} characters.` },
        { status: 400 },
      )
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliverableId) && deliverableId) {
      return Response.json({ error: 'Deliverable not found' }, { status: 404 })
    }
    const fileEntry = form.get('file')
    const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null

    if (!deliverableId) {
      return Response.json({ error: 'deliverable_id is required' }, { status: 400 })
    }
    if (!file && !note) {
      return Response.json({ error: 'Attach a file or add a note.' }, { status: 400 })
    }

    // ── SECURITY: the deliverable MUST belong to this sponsorship ──
    const { data: deliverable, error: dErr } = await admin
      .from('sponsor_deliverables')
      .select('id, sponsorship_id')
      .eq('id', deliverableId)
      .maybeSingle()
    if (dErr || !deliverable || deliverable.sponsorship_id !== sp.id) {
      // Do not leak whether the row exists — same 404 for missing/foreign.
      return Response.json({ error: 'Deliverable not found' }, { status: 404 })
    }

    // ── Optional file upload ──────────────────────────────────────
    const update: Record<string, unknown> = {
      submitted_at: new Date().toISOString(),
      status: 'received',
    }
    if (note) update.sponsor_note = note

    let storedName: string | null = null
    if (file) {
      if (file.size > MAX_BYTES) {
        return Response.json({ error: TOO_LARGE }, { status: 413 })
      }
      const { safe, ext } = safeFileName(file.name || 'upload')
      if (!ALLOWED_EXT.has(ext)) {
        return Response.json({ error: `Unsupported file type (.${ext}).` }, { status: 400 })
      }
      const path = `${sp.id}/${deliverableId}/${safe}`
      const bytes = Buffer.from(await file.arrayBuffer())
      if (!sniffMatches(ext, bytes)) {
        return Response.json(
          { error: `This file's contents don't match a .${ext} file. Please upload the original file.` },
          { status: 400 },
        )
      }
      const up = await admin.storage.from(BUCKET).upload(path, bytes, {
        cacheControl: '3600',
        upsert: true,
        // From the (checked) extension — never the client-supplied type.
        contentType: CONTENT_TYPES[ext],
      })
      if (up.error) {
        console.error('[sponsor/submit] upload failed:', up.error)
        return Response.json({ error: 'Upload failed — please try again.' }, { status: 502 })
      }
      update.file_path = path
      update.file_name = (file.name || safe).slice(0, 200)
      update.file_size = file.size
      storedName = file.name
    }

    const { error: upErr } = await admin
      .from('sponsor_deliverables')
      .update(update)
      .eq('id', deliverableId)
    if (upErr) {
      console.error('[sponsor/submit] update failed:', upErr)
      return Response.json({ error: 'Could not save your submission.' }, { status: 500 })
    }

    return Response.json({ ok: true, file_name: storedName })
  } catch (e) {
    console.error('[sponsor/submit] unhandled error:', e)
    return Response.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  }
}
