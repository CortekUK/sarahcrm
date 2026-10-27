// Marketing asset mutations — the approval queue's server side.
//
// PATCH /api/admin/marketing/assets/[id]
//   body: { action: 'save' | 'approve' | 'reject' | 'in_review' | 'resend'
//                   | 'unpublish' | 'unschedule', title?, body?, graphic_url?,
//           slot_values?, template_id?, media_urls?, video_url?, video_meta?,
//           cover_url?, scheduled_at? }
// scheduled_at (save only; ISO string or null to clear) = when a Metricool
// social post should go out. Only for linkedin / instagram_* / facebook /
// tiktok, only while the post has NOT been sent to Metricool (409 after), and
// it must be >= 5 minutes and <= 6 months ahead (see publish/schedule.ts).
// Approving uses it as Metricool's publicationDate if still in the future,
// else publishes now.
// 'unschedule': a Metricool post that is still pending (scheduled / draft, not
// published) is DELETED from Metricool and the asset goes back to 'in_review'
// (scheduled_at kept, old publish_target archived in publish_target.previous)
// so it can be edited / rescheduled and approved again.
// media_urls = Instagram carousel slides 2..n (merged into
// publish_target.media_urls; refused once sent to Metricool). Approving an
// instagram_carousel needs 2–10 ready slides (graphic_url + media_urls) and strips
// any legacy "Slide n:" / "Caption:" scaffolding from the posted caption.
// video_url / video_meta / cover_url = the Instagram REEL's video (+ the
// browser-read {duration_s,width,height,size_bytes}) and optional cover image,
// merged into publish_target exactly like media_urls (instagram_reel only;
// refused with 409 once sent to Metricool). Only BLOCKING video problems are
// refused (no link / not https / not MP4-MOV — see reel.ts); length / size /
// shape are editor warnings. Approving a reel needs publish_target.video_url
// (400 otherwise) and strips old "Hook:" / "Caption:" labels from the posted
// caption (TikTok too). An old reel's image graphic is never posted.
// Carousel VIDEO slides (slot_values.slides[].media_type 'video') are checked
// on save (stored duration / size / dimensions) and again on approve (HEAD
// request: MP4/MOV content type + size) — see carousel-server.ts.
//
// ALL status transitions live here (never client-side). Critically, APPROVE is
// the human publish gate: nothing is ever published without an explicit approve
// action. On approve for a blog/linkedin/social/PR channel, we route through
// the publishing adapter (getPublisher → Metricool for social when configured,
// else MockPublisher) and only then stamp the result:
//   * published normally / Metricool LIVE → status='published' + published_at;
//   * Metricool DRAFT mode               → status='approved', published_at
//     left empty, publish_target.mode='draft' (the post sits as a draft in
//     Metricool's planner until someone approves it there).
// An asset already handed to Metricool can't be approved again (409), so a
// double click never creates a second Metricool post. To deliberately send it
// again, the admin uses 'resend' ("Send again" on the card, behind a
// confirmation): it only RESETS the asset to 'in_review' — clears
// published_at and moves the old publish_target into publish_target.previous
// (an array, oldest first) as an audit trail — so the normal Approve flow
// works again. It never publishes by itself. Before resetting, a previous
// Metricool post that is still PENDING (future / draft) is deleted from
// Metricool so a re-send never leaves two scheduled copies; one already
// published is left alone (the response's `notice` says so). If the pending
// post can't be deleted (or its state can't be checked) the resend is refused.
// Blog channels (seo_blog, recap_blog) publish to the website's /blog via
// BlogPublisher on approve (status='published', publish_target.platform =
// 'website'). A live post can't be approved again (409). 'unpublish' takes
// it down (blog_posts.status='unpublished') and puts the asset back to
// 'in_review' — approving again re-publishes it at the same URL.
// Admin only; writes use service-role.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import {
  getPublisher,
  isMetricoolSocialChannel,
  unpublishBlogPost,
  validateScheduledAt,
  withdrawMetricoolPost,
} from '@/lib/marketing/publish'
import type { MarketingChannel, PublishableAsset } from '@/lib/marketing/publish'
import { carouselMedia, parseCarouselBody } from '@/lib/marketing/graphics/carousel'
import { CAROUSEL_MAX_SLIDES, CAROUSEL_MIN_SLIDES } from '@/lib/marketing/graphics/types'
import { carouselMediaProblems, storedSlideProblems } from '@/lib/marketing/graphics/carousel-server'
import { coerceReelVideoMeta, labelStripOptions, reelVideoUrl, stripPostLabels } from '@/lib/marketing/reel'
import { reelVideoServerProblems } from '@/lib/marketing/reel-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Metricool publish = media import + post create (bounded at 50s inside).
export const maxDuration = 60

