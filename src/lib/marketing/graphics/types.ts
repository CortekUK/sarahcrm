// Template Graphics — shared types + brand constants.
//
// Pure data (no server-only imports) so it is safe to import from both the
// API routes (render/preview/templates/generate) and the client builder UI.

export const GRAPHIC_SHAPES = ['square', 'portrait', 'landscape', 'story'] as const
export type GraphicShape = (typeof GRAPHIC_SHAPES)[number]

// Locked shapes. Landscape is structured-for (a parameter everywhere) but not
// surfaced in the builder UI yet — adding it later needs no code changes.
// 'story' (9:16, 1080×1920) is a RENDER-TIME shape only: it is never stored
// on a template (marketing_templates.shape CHECK has no 'story', and it is
// not in BUILDER_SHAPES). The approval queue passes shape 'story' to the
// render route for TikTok assets so any template renders vertically.
export const SHAPE_DIMS: Record<GraphicShape, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  landscape: { w: 1200, h: 627 },
  story: { w: 1080, h: 1920 },
}

export const SHAPE_LABELS: Record<GraphicShape, string> = {
  square: 'Square · 1080×1080',
  portrait: 'Portrait / Story · 1080×1350',
  landscape: 'Landscape · 1200×627',
  story: 'Vertical 9:16 · 1080×1920',
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
  // Instagram carousel only (channel 'instagram_carousel'). One entry per
  // slide, in posting order. All slides share the asset's template_id and
  // carousel_shape (Instagram needs one aspect ratio across a carousel).
  // The rendered PNGs are ALSO mirrored where the publisher reads them:
  // slide 1 → asset.graphic_url, slides 2..n → publish_target.media_urls.
  slides?: CarouselSlide[]
  carousel_shape?: GraphicShape
}

// One Instagram carousel slide (see SlotValues.slides).
//   heading / subtext — the on-image text for this slide (AI-written, editable)
//   photo_url         — the photo picked for this slide (null = none yet)
//   as_is             — post photo_url as-is (centre-cropped to the carousel
//                       shape), no template overlay
//   rendered_url      — the finished media for this slide (rendered template
//                       PNG, the cropped as-is copy, or — for a video slide —
//                       the video URL itself); null = not ready
//   media_type        — 'image' (default; slides saved before videos existed
//                       have no media_type and are images) or 'video'. A video
//                       slide is posted as-is: no template, heading/subtext or
//                       crop; photo_url holds the video URL and rendered_url
//                       mirrors it once it passes the carousel video checks.
//   duration_s / width / height / size_bytes — video metadata read in the
//                       browser when the video is picked (null = unknown);
//                       used by the client + server carousel video checks.
export type CarouselSlideMediaType = 'image' | 'video'

export interface CarouselSlide {
  heading: string
  subtext: string
  photo_url: string | null
  as_is: boolean
  rendered_url?: string | null
  media_type?: CarouselSlideMediaType
  duration_s?: number | null
  width?: number | null
  height?: number | null
  size_bytes?: number | null
}

// Instagram carousel limits.
export const CAROUSEL_MAX_SLIDES = 10
export const CAROUSEL_MIN_SLIDES = 2

// Instagram carousel VIDEO limits (Instagram API via Metricool) — see
// docs/MARKETING-AI-ENGINE.md "Carousel videos" for the sources.
//   - MP4 / MOV (M4V = MP4) only; MP4 recommended (Metricool converts MOV).
//   - 3 s minimum, 60 s maximum (Metricool can't auto-publish a carousel with
//     a video over 60 s).
//   - 100 MB per video: Instagram's API carousel-video cap is the strictest
//     figure published (Metricool's general video page says 500 MB) — we take
//     the lower one so a post never bounces at Instagram.
//   - Aspect ratio between 4:5 (0.8) and 16:9 (1.78).
export const CAROUSEL_VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v'] as const
export const CAROUSEL_VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/x-m4v'] as const
export const CAROUSEL_VIDEO_MIN_S = 3
export const CAROUSEL_VIDEO_MAX_S = 60
export const CAROUSEL_VIDEO_MAX_MB = 100
export const CAROUSEL_VIDEO_MAX_BYTES = CAROUSEL_VIDEO_MAX_MB * 1024 * 1024
export const CAROUSEL_VIDEO_MIN_RATIO = 4 / 5
export const CAROUSEL_VIDEO_MAX_RATIO = 16 / 9

// All carousel slides use the template's shape, except landscape (Instagram
// carousels look best tall; 1.91:1 is cramped) → forced to portrait 4:5.
// No template → portrait.
export function carouselShapeFor(templateShape?: GraphicShape | null): GraphicShape {
  return templateShape === 'square' ? 'square' : 'portrait'
}

// The locked brand line always rendered on every graphic.
export const BRAND_LINE = 'THE CLUB'
export const BRAND_SUBLINE = 'by Sarah Restrick'
