// Instagram Reel helpers — pure (no server imports), shared by the generate
// route, the asset route, the publisher and the approval-queue editor.
//
// A reel is ONE video (publish_target.video_url) + the caption (body), with
// an optional cover image (publish_target.cover_url → Metricool's
// videoThumbnailUrl). Old reel drafts may still carry an image graphic
// (graphic_url) from the template era — it is never posted with a reel.
//
// Limits — see docs/MARKETING-AI-ENGINE.md "Instagram Reels" for the sources:
//   - MP4 / MOV only (M4V = MP4). Anything else fails for certain → BLOCKING.
//   - 3 s – 15 min (Meta + Metricool).
//   - 300 MB (Meta's Reels spec; Metricool says 500 MB — we warn at the
//     lower figure; our uploads cap at 500 MB).
//   - 9:16 recommended (anything else is cropped / letter-boxed).
//   - At most 1920 px wide.
//   - H.264 + AAC, 23–60 fps, ≤ 25 Mbps. Metricool: HEVC and iPhone HDR
//     can't be auto-published. The browser can't read the codec, so this is
//     advice (and a warning when the browser can't read the file at all).
// Everything except "no link / not a link / not MP4-MOV" is a WARNING the
// admin may override — the post still goes out.

import { hasCarouselVideoExtension, isCarouselVideoMime, ratioLabel } from './graphics/carousel'

export const REEL_VIDEO_MIN_S = 3
export const REEL_VIDEO_MAX_S = 15 * 60
export const REEL_VIDEO_MAX_MB = 300
export const REEL_VIDEO_MAX_BYTES = REEL_VIDEO_MAX_MB * 1024 * 1024
export const REEL_VIDEO_MAX_WIDTH = 1920
export const REEL_RECOMMENDED_RATIO = 9 / 16
/** File-input accept for a reel video (MP4 / MOV only). */
export const REEL_VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v'

export interface ReelVideoMeta {
  duration_s: number | null
  width: number | null
  height: number | null
  size_bytes: number | null
}

export interface ReelVideoFacts extends Partial<ReelVideoMeta> {
  url: string | null
  /** Content type if known (HEAD); null = unknown. */
  mime?: string | null
}

function positiveOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** publish_target.video_url, or null. */
export function reelVideoUrl(publishTarget: Record<string, unknown> | null | undefined): string | null {
  return stringOrNull(publishTarget?.video_url)
}

/** publish_target.cover_url, or null. */
export function reelCoverUrl(publishTarget: Record<string, unknown> | null | undefined): string | null {
  return stringOrNull(publishTarget?.cover_url)
}

/** Defensive coercion of publish_target.video_meta. */
export function coerceReelVideoMeta(raw: unknown): ReelVideoMeta {
  const o = (raw ?? {}) as Record<string, unknown>
  return {
    duration_s: positiveOrNull(o.duration_s),
    width: positiveOrNull(o.width),
    height: positiveOrNull(o.height),
    size_bytes: positiveOrNull(o.size_bytes),
  }
}

/** True when nothing is known about the video (meta never read / unreadable). */
export function isEmptyReelMeta(m: ReelVideoMeta): boolean {
  return m.duration_s == null && m.width == null && m.height == null && m.size_bytes == null
}

/**
 * BLOCKING problems only — the post would fail for certain. Empty = OK.
 */
