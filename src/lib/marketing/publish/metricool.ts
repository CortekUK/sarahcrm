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
//      normalize fails we stop (no broken, imageless post).
//      An Instagram carousel may MIX images and videos (slide order = media
//      order; slide 1 = graphic_url may itself be a video). Videos go through
//      the SAME normalize endpoint as images (Metricool's only media-import
//      call), with a longer timeout; Metricool tells photo from video by the
//      file itself, so `media` stays a plain list of URLs. Verified with a
//      real draft: a PNG + MP4 carousel was accepted and read back with both
//      items. Instagram always
//      needs media; a reel always needs a video (we never post an image as a reel —
//      an old reel draft's graphic_url is ignored). A reel may carry an optional
//      cover image (publish_target.cover_url, a 9:16 JPEG made by the approval
//      queue): it is normalized like any image and sent as the top-level
//      `videoThumbnailUrl` (Metricool swagger ScheduledPost; the planner's
//      "upload cover" option). Reels also send instagramData.showReelOnFeed: true
//      (the planner's "Show Reel on Feed" toggle).
//      LinkedIn and Facebook allow text-only posts, so their media is optional.
//      TikTok: with publish_target.video_url it is a VIDEO post (the video
//      only); otherwise a PHOTO post — graphic_url + publish_target.media_urls
//      (1–35 images; several = a photo carousel). TikTok always needs media.
//   3. publicationDate = scheduled_at when it's in the future, else now, as
//      wall-clock time in METRICOOL_TIMEZONE. (The admin sets scheduled_at from
//      the card's Schedule panel — see ./schedule.ts.)
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
import { hasCarouselVideoExtension } from '@/lib/marketing/graphics/carousel'
import { metricoolPostState } from './schedule'
import {
  createPost,
  deletePost,
  getPost,
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

// Future scheduled_at → that instant; otherwise NOW — approving = publish
// immediately (Metricool accepts the current minute and publishes it at once).
export function pickPublicationInstant(scheduledAt: string | null | undefined, now: Date): Date {
  if (scheduledAt) {
    const t = new Date(scheduledAt)
    if (!Number.isNaN(t.getTime()) && t.getTime() > now.getTime()) return t
  }
  return now
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
  /** Reel cover image (normalized URL) → Metricool `videoThumbnailUrl`. */
  videoThumbnailUrl?: string | null
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
    body.instagramData =
      input.kind === 'reel'
        ? { type: 'REEL', autoPublish: !draft, showReelOnFeed: true }
        : { type: 'POST', autoPublish: !draft }
    if (input.kind === 'reel' && input.videoThumbnailUrl) body.videoThumbnailUrl = input.videoThumbnailUrl
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
    // Slide order = media order: graphic_url (slide 1) then media_urls
    // (slides 2..n). Exact duplicate URLs are dropped; the approval queue
    // gives every slide its own render/copy URL so none collapse.
    const urls = [...(graphic ? [graphic] : []), ...stringList(hints.media_urls)]
    const max = network === 'tiktok' ? MAX_TIKTOK_PHOTOS : MAX_CAROUSEL_ITEMS
    const unique = Array.from(new Set(urls))
    if (network === 'instagram' && unique.length > max) {
      return {
        ok: false,
        error: `Instagram carousels allow at most ${max} slides (this one has ${unique.length}). Remove some slides — nothing was sent to Metricool.`,
      }
    }
    if (network === 'instagram' && unique.length === 1) {
      return {
        ok: false,
        error:
          'An Instagram carousel needs at least 2 slides — render more slides first. Nothing was sent to Metricool.',
      }
    }
    return { ok: true, urls: unique.slice(0, max) }
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
    for (const [i, url] of source.urls.entries()) {
      const isVideo = kind === 'reel' || kind === 'video' || hasCarouselVideoExtension(url)
      const res = await normalizeMedia(url, deadline, { video: isVideo })
      if (!res.ok) {
        const what = isVideo ? 'video' : 'graphic'
        const which = source.urls.length > 1 ? ` (slide ${i + 1})` : ''
        return {
          ok: false,
          error: `Metricool could not import the ${what}${which}, so nothing was posted. ${res.message}`,
        }
      }
      media.push(res.data)
    }

    // Reel cover (optional) — imported like any image; a failed import stops
    // the publish so the reel never goes out with a cover nobody chose.
    let videoThumbnailUrl: string | null = null
    const cover = kind === 'reel' ? stringOrNull((asset.publish_target ?? {}).cover_url) : null
    if (cover) {
      const res = await normalizeMedia(cover, deadline)
      if (!res.ok) {
        return {
          ok: false,
          error: `Metricool could not import the reel cover, so nothing was posted. ${res.message} Remove the cover (the reel then uses its first frame) or try again.`,
        }
      }
      videoThumbnailUrl = res.data
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
      videoThumbnailUrl,
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
        ...(hints.video_meta && typeof hints.video_meta === 'object' ? { video_meta: hints.video_meta } : {}),
        ...(stringOrNull(hints.cover_url) ? { cover_url: stringOrNull(hints.cover_url) } : {}),
        raw: created.data.raw,
      },
    }
  }
}

// ── Withdraw (unschedule / before a re-send) ────────────────────────────────
// Removes a still-pending Metricool planner post so a re-send can never leave
// two scheduled copies. Never deletes a post that is (or may be) published.
//   'deleted'   → it was pending and is now gone from Metricool;
//   'gone'      → it no longer existed (deleted in the planner already);
//   'published' → it is published / publishing — left untouched.
// { ok:false } = we could not confirm the state or the delete failed — the
// caller must NOT create another post.
export type WithdrawOutcome =
  | { ok: true; result: 'deleted' | 'gone' | 'published'; providerStatuses: string[] }
  | { ok: false; error: string }

export async function withdrawMetricoolPost(postId: string, publishAtIso: string | null): Promise<WithdrawOutcome> {
  const deadline = Date.now() + PUBLISH_BUDGET_MS
  const read = await getPost(postId, deadline)
  if (!read.ok) {
    return { ok: false, error: `Could not check the post on Metricool: ${read.message}` }
  }
  const snapshot = read.data.found ? read.data.post : null
  const statuses = snapshot?.providerStatuses ?? []
  const state = metricoolPostState(snapshot, publishAtIso, new Date())
  if (state !== 'pending') return { ok: true, result: state, providerStatuses: statuses }

  const del = await deletePost(postId, deadline)
  if (del.ok) {
    console.log('[marketing/publish] Metricool post deleted', { metricoolPostId: postId, alreadyGone: del.data.alreadyGone })
    return { ok: true, result: del.data.alreadyGone ? 'gone' : 'deleted', providerStatuses: statuses }
  }
  // A failed/timed-out delete may still have gone through — confirm.
  const again = await getPost(postId, deadline)
  if (again.ok && !again.data.found) {
    return { ok: true, result: 'deleted', providerStatuses: statuses }
  }
  return { ok: false, error: `Metricool did not delete the scheduled post: ${del.message}` }
}
