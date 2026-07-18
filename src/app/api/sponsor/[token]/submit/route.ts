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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'sponsor-assets'
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB
const ALLOWED_EXT = new Set([
  'pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
  'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'ai', 'eps', 'zip',
])

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
      .select('id')
      .eq('booking_token', token)
      .maybeSingle()
    if (spErr || !sp) return Response.json({ error: 'Sponsor not found' }, { status: 404 })

    // ── Parse the multipart form ──────────────────────────────────
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return Response.json({ error: 'Invalid form data' }, { status: 400 })
    }
    const deliverableId = String(form.get('deliverable_id') ?? '').trim()
    const note = String(form.get('note') ?? '').trim()
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
        return Response.json({ error: 'File too large (max 15 MB).' }, { status: 400 })
      }
      const { safe, ext } = safeFileName(file.name || 'upload')
      if (!ALLOWED_EXT.has(ext)) {
        return Response.json({ error: `Unsupported file type (.${ext}).` }, { status: 400 })
      }
      const path = `${sp.id}/${deliverableId}/${safe}`
      const bytes = Buffer.from(await file.arrayBuffer())
      const up = await admin.storage.from(BUCKET).upload(path, bytes, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || undefined,
      })
      if (up.error) {
        return Response.json({ error: `Upload failed: ${up.error.message}` }, { status: 502 })
      }
      update.file_path = path
      update.file_name = file.name
      update.file_size = file.size
      storedName = file.name
    }

    const { error: upErr } = await admin
      .from('sponsor_deliverables')
      .update(update)
      .eq('id', deliverableId)
    if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

    return Response.json({ ok: true, file_name: storedName })
  } catch (e) {
    console.error('[sponsor/submit] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