interface PatchBody {
  action?: 'save' | 'approve' | 'reject' | 'in_review' | 'resend' | 'unpublish' | 'unschedule'
  title?: string
  body?: string
  // Template Graphics — persisted on save/re-render from the approval queue.
  graphic_url?: string | null
  slot_values?: Record<string, unknown> | null
  template_id?: string | null
  // Instagram carousel slides 2..n (slide 1 is graphic_url), in slide order.
  // Merged into publish_target.media_urls — exactly what MetricoolPublisher
  // reads. null/[] clears them.
  media_urls?: string[] | null
  // Instagram reel: the video (null clears), its browser-read metadata, and an
  // optional cover image (null clears). Merged into publish_target.
  video_url?: string | null
  video_meta?: Record<string, unknown> | null
  cover_url?: string | null
  // When the post should go out (save only; null clears). Metricool channels.
  scheduled_at?: string | null
}

// Per-asset publish hints a re-send still needs (see MetricoolPublisher).
function keepHints(sent: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(sent.video_url !== undefined ? { video_url: sent.video_url } : {}),
    ...(sent.media_urls !== undefined ? { media_urls: sent.media_urls } : {}),
    ...(sent.video_meta !== undefined ? { video_meta: sent.video_meta } : {}),
    ...(sent.cover_url !== undefined ? { cover_url: sent.cover_url } : {}),
  }
}

