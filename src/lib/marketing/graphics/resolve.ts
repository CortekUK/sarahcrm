// Template Graphics — shared server helpers for resolving a template + values
// out of a request body (used by the render + preview routes).

import { getAdmin } from '@/lib/marketing/admin'
import { GRAPHIC_SHAPES, BUILDER_SHAPES } from './types'
import type {
  GraphicShape,
  MarketingTemplate,
  TemplateSlot,
  TemplateBackground,
  SlotValues,
} from './types'

// satori (next/og ImageResponse) requires ABSOLUTE image URLs. Event photos are
// stored RELATIVE (e.g. "/gallery/bigland.png"), so normalise every image URL to
// absolute right before it reaches ImageResponse. Already-absolute (http/https)
// and data: URIs pass through unchanged; a leading-slash path is prefixed with
// the request origin; anything else is returned as-is (best-effort).
export function toAbsoluteUrl(url: string | null | undefined, origin?: string): string | null {
  if (!url) return null
  const u = url.trim()
  if (!u) return null
  if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u
  if (u.startsWith('/') && origin) return `${origin.replace(/\/$/, '')}${u}`
  return u
}

const SLOT_TYPES = new Set(['photo', 'heading', 'subtext', 'fixed'])
const ZONES = new Set(['top', 'middle', 'bottom'])
const ALIGNS = new Set(['left', 'center', 'right'])

// Defensive coercion of an untrusted slots array into TemplateSlot[].
export function coerceSlots(raw: unknown): TemplateSlot[] {
  if (!Array.isArray(raw)) return []
  const out: TemplateSlot[] = []
  raw.forEach((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>
    const type = String(o.type ?? '')
    if (!SLOT_TYPES.has(type)) return
    const style = (o.style ?? undefined) as Record<string, unknown> | undefined
    out.push({
      id: String(o.id ?? `s${i + 1}`),
      type: type as TemplateSlot['type'],
      zone: (ZONES.has(String(o.zone)) ? String(o.zone) : 'middle') as TemplateSlot['zone'],
      align: (ALIGNS.has(String(o.align)) ? String(o.align) : 'center') as TemplateSlot['align'],
      text_source: o.text_source === 'fixed' ? 'fixed' : 'ai',
      fixed_text: typeof o.fixed_text === 'string' ? o.fixed_text : undefined,
      style: style
        ? {
            font: style.font === 'serif' || style.font === 'sans' ? style.font : undefined,
            color: typeof style.color === 'string' ? style.color : undefined,
            size: typeof style.size === 'number' ? style.size : undefined,
          }
        : undefined,
    })
  })
  return out
}

export function coerceBackground(raw: unknown): TemplateBackground {
  const o = (raw ?? {}) as Record<string, unknown>
  if (o.type === 'photo') return { type: 'photo', value: String(o.value ?? '') }
  return { type: 'color', value: typeof o.value === 'string' ? o.value : '#211D19' }
}

export function coerceShape(raw: unknown, fallback: GraphicShape = 'square'): GraphicShape {
  const s = String(raw ?? '')
  return (GRAPHIC_SHAPES as readonly string[]).includes(s) ? (s as GraphicShape) : fallback
}

export function coerceTemplate(raw: unknown): MarketingTemplate {
  const o = (raw ?? {}) as Record<string, unknown>
  return {
    id: String(o.id ?? 'inline'),
    name: String(o.name ?? 'Untitled'),
    shape: coerceShape(o.shape),
    background: coerceBackground(o.background),
    slots: coerceSlots(o.slots),
  }
}

export function coerceValues(raw: unknown): SlotValues {
  const o = (raw ?? {}) as Record<string, unknown>
  const slots: Record<string, { text?: string; photo_url?: string }> = {}
  const rawSlots = (o.slots ?? {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(rawSlots)) {
    const sv = (v ?? {}) as Record<string, unknown>
    slots[k] = {
      text: typeof sv.text === 'string' ? sv.text : undefined,
      photo_url: typeof sv.photo_url === 'string' ? sv.photo_url : undefined,
    }
  }
  return {
    slots,
    background_photo_url:
      typeof o.background_photo_url === 'string' ? o.background_photo_url : null,
  }
}

// Resolve the template to render from a request body: an explicit inline
// `template` wins; otherwise `template_id` is looked up via the service-role
// client. Returns null if neither resolves.
export async function resolveTemplateFromBody(body: {
  template_id?: string | null
  template?: unknown
}): Promise<MarketingTemplate | null> {
  if (body.template) return coerceTemplate(body.template)
  if (body.template_id) {
    const admin = getAdmin()
    const { data } = await admin
      .from('marketing_templates')
      .select('id, name, shape, background, slots')
      .eq('id', body.template_id)
      .maybeSingle()
    if (data) {
      return {
        id: data.id as string,
        name: data.name as string,
        shape: coerceShape(data.shape),
        background: coerceBackground(data.background),
        slots: coerceSlots(data.slots),
      }
    }
  }
  return null
}

export { GRAPHIC_SHAPES, BUILDER_SHAPES }
