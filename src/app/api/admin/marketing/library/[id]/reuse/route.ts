// Reuse a library piece as a starting point (Module 5).
//
// POST /api/admin/marketing/library/[id]/reuse
//   → { campaign_id }   (redirect target — the fresh campaign detail page)
//
// Creates a NEW topic campaign + a NEW draft asset cloned from the source
// asset, so the admin lands in a fresh campaign to edit/regenerate. The
// ORIGINAL asset is never mutated — this only ever INSERTs new rows.
//
// Admin only. Writes via the untyped service-role client.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { CHANNEL_META, isMarketingChannel } from '@/lib/marketing/channels'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = getAdmin()

  // Load the source asset (READ-ONLY — never mutated).
  const { data: source, error: sErr } = await admin
    .from('marketing_assets')
    .select(
      'id, channel, variant, voice, title, body, event_id, sponsor_member_id, member_id',
    )
    .eq('id', id)
    .single()
  if (sErr || !source) {
    return Response.json({ error: 'Source asset not found' }, { status: 404 })
  }

  const channel = source.channel as string
  const channelLabel =
    isMarketingChannel(channel) ? CHANNEL_META[channel].label : channel
  const originalTitle = (source.title as string | null)?.trim() || channelLabel
  const originalBody = (source.body as string | null) ?? ''

  // Seed the new campaign's topic brief from the original piece so the
  // generator (if the admin regenerates) has real material to work from.
  const topicBrief = [
    `Reuse of a previous ${channelLabel} piece titled "${originalTitle}".`,
    'Use it as a starting point — keep the theme and angle, but refresh the copy.',
    '',
    'Original copy:',
    originalBody,
  ].join('\n')

  // 1. New topic campaign.
  const { data: campaign, error: cErr } = await admin
    .from('marketing_campaigns')
    .insert({
      title: `Reuse: ${originalTitle}`.slice(0, 200),
      source_type: 'topic',
      topic_brief: topicBrief,
      status: 'draft',
      created_by: auth.profile.id,
    })
    .select('id')
    .single()
  if (cErr || !campaign) {
    return Response.json({ error: cErr?.message ?? 'Failed to create campaign' }, { status: 500 })
  }
  const campaignId = campaign.id as string

  // 2. New draft asset cloned from the source (body copied verbatim). For
  //    newsletters we deliberately DO NOT copy email_template_id/body_html/
  //    body_json — sharing the designer template would risk mutating the
  //    original; a regenerate here mints a fresh template instead.
  const { error: aErr } = await admin.from('marketing_assets').insert({
    campaign_id: campaignId,
    channel,
    variant: (source.variant as string | null) ?? null,
    voice: (source.voice as string | null) ?? null,
    title: source.title ?? null,
    body: originalBody,
    status: 'draft',
    event_id: (source.event_id as string | null) ?? null,
    sponsor_member_id: (source.sponsor_member_id as string | null) ?? null,
    member_id: (source.member_id as string | null) ?? null,
  })
  if (aErr) {
    return Response.json({ error: aErr.message }, { status: 500 })
  }

  // Campaign has a draft to review.
  await admin.from('marketing_campaigns').update({ status: 'ready' }).eq('id', campaignId)

  return Response.json({ campaign_id: campaignId }, { status: 201 })
}
