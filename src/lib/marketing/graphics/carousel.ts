// Instagram carousel helpers — pure (no server imports), shared by the
// generate route, the asset route and the approval-queue editor.

import {
  CAROUSEL_MAX_SLIDES,
  CAROUSEL_VIDEO_EXTENSIONS,
  CAROUSEL_VIDEO_MAX_BYTES,
  CAROUSEL_VIDEO_MAX_MB,
  CAROUSEL_VIDEO_MAX_RATIO,
  CAROUSEL_VIDEO_MAX_S,
  CAROUSEL_VIDEO_MIMES,
  CAROUSEL_VIDEO_MIN_RATIO,
  CAROUSEL_VIDEO_MIN_S,
} from './types'
import type { CarouselSlide, GraphicShape } from './types'

// "Slide 1: …", "**Slide 2** - …", "Slide 3 — …"
const SLIDE_LINE = /^\s*[*_]*\s*slide\s*(\d+)\s*[*_]*\s*[:.\-–—]\s*[*_]*\s*(.*)$/i
// A "Caption:" label at the start of a line (optionally bold).
const CAPTION_LABEL = /^\s*[*_]*\s*caption\s*[*_]*\s*:\s*[*_]*\s*/i

function clean(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Split one slide line into an on-image heading + subtext.
// "Heading — supporting line" / "Heading: supporting" / "Heading. More." /
// otherwise the whole line is the heading.
function splitSlideText(text: string): { heading: string; subtext: string } {
  const t = clean(text)
  for (const sep of [' — ', ' – ', ' - ', ': ']) {
    const i = t.indexOf(sep)
    if (i >= 2 && i <= 90 && t.slice(i + sep.length).trim()) {
      return { heading: t.slice(0, i).trim(), subtext: t.slice(i + sep.length).trim() }
    }
  }
  const sentence = t.match(/^(.{2,90}?[.!?])\s+(.+)$/)
  if (sentence) return { heading: sentence[1].trim(), subtext: sentence[2].trim() }
  return { heading: t, subtext: '' }
}

/**
 * Pull legacy "Slide n: …" lines out of a carousel body.
 *   slides  — one per "Slide n:" line, in order (heading/subtext split)
 *   caption — the body with the slide lines AND the "Caption:" label removed
 *   hadScaffolding — true if anything was stripped (body needs re-saving)
 */
export function parseCarouselBody(body: string | null | undefined): {
  slides: { heading: string; subtext: string }[]
  caption: string
  hadScaffolding: boolean
} {
  const lines = (body ?? '').split('\n')
  const slides: { heading: string; subtext: string }[] = []
  const keep: string[] = []
  let hadScaffolding = false
  for (const line of lines) {
    const m = line.match(SLIDE_LINE)
    if (m) {
      hadScaffolding = true
      const text = m[2] ?? ''
      if (clean(text)) slides.push(splitSlideText(text))
      continue
    }
    if (CAPTION_LABEL.test(line)) {
      hadScaffolding = true
      keep.push(line.replace(CAPTION_LABEL, ''))
      continue
    }
    keep.push(line)
  }
  const caption = keep
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { slides: slides.slice(0, CAROUSEL_MAX_SLIDES), caption, hadScaffolding }
}

/** Defensive coercion of stored slot_values.slides into CarouselSlide[]. */
export function coerceSlides(raw: unknown): CarouselSlide[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, CAROUSEL_MAX_SLIDES).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>
    return {
      heading: typeof o.heading === 'string' ? o.heading : '',
      subtext: typeof o.subtext === 'string' ? o.subtext : '',
      photo_url: typeof o.photo_url === 'string' && o.photo_url.trim() ? o.photo_url : null,
      as_is: o.as_is === true,
      rendered_url: typeof o.rendered_url === 'string' && o.rendered_url.trim() ? o.rendered_url : null,
      // Old slides have no media_type → image.
      media_type: o.media_type === 'video' ? 'video' : 'image',
      duration_s: positiveOrNull(o.duration_s),
      width: positiveOrNull(o.width),
      height: positiveOrNull(o.height),
      size_bytes: positiveOrNull(o.size_bytes),
    }
  })
}

function positiveOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

