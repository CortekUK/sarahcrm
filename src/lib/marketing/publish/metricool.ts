// MetricoolPublisher — real social publishing through Metricool's planner.
//
// Selected by ./index.ts for the social channels (linkedin, instagram_*,
// facebook, tiktok) ONLY when METRICOOL_USER_TOKEN, METRICOOL_USER_ID and
// METRICOOL_BLOG_ID are all set; otherwise those channels stay on the
// MockPublisher.
//
// publish(asset), called by the asset route after a human clicks Approve:
//   1. Map channel → Metricool network + post type (CHANNEL_NETWORK below).
//      Blog / PR / sponsor_recap are NOT Metricool channels — never routed here.
//   2. Collect the media: graphic_url (the rendered PNG's PUBLIC bucket URL),
//      plus publish_target.media_urls for a carousel, or publish_target.video_url
//      for a reel. Each URL goes through Metricool's normalize call; if any
//      normalize fails we stop (no broken, imageless post). Instagram always
//      needs media; a reel always needs a video (we never post an image as a reel).
//      LinkedIn and Facebook allow text-only posts, so their media is optional.
//      TikTok: with publish_target.video_url it is a VIDEO post (the video
//      only); otherwise a PHOTO post — graphic_url + publish_target.media_urls
//      (1–35 images; several = a photo carousel). TikTok always needs media.
//   3. publicationDate = scheduled_at when it's in the future, else now + 10
//      minutes, as wall-clock time in METRICOOL_TIMEZONE.
//   4. POST the planner post (body built in buildMetricoolPostBody).
//
// SAFETY — METRICOOL_MODE (read per request):
//   draft (default; anything other than exactly 'live')
//         → `draft: true, autoPublish: false`. The post lands in Metricool's
//           planner as a DRAFT and is NEVER published until someone approves
//           it inside Metricool. The asset is recorded as 'approved' with
//           publish_target.mode = 'draft' — not 'published'.
//   live  → `draft: false, autoPublish: true`. Metricool publishes it at
//           publicationDate. The asset is recorded as 'published'.
//
// Never throws: every failure resolves as { ok: false, error } with a message
// that is safe to show (no token, no axios config).

import type { MarketingChannel, Publisher, PublishableAsset, PublishResult } from './types'
import {
  createPost,
  getMetricoolMode,
  getMetricoolTimezone,
  normalizeMedia,
  type MetricoolMode,
} from './metricool-client'

// Whole publish() (normalize calls + create) must fit the asset route's
// maxDuration = 60.
const PUBLISH_BUDGET_MS = 50_000
// Without a future scheduled_at the post is set this far ahead — gives
// Metricool time to process the media and the team a window to check it.
const DEFAULT_LEAD_MS = 10 * 60_000
// Instagram carousels allow up to 10 items.
const MAX_CAROUSEL_ITEMS = 10
// TikTok photo posts allow up to 35 images.
const MAX_TIKTOK_PHOTOS = 35

export type MetricoolNetwork = 'linkedin' | 'instagram' | 'facebook' | 'tiktok'
// 'video' is only ever chosen at publish time, for a tiktok asset that has a
// publish_target.video_url (see effectiveKind).
type PostKind = 'post' | 'carousel' | 'reel' | 'video'

// The ONLY channels Metricool handles. Anything else is a programming error
// in ./index.ts and is refused below.
export const METRICOOL_CHANNELS: Partial<Record<MarketingChannel, { network: MetricoolNetwork; kind: PostKind }>> = {
  linkedin: { network: 'linkedin', kind: 'post' },
  instagram_feed: { network: 'instagram', kind: 'post' },
  instagram_carousel: { network: 'instagram', kind: 'carousel' },
  instagram_reel: { network: 'instagram', kind: 'reel' },
  // Facebook page post — facebookData { type: 'POST' } (the shape in
  // Metricool's own doc example); graphic optional (text-only is allowed).
  facebook: { network: 'facebook', kind: 'post' },
  // TikTok — a PHOTO post by default (kind 'carousel': graphic + media_urls,
  // 1–35 images); switched to 'video' at publish time when the asset has a
  // publish_target.video_url. Body block tiktokData is an ASSUMPTION (below).
  tiktok: { network: 'tiktok', kind: 'carousel' },
}

