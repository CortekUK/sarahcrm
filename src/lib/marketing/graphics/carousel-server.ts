// Server-side Instagram carousel video checks — used by the asset route on
// save + approve. Re-runs the shared rules from ./carousel.ts with what the
// server can verify itself: a HEAD request per video (content type + size),
// plus the duration / dimensions the editor stored on the slide.

import {
  carouselVideoProblems,
  coerceSlides,
  hasCarouselVideoExtension,
  isVideoSlide,
} from './carousel'
import type { CarouselSlide } from './types'

const HEAD_TIMEOUT_MS = 6_000

export async function headFacts(url: string): Promise<{ mime: string | null; size_bytes: number | null }> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(HEAD_TIMEOUT_MS), cache: 'no-store' })
    if (!res.ok) return { mime: null, size_bytes: null }
    const len = Number(res.headers.get('content-length'))
    return { mime: res.headers.get('content-type'), size_bytes: Number.isFinite(len) && len > 0 ? len : null }
  } catch {
    return { mime: null, size_bytes: null }
  }
}

/**
 * Problems with the stored slides alone (no network) — for 'save'. Only READY
 * video slides (rendered_url set) are checked; a not-ready slide is simply
 * left out of the post.
 */
export function storedSlideProblems(rawSlides: unknown): string[] {
  const slides = coerceSlides(rawSlides)
  const out: string[] = []
  slides.forEach((s, i) => {
    if (!isVideoSlide(s) || !s.rendered_url) return
    for (const p of carouselVideoProblems({ url: s.rendered_url, ...s })) out.push(`Slide ${i + 1}: ${p}`)
  })
  return out
}

/**
 * Full check before APPROVE: every media item that is a video (a video slide's
 * URL, or a .mp4/.mov/.m4v link) must be an MP4/MOV (by extension or by the
 * server's Content-Type), within the size cap, and — when the editor recorded
 * them — within the duration / aspect limits.
 */
export async function carouselMediaProblems(media: string[], rawSlides: unknown): Promise<string[]> {
  const slides = coerceSlides(rawSlides)
  const videoSlideByUrl = new Map<string, CarouselSlide>()
  for (const s of slides) if (isVideoSlide(s) && s.rendered_url) videoSlideByUrl.set(s.rendered_url, s)

  const checks = media.map(async (url, i) => {
    const slide = videoSlideByUrl.get(url)
    if (!slide && !hasCarouselVideoExtension(url)) return [] as string[]
    const head = await headFacts(url)
    const problems = carouselVideoProblems({
      url,
      mime: head.mime,
      size_bytes: head.size_bytes ?? slide?.size_bytes ?? null,
      duration_s: slide?.duration_s ?? null,
      width: slide?.width ?? null,
      height: slide?.height ?? null,
    })
    return problems.map((p) => `Slide ${i + 1}: ${p}`)
  })
  return (await Promise.all(checks)).flat()
}
