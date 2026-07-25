// Template Graphics — render a template+values to a PNG and store it in the
// public 'social-graphics' bucket. Shared by the render route and the
// generation pipeline so both produce identically-stored graphics.

import { ImageResponse } from 'next/og'
import { getAdmin } from '@/lib/marketing/admin'
import { renderGraphic } from './render'
import { SHAPE_DIMS } from './types'
import type { GraphicShape, MarketingTemplate, SlotValues } from './types'

const BUCKET = 'social-graphics'

export async function renderTemplateToStorage(args: {
  template: MarketingTemplate
  values: SlotValues
  shape: GraphicShape
  origin?: string
}): Promise<{ graphic_url: string; path: string }> {
  const { template, values, shape, origin } = args
  const dims = SHAPE_DIMS[shape] ?? SHAPE_DIMS.square

  const image = new ImageResponse(renderGraphic({ template, values, shape, origin }), {
    width: dims.w,
    height: dims.h,
  })
  const buffer = Buffer.from(await image.arrayBuffer())

  const admin = getAdmin()
  const path = `renders/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'image/png',
    upsert: false,
    cacheControl: '31536000',
  })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
  return { graphic_url: data.publicUrl, path }
}

// Build slot_values for a template from AI-written text + a chosen photo:
//   - AI heading slots  ← heading
//   - AI subtext slots  ← subtext
//   - photo slots       ← photoUrl
//   - background photo  ← photoUrl (when the template background is a photo)
// Fixed slots keep their template fixed_text (not stored per-post).
export function buildSlotValues(
  template: MarketingTemplate,
  ai: { heading: string; subtext: string },
  photoUrl: string | null,
): SlotValues {
  const slots: Record<string, { text?: string; photo_url?: string }> = {}
  for (const s of template.slots) {
    if (s.type === 'heading' && s.text_source === 'ai') slots[s.id] = { text: ai.heading }
    else if (s.type === 'subtext' && s.text_source === 'ai') slots[s.id] = { text: ai.subtext }
    else if (s.type === 'photo' && photoUrl) slots[s.id] = { photo_url: photoUrl }
  }
  return {
    slots,
    background_photo_url: template.background.type === 'photo' ? photoUrl : null,
  }
}