/** AI slide text → fresh (unrendered, photo-less) slides. */
export function slidesFromText(items: { heading: string; subtext: string }[]): CarouselSlide[] {
  return items
    .map((s) => ({ heading: clean(s.heading ?? ''), subtext: clean(s.subtext ?? '') }))
    .filter((s) => s.heading || s.subtext)
    .slice(0, CAROUSEL_MAX_SLIDES)
    .map((s) => ({ ...s, photo_url: null, as_is: false, rendered_url: null, media_type: 'image' as const }))
}

/**
 * The carousel's publishable media in slide order: [graphic_url, ...media_urls]
 * — exactly what MetricoolPublisher sends. Used for the "≥ 2 slides" gate.
 */
export function carouselMedia(
  graphicUrl: string | null | undefined,
  publishTarget: Record<string, unknown> | null | undefined,
): string[] {
  const extra = Array.isArray(publishTarget?.media_urls)
    ? (publishTarget!.media_urls as unknown[]).filter(
        (u): u is string => typeof u === 'string' && !!u.trim(),
      )
    : []
  return [...(graphicUrl && graphicUrl.trim() ? [graphicUrl] : []), ...extra]
}

// ── Video slides ────────────────────────────────────────────────────────────

export function isVideoSlide(slide: Pick<CarouselSlide, 'media_type'>): boolean {
  return slide.media_type === 'video'
}

/** File extension of a URL's path (query/hash ignored), lower-case, or ''. */
export function urlExtension(url: string | null | undefined): string {
  if (!url) return ''
  let path = url
  try {
    path = new URL(url).pathname
  } catch {
    path = url.split(/[?#]/)[0]
  }
  const m = path.match(/\.([a-z0-9]{2,5})$/i)
  return m ? m[1].toLowerCase() : ''
}

/** True when the URL ends in .mp4 / .mov / .m4v (Instagram carousel video formats). */
export function hasCarouselVideoExtension(url: string | null | undefined): boolean {
  return (CAROUSEL_VIDEO_EXTENSIONS as readonly string[]).includes(urlExtension(url))
}

/** True for video/mp4, video/quicktime, video/x-m4v (parameters ignored). */
export function isCarouselVideoMime(mime: string | null | undefined): boolean {
  const m = (mime ?? '').split(';')[0].trim().toLowerCase()
  return (CAROUSEL_VIDEO_MIMES as readonly string[]).includes(m)
}

export interface CarouselVideoFacts {
  url: string | null
  /** Content type if known (upload / HEAD); null = unknown. */
  mime?: string | null
  duration_s?: number | null
  width?: number | null
  height?: number | null
  size_bytes?: number | null
}

function fmtSeconds(s: number): string {
  return s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`
}

function fmtMB(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/**
 * Instagram carousel video checks for ONE video. Returns human-readable
 * problems (empty = OK). Unknown facts (null) are not held against the video
 * — the browser reads duration/size when it's picked; the server re-checks
 * type + size with a HEAD request.
 */
// BLOCKING problems only — things that make the post fail for certain (no
// link, not a video file Instagram takes). Everything Instagram/Metricool
// merely advise against (length, size, shape) is a warning the admin may
// override — see carouselVideoWarnings.
export function carouselVideoProblems(v: CarouselVideoFacts): string[] {
  const problems: string[] = []
  if (!v.url) return ['Pick a video for this slide.']
  if (!/^https?:\/\//i.test(v.url)) problems.push('The video needs a public https link.')
  const typeOk = hasCarouselVideoExtension(v.url) || isCarouselVideoMime(v.mime)
  if (!typeOk) {
    problems.push('Instagram carousels only take MP4 or MOV videos (.mp4, .mov, .m4v).')
  }
  return problems
}

// Non-blocking advice: the slide still goes out, but Instagram may crop it or
// Metricool may refuse to auto-publish it.
export function carouselVideoWarnings(v: CarouselVideoFacts): string[] {
  const warnings: string[] = []
  if (v.size_bytes != null && v.size_bytes > CAROUSEL_VIDEO_MAX_BYTES) {
    warnings.push(
      `Video is ${fmtMB(v.size_bytes)} — Instagram recommends at most ${CAROUSEL_VIDEO_MAX_MB} MB for carousel videos, so publishing may fail.`,
    )
  }
  if (v.duration_s != null) {
    if (v.duration_s < CAROUSEL_VIDEO_MIN_S - 0.05) {
      warnings.push(
        `Video is ${fmtSeconds(v.duration_s)} — Instagram expects carousel videos of at least ${CAROUSEL_VIDEO_MIN_S} seconds, so publishing may fail.`,
      )
    } else if (v.duration_s > CAROUSEL_VIDEO_MAX_S + 0.5) {
      warnings.push(
        `Video is ${fmtSeconds(v.duration_s)} — Metricool can't auto-publish carousel videos over ${CAROUSEL_VIDEO_MAX_S} seconds; you may need to publish it from the Metricool app.`,
      )
    }
  }
  if (v.width && v.height) {
    const r = v.width / v.height
    if (r < CAROUSEL_VIDEO_MIN_RATIO - 0.01 || r > CAROUSEL_VIDEO_MAX_RATIO + 0.01) {
      warnings.push(
        `Video is ${v.width}×${v.height} (${ratioLabel(r)}) — outside Instagram's 4:5–16:9 carousel range, so Instagram will crop it.`,
      )
    }
  }
  return warnings
}