export function reelVideoProblems(v: ReelVideoFacts): string[] {
  if (!v.url) return ['Add the reel’s video first.']
  const problems: string[] = []
  if (!/^https?:\/\//i.test(v.url)) problems.push('The video needs a public https link.')
  if (!hasCarouselVideoExtension(v.url) && !isCarouselVideoMime(v.mime)) {
    problems.push('Instagram Reels only take MP4 or MOV videos (.mp4, .mov, .m4v).')
  }
  return problems
}

function fmtSeconds(s: number): string {
  if (s >= 60) {
    const total = Math.round(s)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  }
  return s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`
}

function fmtMB(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/**
 * Non-blocking advice: the reel is still sent, but Instagram may crop it or
 * refuse it at publish time. `unreadable` = the browser could not read the
 * file's metadata (often an HEVC / HDR video).
 */
export function reelVideoWarnings(v: ReelVideoFacts, opts: { unreadable?: boolean } = {}): string[] {
  const w: string[] = []
  if (!v.url) return w
  if (opts.unreadable) {
    w.push(
      'This browser could not read the video. It may be HEVC or iPhone HDR, which Metricool can’t auto-publish — if publishing fails, export it as H.264 MP4 (on iPhone: Settings → Camera → Formats → Most Compatible, and turn off HDR Video).',
    )
  }
  if (v.duration_s != null) {
    if (v.duration_s < REEL_VIDEO_MIN_S - 0.05) {
      w.push(`Video is ${fmtSeconds(v.duration_s)} — Instagram needs reels of at least ${REEL_VIDEO_MIN_S} seconds, so publishing may fail.`)
    } else if (v.duration_s > REEL_VIDEO_MAX_S + 0.5) {
      w.push(`Video is ${fmtSeconds(v.duration_s)} — Instagram’s API takes reels up to 15 minutes, so publishing may fail.`)
    }
  }
  if (v.size_bytes != null && v.size_bytes > REEL_VIDEO_MAX_BYTES) {
    w.push(`Video is ${fmtMB(v.size_bytes)} — Instagram’s Reels limit is ${REEL_VIDEO_MAX_MB} MB, so publishing may fail. Compress it if you can.`)
  }
  if (v.width && v.height) {
    const r = v.width / v.height
    if (Math.abs(r - REEL_RECOMMENDED_RATIO) / REEL_RECOMMENDED_RATIO > 0.03) {
      w.push(
        `Video is ${v.width}×${v.height} (${ratioLabel(r)}) — reels are vertical 9:16 (e.g. 1080×1920). Instagram will crop it or add bars.`,
      )
    }
    if (v.width > REEL_VIDEO_MAX_WIDTH) {
      w.push(`Video is ${v.width} px wide — Instagram takes at most ${REEL_VIDEO_MAX_WIDTH} px, so publishing may fail. Export at 1080×1920.`)
    }
  }
  return w
}

/** "0:42 · 1080×1920 (9:16) · 38 MB" — parts that are unknown are left out. */
export function reelMetaLine(m: ReelVideoMeta, formatBytes: (b: number) => string): string {
  return [
    m.duration_s ? fmtClock(m.duration_s) : null,
    m.width && m.height ? `${m.width}×${m.height} (${ratioLabel(m.width / m.height)})` : null,
    m.size_bytes ? formatBytes(m.size_bytes) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function fmtClock(s: number): string {
  const total = Math.round(s)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// ── Caption cleanup ─────────────────────────────────────────────────────────
// Older AI drafts wrote "Hook: …" / "Caption: …" (and sometimes "Hashtags: …")
// labels into the body, which is posted verbatim. stripPostLabels removes the
// labels. With dropHook (reels, TikTok — the hook is ON-SCREEN text, not part
// of the caption) the "Hook:" line is removed entirely, unless it is the only
// text there is; otherwise just its label goes.

const LABEL = (name: string) => new RegExp(`^\\s*[*_]*\\s*(?:${name})\\s*[*_]*\\s*:\\s*[*_]*\\s*`, 'i')
const HOOK_LABEL = LABEL('hook|on-screen hook|on-screen text|text overlay')
const PLAIN_LABELS = LABEL('caption|hashtags')

export function stripPostLabels(
  body: string | null | undefined,
  opts: { dropHook?: boolean } = {},
): { caption: string; hook: string | null; hadScaffolding: boolean } {
  const lines = (body ?? '').split('\n')
  const keep: string[] = []
  let hook: string | null = null
  let hadScaffolding = false
  for (const line of lines) {
    if (HOOK_LABEL.test(line)) {
      hadScaffolding = true
      const text = line.replace(HOOK_LABEL, '').replace(/[*_]+\s*$/, '').trim()
      if (hook == null && text) hook = text
      if (!opts.dropHook) keep.push(text)
      continue
    }
    if (PLAIN_LABELS.test(line)) {
      hadScaffolding = true
      keep.push(line.replace(PLAIN_LABELS, ''))
      continue
    }
    keep.push(line)
  }
  let caption = keep.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  // Never strip a body down to nothing — keep the hook text as the caption.
  if (!caption && hook) caption = hook
  return { caption, hook, hadScaffolding }
}

/** Channels whose posted caption gets the label strip (on generate + approve). */
export function labelStripOptions(channel: string): { dropHook: boolean } | null {
  if (channel === 'instagram_reel' || channel === 'tiktok') return { dropHook: true }
  return null
}
