// Template Graphics — make a "use image as-is" photo safe to post.
//
// POST /api/admin/marketing/graphics/orient
//   body: { url, shape? }
//   → { url, changed, orientation }
//
// Phone photos carry an EXIF Orientation tag; browsers honour it but not
// every consumer does. Without `shape`, an image whose orientation isn't 1 is
// rotated upright (sharp auto-orient) and the copy is written to
// gallery/marketing; an already-upright image comes back unchanged. With
// `shape` (Instagram carousel slides), the image is also centre-cropped to
// that shape's exact dims so every slide shares one aspect ratio.
// The URL is fetched with the SSRF guard in image-prep.ts. Admin-only.
// Node runtime (sharp is native).

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/marketing/admin'
import { orientImageToStorage } from '@/lib/marketing/graphics/store'
import { coerceShape } from '@/lib/marketing/graphics/resolve'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: { url?: unknown; shape?: unknown }
  try {
    body = (await req.json()) as { url?: unknown; shape?: unknown }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url) return Response.json({ error: 'url is required.' }, { status: 400 })
  const shape = body.shape ? coerceShape(body.shape, 'portrait') : null

  try {
    const result = await orientImageToStorage({ url, shape, origin: req.nextUrl.origin })
    return Response.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Image processing failed'
    console.error('[marketing/graphics/orient] failed:', message)
    return Response.json({ error: message }, { status: 422 })
  }
}
