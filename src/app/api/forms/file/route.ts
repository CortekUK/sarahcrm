// GET /api/forms/file?path=<form-uploads path>
//
// ADMIN ONLY. Returns a short-lived (5 min) signed URL for a
// website-form attachment stored in the PRIVATE `form-uploads` bucket (see
// /api/forms/upload). The admin Enquiries "Form details" block calls this
// when a file link is clicked, so attachments are never public by URL.
//
// Returns: { ok: true, url } or { ok: false, error }

import { NextRequest } from 'next/server'
import { getAdmin, requireAdmin } from '@/lib/marketing/admin'
import { FORM_UPLOAD_BUCKET, FORM_UPLOAD_PATH_RE } from '@/components/website/forms/sources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ ok: false, error: auth.error }, { status: auth.status })

  const path = req.nextUrl.searchParams.get('path') ?? ''
  if (!FORM_UPLOAD_PATH_RE.test(path) || path.includes('..')) {
    return Response.json({ ok: false, error: 'Unknown file.' }, { status: 400 })
  }

  const admin = getAdmin()
  const { data, error } = await admin.storage
    .from(FORM_UPLOAD_BUCKET)
    // No `download` option: PDFs open in the browser tab; Word/Excel/
    // PowerPoint files still download, as browsers can't display them.
    .createSignedUrl(path, 300)
  if (error || !data?.signedUrl) {
    if (error) console.error('[forms/file] signed URL failed:', error)
    return Response.json({ ok: false, error: 'File not found.' }, { status: 404 })
  }
  return Response.json({ ok: true, url: data.signedUrl })
}
