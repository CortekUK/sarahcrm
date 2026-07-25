// Single campaign + its assets (the approval queue payload).
//
// GET /api/admin/marketing/campaigns/[id]
//   → { campaign, assets }
//
// Admin only. Read via the service-role client.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = getAdmin()

  const { data: campaign, error: cErr } = await admin
    .from('marketing_campaigns')
    .select('id, title, source_type, event_id, topic_brief, transcript, audio_url, status, created_at, updated_at')
    .eq('id', id)
    .single()
  if (cErr || !campaign) {
    return Response.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const { data: assets, error: aErr } = await admin
    .from('marketing_assets')
    .select('id, campaign_id, channel, variant, voice, title, body, status, publish_target, published_at, email_template_id, template_id, graphic_url, slot_values, created_at, updated_at')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })
  if (aErr) return Response.json({ error: aErr.message }, { status: 500 })

  return Response.json({ campaign, assets: assets ?? [] })
}