// TikTok is a video post only when a video is attached; otherwise a photo
// post. Every other channel keeps its mapped kind.
function effectiveKind(network: MetricoolNetwork, kind: PostKind, asset: PublishableAsset): PostKind {
  if (network === 'tiktok') {
    return stringOrNull((asset.publish_target ?? {}).video_url) ? 'video' : 'carousel'
  }
  return kind
}

// ── Wall-clock formatting ───────────────────────────────────────────────────
// Metricool wants { dateTime: 'YYYY-MM-DDTHH:mm:ss', timezone } — local time
// in the named zone, NO offset. Intl does the zone conversion (incl. BST/GMT).
export function toWallClock(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

// Future scheduled_at → that instant; otherwise now + 10 minutes.
export function pickPublicationInstant(scheduledAt: string | null | undefined, now: Date): Date {
  if (scheduledAt) {
    const t = new Date(scheduledAt)
    if (!Number.isNaN(t.getTime()) && t.getTime() > now.getTime()) return t
  }
  return new Date(now.getTime() + DEFAULT_LEAD_MS)
}

// ── Post body ───────────────────────────────────────────────────────────────
// Everything Metricool-body-specific lives here, so the per-network fields can
// be corrected in ONE place once confirmed against Metricool's planner (create
// a post in the planner with the browser inspector open and copy the body).
//
// Documented by Metricool (API doc 04/09/2024): publicationDate, creationDate,
// text, firstCommentText, providers[{network}], autoPublish,
// saveExternalMediaFiles, shortener, draft, facebookData.type,
// instagramData.autoPublish, hasNotReadNotes.
// ASSUMPTIONS to verify with the planner inspector:
//   - `media` is an array of normalized URL strings;
//   - instagramData.type is 'POST' for feed AND carousel (a carousel = a POST
//     with several media) and 'REEL' for a reel;
//   - linkedinData.type 'POST' is accepted for a LinkedIn post (LinkedIn's
//     block isn't documented at all — it may be optional or named differently).
//   - tiktokData is NOT documented at all. We send { type: 'PHOTO' } for a
//     photo post (one image or a carousel of up to 35 — the media array
//     decides) and { type: 'VIDEO' } for a video post. The block may be
//     optional, named differently, or need extra keys (e.g. privacy /
//     disableComments / autoAddMusic, or a separate photo-post flag) — copy
//     the real body from Metricool's planner (browser inspector) to confirm.
//   - For a TikTok PHOTO post, top-level autoPublish may not be honoured by
//     TikTok: it can arrive as an in-app draft needing a final one-tap
//     publish. Music / stickers / effects can't be added through the API.
export interface MetricoolPostInput {
  network: MetricoolNetwork
  kind: PostKind
  text: string
  media: string[]
  publication: { dateTime: string; timezone: string }
  creation: { dateTime: string; timezone: string }
  mode: MetricoolMode
}

export function buildMetricoolPostBody(input: MetricoolPostInput): Record<string, unknown> {
  const draft = input.mode !== 'live'
  const body: Record<string, unknown> = {
    publicationDate: input.publication,
    creationDate: input.creation,
    text: input.text,
    firstCommentText: '',
    providers: [{ network: input.network }],
    autoPublish: !draft,
    saveExternalMediaFiles: false,
    shortener: false,
    draft,
    media: input.media,
    hasNotReadNotes: false,
  }
  if (input.network === 'instagram') {
    body.instagramData = { type: input.kind === 'reel' ? 'REEL' : 'POST', autoPublish: !draft }
  } else if (input.network === 'linkedin') {
    body.linkedinData = { type: 'POST' }
  } else if (input.network === 'facebook') {
    body.facebookData = { type: 'POST' }
  } else if (input.network === 'tiktok') {
    // ASSUMPTION — undocumented block (see the list above).
    body.tiktokData = { type: input.kind === 'video' ? 'VIDEO' : 'PHOTO' }
  }
  return body
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []
}

// The source media URLs for one asset, in order (see header, step 2).
function sourceMedia(
  asset: PublishableAsset,
  network: MetricoolNetwork,
  kind: PostKind,
): { ok: true; urls: string[] } | { ok: false; error: string } {
  const graphic = stringOrNull(asset.graphic_url)
  const hints = asset.publish_target ?? {}
  if (kind === 'video') {
    // TikTok video post — the video only (effectiveKind guarantees one).
    const video = stringOrNull(hints.video_url)
    return video ? { ok: true, urls: [video] } : { ok: true, urls: [] }
  }
  if (kind === 'reel') {
    const video = stringOrNull(hints.video_url)
    if (!video) {
      return {
        ok: false,
        error:
          'Instagram Reels need a video, and this asset has none — it was not sent to Metricool. Post it as an Instagram feed post instead, or add the reel manually in Metricool.',
      }
    }
    return { ok: true, urls: [video] }
  }
  if (kind === 'carousel') {
    const urls = [...(graphic ? [graphic] : []), ...stringList(hints.media_urls)]
    const max = network === 'tiktok' ? MAX_TIKTOK_PHOTOS : MAX_CAROUSEL_ITEMS
    return { ok: true, urls: Array.from(new Set(urls)).slice(0, max) }
  }
  return { ok: true, urls: graphic ? [graphic] : [] }
}

// ── Publisher ───────────────────────────────────────────────────────────────
export class MetricoolPublisher implements Publisher {
  readonly name = 'metricool'

  async publish(asset: PublishableAsset): Promise<PublishResult> {
    const deadline = Date.now() + PUBLISH_BUDGET_MS
    const mapping = METRICOOL_CHANNELS[asset.channel]
    if (!mapping) {
      return { ok: false, error: `Channel "${asset.channel}" is not published through Metricool.` }
    }
    const { network } = mapping
    const kind = effectiveKind(network, mapping.kind, asset)
    const mode = getMetricoolMode()
    const timezone = getMetricoolTimezone()

    const text = (asset.body ?? '').trim()
    if (!text) {
      return { ok: false, error: 'This post has no text — add a caption before approving.' }
    }

    const source = sourceMedia(asset, network, kind)
    if (!source.ok) return { ok: false, error: source.error }
    if (network === 'instagram' && source.urls.length === 0) {
      return {
        ok: false,
        error:
          'Instagram posts need an image — render a graphic for this post first. Nothing was sent to Metricool.',
      }
    }
    if (network === 'tiktok' && source.urls.length === 0) {
      return {
        ok: false,
        error:
          'TikTok posts need at least one image (or a video) — render the vertical graphic or add an image for this post first. Nothing was sent to Metricool.',
      }
    }

    // Normalize every media URL; any failure stops the publish.
    const media: string[] = []
    for (const url of source.urls) {
      const res = await normalizeMedia(url, deadline)
      if (!res.ok) {
        return {
          ok: false,
          error: `Metricool could not import the ${kind === 'reel' || kind === 'video' ? 'video' : 'graphic'}, so nothing was posted. ${res.message}`,
        }
      }
      media.push(res.data)
    }

    const now = new Date()
    const publishAt = pickPublicationInstant(asset.scheduled_at, now)
    const publicationDate = { dateTime: toWallClock(publishAt, timezone), timezone }
    const body = buildMetricoolPostBody({
      network,
      kind,
      text,
      media,
      publication: publicationDate,
      creation: { dateTime: toWallClock(now, timezone), timezone },
      mode,
    })

    const created = await createPost(body, deadline)
    if (!created.ok) {
      // A 5xx / timeout on a create is ambiguous — Metricool may have saved it.
      const maybeCreated = created.httpStatus === null || created.httpStatus >= 500
      return {
        ok: false,
        error: `Metricool did not accept the post: ${created.message}${
          maybeCreated ? ' It may still have been created — check Metricool’s planner before approving again.' : ''
        }`,
      }
    }

    const metricoolPostId = created.data.postId
    const hints = asset.publish_target ?? {}
    console.log('[marketing/publish] Metricool post created', {
      assetId: asset.id,
      channel: asset.channel,
      network,
      mode,
      metricoolPostId,
    })
    return {
      ok: true,
      draft: mode !== 'live',
      externalId: metricoolPostId ?? undefined,
      target: {
        platform: 'metricool',
        network,
        postType: kind,
        mode,
        metricoolPostId,
        publicationDate,
        publishAt: publishAt.toISOString(),
        media,
        // Keep the per-asset hints so a re-send still has them.
        ...(stringOrNull(hints.video_url) ? { video_url: stringOrNull(hints.video_url) } : {}),
        ...(stringList(hints.media_urls).length ? { media_urls: stringList(hints.media_urls) } : {}),
        raw: created.data.raw,
      },
    }
  }
}
