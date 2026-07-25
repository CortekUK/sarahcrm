// Template Graphics — render a template + values to a PNG and store it.
//
// POST /api/admin/marketing/graphics/render
//   body: { template_id?, template?, values, shape? }
//   → { graphic_url }
//
// Renders the template via next/og ImageResponse (satori) to a PNG buffer,
// uploads it to the PUBLIC 'social-graphics' bucket at a unique path, and
// returns the public URL. Admin-only. Never publishes anything.

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/marketing/admin'
import { renderTemplateToStorage } from '@/lib/marketing/graphics/store'
import { resolveTemplateFromBody, coerceValues, coerceShape } from '@/lib/marketing/graphics/resolve'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RenderBody {
  template_id?: string | null
  template?: unknown
  values?: unknown
  shape?: string | null
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: RenderBody
  try {
    body = (await req.json()) as RenderBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const template = await resolveTemplateFromBody(body)
  if (!template) return Response.json({ error: 'Template not found.' }, { status: 404 })

  const shape = coerceShape(body.shape, template.shape)
  const values = coerceValues(body.values)

  try {
    const { graphic_url, path } = await renderTemplateToStorage({
      template,
      values,
      shape,
      origin: req.nextUrl.origin,
    })
    return Response.json({ graphic_url, path })
  } catch (e) {
    console.error('[marketing/graphics/render] render/upload failed:', e)
    const message = e instanceof Error ? e.message : 'Render failed'
    return Response.json({ error: `Graphic render failed: ${message}` }, { status: 502 })
  }
}
