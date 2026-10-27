// Template Graphics — render a template+values to a PNG and store it in the
// public 'social-graphics' bucket. Shared by the render route and the
// generation pipeline so both produce identically-stored graphics.

import { ImageResponse } from 'next/og'
import { getAdmin } from '@/lib/marketing/admin'
import sharp from 'sharp'
import { renderGraphic } from './render'
import { SHAPE_DIMS } from './types'
import type { GraphicShape, MarketingTemplate, SlotValues } from './types'
import { exifOrientation, fetchImageSafely, prepareRenderInputs } from './image-prep'

const BUCKET = 'social-graphics'
// Where "use image as-is" upright/cropped copies go — the same bucket/folder
// the approval-queue MediaPicker uploads to.
const AS_IS_BUCKET = 'gallery'
const AS_IS_FOLDER = 'marketing'

export async function renderTemplateToStorage(args: {
  template: MarketingTemplate
  values: SlotValues
  shape: GraphicShape
  origin?: string
}): Promise<{ graphic_url: string; path: string }> {
  const { template, values, shape, origin } = args
  const dims = SHAPE_DIMS[shape] ?? SHAPE_DIMS.square

  // Upright (EXIF auto-orient) + canvas-sized photos as data: URIs — satori
  // ignores EXIF, so phone photos would otherwise render sideways.
  const prepared = await prepareRenderInputs({ template, values, shape, origin })

  const image = new ImageResponse(
    renderGraphic({ template: prepared.template, values: prepared.values, shape, origin }),
    { width: dims.w, height: dims.h },
  )
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

// "Use image as-is": make sure the raw image is posted UPRIGHT (and, for a
// carousel slide, at the carousel's aspect ratio).
//   * no `shape`: if the image's EXIF orientation isn't 1, write an upright
//     copy (full resolution, JPEG q90) to gallery/marketing and return its
//     URL; otherwise return the original URL untouched.
//   * with `shape`: always auto-orient + centre-crop to that shape's exact
//     dims (Instagram carousels need every slide at the same ratio) and
//     write a new copy (unique URL per slide).
export async function orientImageToStorage(args: {
  url: string
  shape?: GraphicShape | null
  origin?: string
}): Promise<{ url: string; changed: boolean; orientation: number }> {
  const src = await fetchImageSafely(args.url, args.origin)
  const orientation = await exifOrientation(src)
  const dims = args.shape ? SHAPE_DIMS[args.shape] : null

  let pipeline = sharp(src, { failOn: 'none', limitInputPixels: 120_000_000 }).rotate()
  if (dims) {
    // Always a fresh copy per slide, even if the source is already the right
    // size: every carousel slide then has its OWN URL, so two slides using
    // the same photo are never collapsed by the publisher's URL de-dupe.
    pipeline = pipeline.resize({ width: dims.w, height: dims.h, fit: 'cover', position: 'centre' })
  } else if (orientation === 1) {
    return { url: args.url, changed: false, orientation }
  }
  const out = await pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer()

  const admin = getAdmin()
  const path = `${AS_IS_FOLDER}/${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${dims ? 'slide' : 'upright'}.jpg`
  const { error } = await admin.storage.from(AS_IS_BUCKET).upload(path, out, {
    contentType: 'image/jpeg',
    upsert: false,
    cacheControl: '31536000',
  })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  const { data } = admin.storage.from(AS_IS_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, changed: true, orientation }
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