/** Aspect ratio (w/h) of a ready slide: the carousel shape for images, the video's own for videos. */
export function slideAspectRatio(slide: CarouselSlide, shape: GraphicShape): number | null {
  if (isVideoSlide(slide)) {
    return slide.width && slide.height ? slide.width / slide.height : null
  }
  return shape === 'square' ? 1 : shape === 'portrait' ? 4 / 5 : shape === 'landscape' ? 1.91 : 4 / 5
}

/** "4:5", "1:1", "16:9", or "1.33:1". */
export function ratioLabel(r: number): string {
  const known: [number, string][] = [
    [4 / 5, '4:5'],
    [1, '1:1'],
    [16 / 9, '16:9'],
    [9 / 16, '9:16'],
    [1.91, '1.91:1'],
    [4 / 3, '4:3'],
    [3 / 4, '3:4'],
  ]
  for (const [v, label] of known) if (Math.abs(v - r) < 0.02) return label
  return `${r.toFixed(2)}:1`
}

/**
 * All carousel problems, for the editor and the asset route:
 *   slideErrors[i] — blocking problems with slide i (video checks)
 *   warnings       — non-blocking (video length/size/shape advice, mixed aspect ratios)
 * Only READY slides (rendered_url set) count towards the ratio warning.
 */
export function carouselIssues(
  slides: CarouselSlide[],
  shape: GraphicShape,
): { slideErrors: string[][]; warnings: string[] } {
  const slideErrors = slides.map((s) =>
    isVideoSlide(s) && s.photo_url
      ? carouselVideoProblems({
          url: s.photo_url,
          duration_s: s.duration_s,
          width: s.width,
          height: s.height,
          size_bytes: s.size_bytes,
        })
      : [],
  )
  const warnings: string[] = []
  slides.forEach((s, i) => {
    if (!isVideoSlide(s) || !s.photo_url) return
    for (const w of carouselVideoWarnings({
      url: s.photo_url,
      duration_s: s.duration_s,
      width: s.width,
      height: s.height,
      size_bytes: s.size_bytes,
    }))
      warnings.push(`Slide ${i + 1}: ${w}`)
  })
  const ready = slides
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !!s.rendered_url)
  if (ready.length >= 2) {
    const first = slideAspectRatio(ready[0].s, shape)
    if (first) {
      const off = ready
        .slice(1)
        .filter(({ s }) => {
          const r = slideAspectRatio(s, shape)
          return r != null && Math.abs(r - first) / first > 0.02
        })
        .map(({ i }) => i + 1)
      if (off.length) {
        warnings.push(
          `Slide${off.length === 1 ? '' : 's'} ${off.join(', ')} ${off.length === 1 ? 'has' : 'have'} a different shape from slide ${ready[0].i + 1} (${ratioLabel(first)}). Instagram crops every item in a carousel to the first item's ratio, so the edges will be cut off.`,
        )
      }
    }
  }
  return { slideErrors, warnings }
}