function stringOr(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const action = body.action ?? 'save'

  const admin = getAdmin()
  const { data: asset, error: loadErr } = await admin
    .from('marketing_assets')
    .select('id, campaign_id, channel, voice, title, body, status, publish_target, graphic_url, scheduled_at, event_id, slot_values')
    .eq('id', id)
    .single()
  if (loadErr || !asset) {
    return Response.json({ error: 'Asset not found' }, { status: 404 })
  }

  const patch: Record<string, unknown> = {}
  // Optional human-readable note for the UI (e.g. what happened on Metricool).
  let notice: string | null = null
  const prevPt = (asset.publish_target as Record<string, unknown> | null) ?? null
  // Handed to Metricool (draft or live) and not reset since.
  const sentToMetricool =
    prevPt?.platform === 'metricool' && (asset.status === 'approved' || asset.status === 'published')

  if (action === 'save' && body.scheduled_at !== undefined) {
    if (!isMetricoolSocialChannel(asset.channel as string)) {
      return Response.json(
        { error: 'Only LinkedIn, Instagram, Facebook and TikTok posts can be scheduled.' },
        { status: 400 },
      )
    }
    if (sentToMetricool || stringOr(prevPt?.metricoolPostId)) {
      return Response.json(
        { error: 'Already sent to Metricool — unschedule it first to change the time.' },
        { status: 409 },
      )
    }
    const v = validateScheduledAt(body.scheduled_at, new Date())
    if (!v.ok) return Response.json({ error: v.error }, { status: 400 })
    patch.scheduled_at = v.value
  }

  // Content edits are always allowed alongside any action (inline editing).
  if (typeof body.title === 'string') patch.title = body.title
  if (typeof body.body === 'string') patch.body = body.body
  // Template-graphic fields (re-render from the queue).
  if (typeof body.graphic_url === 'string' || body.graphic_url === null) {
    patch.graphic_url = body.graphic_url
  }
  if (body.slot_values !== undefined) {
    // Never store a carousel video slide marked ready that breaks Instagram's
    // carousel video rules (the editor only marks it ready once it passes).
    if (asset.channel === 'instagram_carousel' && body.slot_values) {
      const problems = storedSlideProblems((body.slot_values as Record<string, unknown>).slides)
      if (problems.length) {
        return Response.json({ error: problems.join(' ') }, { status: 400 })
      }
    }
    patch.slot_values = body.slot_values
  }
  if (typeof body.template_id === 'string' || body.template_id === null) {
    patch.template_id = body.template_id
  }
  if (body.media_urls !== undefined) {
    const prev = (asset.publish_target as Record<string, unknown> | null) ?? null
    if (
      prev?.platform === 'metricool' &&
      (asset.status === 'approved' || asset.status === 'published')
    ) {
      return Response.json(
        { error: 'Already sent to Metricool — use “Send again” before changing the slides.' },
        { status: 409 },
      )
    }
    const urls = Array.isArray(body.media_urls)
      ? body.media_urls
          .filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u.trim()))
          .map((u) => u.trim())
          .slice(0, CAROUSEL_MAX_SLIDES - 1)
      : []
    const next: Record<string, unknown> = { ...(prev ?? {}) }
    if (urls.length) next.media_urls = urls
    else delete next.media_urls
    patch.publish_target = Object.keys(next).length ? next : null
  }
  // Instagram reel video / cover (merged into publish_target like media_urls).
  if (body.video_url !== undefined || body.video_meta !== undefined || body.cover_url !== undefined) {
    if (asset.channel !== 'instagram_reel') {
      return Response.json({ error: 'Only Instagram reels take a reel video / cover.' }, { status: 400 })
    }
    if (sentToMetricool) {
      return Response.json(
        { error: 'Already sent to Metricool — use “Send again” before changing the video.' },
        { status: 409 },
      )
    }
    const base =
      'publish_target' in patch ? (patch.publish_target as Record<string, unknown> | null) : prevPt
    const next: Record<string, unknown> = { ...(base ?? {}) }
    if (body.video_url !== undefined) {
      const url = typeof body.video_url === 'string' ? body.video_url.trim() : ''
      if (url) {
        const problems = await reelVideoServerProblems(url)
        if (problems.length) return Response.json({ error: problems.join(' ') }, { status: 400 })
        if (url !== reelVideoUrl(base)) delete next.video_meta // stale facts belong to the old video
        next.video_url = url
      } else {
        delete next.video_url
        delete next.video_meta
      }
    }
    if (body.video_meta !== undefined) {
      const meta = coerceReelVideoMeta(body.video_meta)
      if (body.video_meta && next.video_url) next.video_meta = meta
      else delete next.video_meta
    }
    if (body.cover_url !== undefined) {
      const cover = typeof body.cover_url === 'string' ? body.cover_url.trim() : ''
      if (cover && !/^https?:\/\//i.test(cover)) {
        return Response.json({ error: 'The cover image needs a public https link.' }, { status: 400 })
      }
      if (cover) next.cover_url = cover
      else delete next.cover_url
    }
    patch.publish_target = Object.keys(next).length ? next : null
  }

  if (action === 'unpublish') {
    // Take a website blog post down. Never deletes the post row.
    const prev = (asset.publish_target as Record<string, unknown> | null) ?? null
    if (prev?.platform !== 'website') {
      return Response.json(
        { error: 'Only blog posts published to the website can be unpublished.' },
        { status: 400 },
      )
    }
    const res = await unpublishBlogPost(asset.id)
    if (!res.ok) return Response.json({ error: res.error }, { status: 502 })
    patch.status = 'in_review'
    patch.published_at = null
    patch.publish_target = { ...prev, status: 'unpublished', unpublished_at: res.unpublishedAt }
  } else if (action === 'resend' || action === 'unschedule') {
    const prev = prevPt
    if (prev?.platform !== 'metricool') {
      return Response.json(
        {
          error:
            action === 'resend'
              ? 'Only assets already sent to Metricool can be sent again.'
              : 'Only posts sent to Metricool can be unscheduled.',
        },
        { status: 400 },
      )
    }
    if (action === 'unschedule' && !sentToMetricool) {
      return Response.json({ error: 'This post is not on Metricool any more.' }, { status: 409 })
    }
    const { previous, ...sent } = prev
    const history = Array.isArray(previous) ? previous : []
    const postId = stringOr(sent.metricoolPostId)
    const publishAt = stringOr(sent.publishAt)
    let withdrawal: string | null = null
    if (sentToMetricool && postId) {
      // Never leave a pending Metricool post behind when the asset is reset.
      const w = await withdrawMetricoolPost(postId, publishAt)
      if (!w.ok) {
        return Response.json(
          {
            error: `${w.error} Nothing was changed — try again, or delete the post in Metricool’s planner first.`,
          },
          { status: 502 },
        )
      }
      if (w.result === 'published') {
        if (action === 'unschedule') {
          return Response.json(
            {
              error:
                'This post has already been published (or is publishing) on Metricool, so it can’t be unscheduled. Use “Send again” to post it once more.',
            },
            { status: 409 },
          )
        }
        notice = 'The previous post was already published, so it was left on the account.'
      } else if (w.result === 'deleted') {
        notice =
          action === 'unschedule'
            ? 'Removed from Metricool. Edit or reschedule it, then approve again.'
            : 'The previous scheduled post was deleted from Metricool, so there won’t be a duplicate.'
      } else {
        notice = 'The previous post was no longer in Metricool’s planner.'
      }
      withdrawal = w.result
    } else if (sentToMetricool && !postId) {
      if (action === 'unschedule') {
        return Response.json(
          {
            error:
              'We don’t have the Metricool post id for this post, so it can’t be removed automatically. Delete it in Metricool’s planner, then use “Send again”.',
          },
          { status: 409 },
        )
      }
      notice =
        'We couldn’t identify the previous Metricool post — if it is still in Metricool’s planner, delete it there before approving again.'
    }
    patch.status = 'in_review'
    patch.published_at = null
    patch.publish_target = {
      ...keepHints(sent),
      previous: [
        ...history,
        {
          ...sent,
          [action === 'unschedule' ? 'unscheduled_at' : 'reset_at']: new Date().toISOString(),
          ...(withdrawal ? { metricool_withdrawal: withdrawal } : {}),
        },
      ],
    }
  } else if (action === 'reject') {
    patch.status = 'rejected'
  } else if (action === 'in_review') {
    patch.status = 'in_review'
  } else if (action === 'approve') {
    const channel = asset.channel as MarketingChannel
    // HUMAN GATE: publish only happens on an explicit approve click, and only
    // through the publishing adapter seam.
    if (channel === 'newsletter') {
      return Response.json(
        { error: 'Newsletter approval sends via the email pipeline (later module).' },
        { status: 400 },
      )
    }
    // Already sent to Metricool (draft or live) → refuse a second post.
    const prevTarget = (asset.publish_target as Record<string, unknown> | null) ?? null
    if (
      prevTarget?.platform === 'metricool' &&
      (asset.status === 'approved' || asset.status === 'published')
    ) {
      return Response.json(
        {
          error:
            prevTarget.mode === 'draft'
              ? 'Already sent to Metricool as a draft — approve or edit it in Metricool’s planner.'
              : 'Already sent to Metricool.',
        },
        { status: 409 },
      )
    }
    // Already live on the website blog → refuse (no duplicate notification).
    if (prevTarget?.platform === 'website' && asset.status === 'published') {
      return Response.json(
        { error: 'Already live on the website — unpublish it first to make changes.' },
        { status: 409 },
      )
    }
    let publishBody = (typeof body.body === 'string' ? body.body : asset.body) ?? null
    const publishGraphic =
      (typeof body.graphic_url === 'string' ? body.graphic_url : (asset.graphic_url as string | null)) ?? null
    const publishTarget =
      'publish_target' in patch ? (patch.publish_target as Record<string, unknown> | null) : prevTarget
    if (channel === 'instagram_reel') {
      // A reel is a VIDEO — never post an old image graphic as a reel.
      const video = reelVideoUrl(publishTarget)
      if (!video) {
        return Response.json(
          { error: 'Add the reel’s video first (Reel video → Add video). Nothing was sent.' },
          { status: 400 },
        )
      }
      const problems = await reelVideoServerProblems(video)
      if (problems.length) {
        return Response.json({ error: `${problems.join(' ')} Nothing was sent to Metricool.` }, { status: 400 })
      }
    }
    // Reels / TikTok: the body is posted verbatim — drop old "Hook:" /
    // "Caption:" labels (the hook is on-screen text, not caption).
    const stripOpts = labelStripOptions(channel)
    if (stripOpts) {
      const stripped = stripPostLabels(publishBody, stripOpts)
      if (stripped.hadScaffolding && stripped.caption) {
        publishBody = stripped.caption
        patch.body = stripped.caption
      }
    }
    if (channel === 'instagram_carousel') {
      // A carousel needs 2–10 ready slides (Instagram via Metricool).
      const media = carouselMedia(publishGraphic, publishTarget)
      if (media.length < CAROUSEL_MIN_SLIDES) {
        return Response.json(
          {
            error: `An Instagram carousel needs at least ${CAROUSEL_MIN_SLIDES} ready slides (it has ${media.length}). Render the image slides / add the videos in the slide editor first — nothing was sent.`,
          },
          { status: 400 },
        )
      }
      if (media.length > CAROUSEL_MAX_SLIDES) {
        return Response.json(
          {
            error: `An Instagram carousel can have at most ${CAROUSEL_MAX_SLIDES} slides (it has ${media.length}). Remove some — nothing was sent.`,
          },
          { status: 400 },
        )
      }
      // Video slides: MP4/MOV, size, duration, aspect — nothing is sent if any fail.
      const slides =
        body.slot_values !== undefined
          ? (body.slot_values as Record<string, unknown> | null)?.slides
          : (asset.slot_values as Record<string, unknown> | null)?.slides
      const videoProblems = await carouselMediaProblems(media, slides)
      if (videoProblems.length) {
        return Response.json(
          { error: `${videoProblems.join(' ')} Nothing was sent to Metricool.` },
          { status: 400 },
        )
      }
      // The body is posted verbatim as the caption — never post legacy
      // "Slide n:" lines or a "Caption:" label.
      const parsed = parseCarouselBody(publishBody)
      if (parsed.hadScaffolding && parsed.caption) {
        publishBody = parsed.caption
        patch.body = parsed.caption
      }
    }
    const publishable: PublishableAsset = {
      id: asset.id,
      channel,
      title: (typeof body.title === 'string' ? body.title : asset.title) ?? null,
      body: publishBody,
      graphic_url: publishGraphic,
      scheduled_at: (asset.scheduled_at as string | null) ?? null,
      publish_target: publishTarget,
      event_id: (asset.event_id as string | null) ?? null,
    }
    let result
    try {
      result = await getPublisher(channel).publish(publishable)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Publish failed'
      return Response.json({ error: message }, { status: 502 })
    }
    if (!result.ok) {
      return Response.json({ error: result.error ?? 'Publish failed' }, { status: 502 })
    }
    if (result.draft) {
      // Metricool draft mode: approved here, NOT published anywhere yet.
      patch.status = 'approved'
    } else {
      patch.status = 'published'
      // A Metricool live post goes out at its publication time (may be a
      // scheduled time in the future).
      patch.published_at = stringOr(result.target?.publishAt) ?? new Date().toISOString()
    }
    patch.publish_target = {
      ...(result.target ?? {}),
      externalId: result.externalId,
      // Keep the "Send again" audit trail across re-sends.
      ...(publishTarget && Array.isArray(publishTarget.previous) ? { previous: publishTarget.previous } : {}),
    }
  }
  // action === 'save' → content-only, status untouched.

  const { data: updated, error: updErr } = await admin
    .from('marketing_assets')
    .update(patch)
    .eq('id', id)
    .select('id, campaign_id, channel, variant, voice, title, body, status, publish_target, published_at, scheduled_at, email_template_id, template_id, graphic_url, slot_values, updated_at')
    .single()
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 })

  return Response.json({ asset: updated, ...(notice ? { notice } : {}) })
}
