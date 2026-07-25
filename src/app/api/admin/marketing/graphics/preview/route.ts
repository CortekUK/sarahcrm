// Template Graphics — live preview image for the builder + list thumbnails.
//
// GET /api/admin/marketing/graphics/preview?state=<base64url JSON> | ?template_id=
//   → image/png (an ImageResponse the builder points an <img> at)
//
// `state` is a base64url-encoded { template, values?, shape? } captured live by
// the builder so the preview reflects unsaved edits. `template_id` renders a
// saved template (used for list thumbnails). Empty AI text slots are shown with
// placeholder copy so the layout reads. Admin-only (the <img> sends cookies).

import { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { requireAdmin } from '@/lib/marketing/admin'
import { renderGraphic } from '@/lib/marketing/graphics/render'
import {
  resolveTemplateFromBody,
  coerceValues,
  coerceShape,
  coerceTemplate,
} from '@/lib/marketing/graphics/resolve'
import { SHAPE_DIMS } from '@/lib/marketing/graphics/types'
import type { MarketingTemplate, SlotValues } from '@/lib/marketing/graphics/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Fill empty AI text slots + missing photos with placeholders so an unfilled
// template still renders a legible preview of its layout.
function withPlaceholders(template: MarketingTemplate, values: SlotValues): SlotValues {
  const slots = { ...(values.slots ?? {}) }
  for (const s of template.slots) {
    const cur = slots[s.id] ?? {}
    if (s.type === 'heading' && s.text_source === 'ai' && !cur.text?.trim()) {
      slots[s.id] = { ...cur, text: 'Your headline here' }
    } else if (s.type === 'subtext' && s.text_source === 'ai' && !cur.text?.trim()) {
      slots[s.id] = { ...cur, text: 'A supporting line the AI will write from your event or topic.' }
    } else if (s.type === 'photo' && !cur.photo_url?.trim()) {
      // leave empty — renderSlot skips it (no broken image in preview)
      slots[s.id] = cur
    }
  }
  return { ...values, slots }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  const templateId = url.searchParams.get('template_id')

  let template: MarketingTemplate | null = null
  let values: SlotValues = {}
  let shapeParam: string | null = null

  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'))
      template = coerceTemplate(decoded.template ?? decoded)
      values = coerceValues(decoded.values)
      shapeParam = decoded.shape ?? null
    } catch {
      return Response.json({ error: 'Invalid preview state.' }, { status: 400 })
    }
  } else if (templateId) {
    template = await resolveTemplateFromBody({ template_id: templateId })
  }

  if (!template) return Response.json({ error: 'Nothing to preview.' }, { status: 400 })

  const shape = coerceShape(shapeParam, template.shape)
  const dims = SHAPE_DIMS[shape]
  const filled = withPlaceholders(template, values)

  try {
    return new ImageResponse(renderGraphic({ template, values: filled, shape, origin: req.nextUrl.origin }), {
      width: dims.w,
      height: dims.h,
    })
  } catch (e) {
    console.error('[marketing/graphics/preview] render failed:', e)
    return Response.json({ error: 'Preview render failed.' }, { status: 502 })
  }
}
