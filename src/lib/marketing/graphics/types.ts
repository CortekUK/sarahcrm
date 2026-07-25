// Template Graphics — shared types + brand constants.
//
// Pure data (no server-only imports) so it is safe to import from both the
// API routes (render/preview/templates/generate) and the client builder UI.

export const GRAPHIC_SHAPES = ['square', 'portrait', 'landscape'] as const
export type GraphicShape = (typeof GRAPHIC_SHAPES)[number]

// Locked shapes. Landscape is structured-for (a parameter everywhere) but not
// surfaced in the builder UI yet — adding it later needs no code changes.
export const SHAPE_DIMS: Record<GraphicShape, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  landscape: { w: 1200, h: 627 },
}

export const SHAPE_LABELS: Record<GraphicShape, string> = {
  square: 'Square · 1080×1080',
  portrait: 'Portrait / Story · 1080×1350',
  landscape: 'Landscape · 1200×627',
}

// Shapes offered in the builder today (landscape deferred).
export const BUILDER_SHAPES: GraphicShape[] = ['square', 'portrait']

// Fixed brand palette for the RENDERED graphic (NOT app theme tokens).
export const BRAND = {
  cream: '#F7F3EA',
  gold: '#B8975A',
  warmBlack: '#2C2825',
  dark: '#211D19',
} as const

export const BRAND_SWATCHES: { label: string; value: string }[] = [
  { label: 'Cream', value: BRAND.cream },
  { label: 'Gold', value: BRAND.gold },
  { label: 'Warm black', value: BRAND.warmBlack },
  { label: 'Dark', value: BRAND.dark },
]

// Email-safe / system stacks only — no external font CDNs (CSP blocks them).
// NOTE: satori (next/og) renders from bundled font data, which today is only
// Noto Sans. Both stacks therefore resolve to that one face when rendering;
// the choice is stored so a future registered serif is honoured. Visual
// hierarchy is carried by size / letter-spacing / colour rather than weight.
export const FONT_CHOICES = ['serif', 'sans'] as const
export type FontChoice = (typeof FONT_CHOICES)[number]

export const FONT_STACKS: Record<FontChoice, string> = {
  serif: "Georgia, 'Times New Roman', 'Noto Sans', serif",
  sans: "Helvetica, Arial, 'Noto Sans', sans-serif",
}

export type SlotType = 'photo' | 'heading' | 'subtext' | 'fixed'
export type SlotZone = 'top' | 'middle' | 'bottom'
export type SlotAlign = 'left' | 'center' | 'right'
export type TextSource = 'ai' | 'fixed'

export interface SlotStyle {
  font?: FontChoice
  color?: string
  size?: number
}

export interface TemplateSlot {
  id: string
  type: SlotType
  zone: SlotZone
  align: SlotAlign
  text_source: TextSource
  fixed_text?: string
  style?: SlotStyle
}

export type TemplateBackground =
  | { type: 'color'; value: string }
  | { type: 'photo'; value: string }

export interface MarketingTemplate {
  id: string
  name: string
  shape: GraphicShape
  background: TemplateBackground
  slots: TemplateSlot[]
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

// The per-slot filled values persisted on a marketing_asset (slot_values).
//   slots[slotId] = { text?, photo_url? }
//   background_photo_url = the chosen photo when background.type === 'photo'
export interface SlotValues {
  slots?: Record<string, { text?: string; photo_url?: string }>
  background_photo_url?: string | null
  // "Use image as-is (no text overlay)": when true, the asset's graphic_url is a
  // raw image chosen by the admin (an already-designed flyer/collage) — NOT a
  // rendered template. as_is_url is that raw image. No renderer, no overlay.
  as_is?: boolean
  as_is_url?: string
}

// The locked brand line always rendered on every graphic.
export const BRAND_LINE = 'THE CLUB'
export const BRAND_SUBLINE = 'by Sarah Restrick'
