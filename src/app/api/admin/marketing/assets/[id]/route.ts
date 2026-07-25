// Marketing asset mutations — the approval queue's server side.
//
// PATCH /api/admin/marketing/assets/[id]
//   body: { action: 'save' | 'approve' | 'reject' | 'in_review',
//           title?, body? }
//
// ALL status transitions live here (never client-side). Critically, APPROVE is
// the human publish gate: nothing is ever published without an explicit approve
// action. On approve for a mock channel (blog/linkedin/social/PR), we route
// through the publishing adapter (MockPublisher today) and only then stamp
// status='published' + published_at. Admin only; writes use service-role.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { getPublisher } from '@/lib/marketing/publish'
import type { MarketingChannel, PublishableAsset } from '@/lib/marketing/publish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PatchBody {
  action?: 'save' | 'approve' | 'reject' | 'in_review'
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
    .select('id, campaign_id, channel, voice, title, body, status, publish_target, graphic_url')
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

  if (action === 'reject') {
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
    const publishable: PublishableAsset = {
      id: asset.id,
      channel,
      title: (typeof body.title === 'string' ? body.title : asset.title) ?? null,
      body: (typeof body.body === 'string' ? body.body : asset.body) ?? null,
      graphic_url:
        (typeof body.graphic_url === 'string' ? body.graphic_url : (asset.graphic_url as string | null)) ?? null,
      publish_target: (asset.publish_target as Record<string, unknown> | null) ?? null,
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
    patch.status = 'published'
    patch.published_at = new Date().toISOString()
    patch.publish_target = { ...(result.target ?? {}), externalId: result.externalId }
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
