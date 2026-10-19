// Marketing asset mutations — the approval queue's server side.
//
// PATCH /api/admin/marketing/assets/[id]
//   body: { action: 'save' | 'approve' | 'reject' | 'in_review' | 'resend'
//                   | 'unpublish', title?, body? }
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
// works again. It never publishes by itself.
// Blog channels (seo_blog, recap_blog) publish to the website's /blog via
// BlogPublisher on approve (status='published', publish_target.platform =
// 'website'). A live post can't be approved again (409). 'unpublish' takes
// it down (blog_posts.status='unpublished') and puts the asset back to
// 'in_review' — approving again re-publishes it at the same URL.
// Admin only; writes use service-role.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { getPublisher, unpublishBlogPost } from '@/lib/marketing/publish'
import type { MarketingChannel, PublishableAsset } from '@/lib/marketing/publish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Metricool publish = media import + post create (bounded at 50s inside).
export const maxDuration = 60

interface PatchBody {
  action?: 'save' | 'approve' | 'reject' | 'in_review' | 'resend' | 'unpublish'
  title?: string
  body?: string
  // Template Graphics — persisted on save/re-render from the approval queue.
  graphic_url?: string | null
  slot_values?: Record<string, unknown> | null
  template_id?: string | null
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
    .select('id, campaign_id, channel, voice, title, body, status, publish_target, graphic_url, scheduled_at, event_id')
    .eq('id', id)
    .single()
  if (loadErr || !asset) {
    return Response.json({ error: 'Asset not found' }, { status: 404 })
  }

  const patch: Record<string, unknown> = {}

  // Content edits are always allowed alongside any action (inline editing).
  if (typeof body.title === 'string') patch.title = body.title
  if (typeof body.body === 'string') patch.body = body.body
  // Template-graphic fields (re-render from the queue).
  if (typeof body.graphic_url === 'string' || body.graphic_url === null) {
    patch.graphic_url = body.graphic_url
  }
  if (body.slot_values !== undefined) patch.slot_values = body.slot_values
  if (typeof body.template_id === 'string' || body.template_id === null) {
    patch.template_id = body.template_id
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
  } else if (action === 'resend') {
    // Reset only — Approve must be clicked again to actually re-send.
    const prev = (asset.publish_target as Record<string, unknown> | null) ?? null
    if (prev?.platform !== 'metricool') {
      return Response.json(
        { error: 'Only assets already sent to Metricool can be sent again.' },
        { status: 400 },
      )
    }
    const { previous, ...sent } = prev
    const history = Array.isArray(previous) ? previous : []
    patch.status = 'in_review'
    patch.published_at = null
    patch.publish_target = {
      // Per-asset publish hints the next send still needs.
      ...(sent.video_url !== undefined ? { video_url: sent.video_url } : {}),
      ...(sent.media_urls !== undefined ? { media_urls: sent.media_urls } : {}),
      previous: [...history, { ...sent, reset_at: new Date().toISOString() }],
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
    const publishable: PublishableAsset = {
      id: asset.id,
      channel,
      title: (typeof body.title === 'string' ? body.title : asset.title) ?? null,
      body: (typeof body.body === 'string' ? body.body : asset.body) ?? null,
      graphic_url:
        (typeof body.graphic_url === 'string' ? body.graphic_url : (asset.graphic_url as string | null)) ?? null,
      scheduled_at: (asset.scheduled_at as string | null) ?? null,
      publish_target: prevTarget,
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
      patch.published_at = new Date().toISOString()
    }
    patch.publish_target = {
      ...(result.target ?? {}),
      externalId: result.externalId,
      // Keep the "Send again" audit trail across re-sends.
      ...(prevTarget && Array.isArray(prevTarget.previous) ? { previous: prevTarget.previous } : {}),
    }
  }
  // action === 'save' → content-only, status untouched.

  const { data: updated, error: updErr } = await admin
    .from('marketing_assets')
    .update(patch)
    .eq('id', id)
    .select('id, campaign_id, channel, variant, voice, title, body, status, publish_target, published_at, email_template_id, template_id, graphic_url, slot_values, updated_at')
    .single()
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 })

  return Response.json({ asset: updated })
}
