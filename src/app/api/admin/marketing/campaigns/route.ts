// Marketing campaigns — list + create.
//
// GET  /api/admin/marketing/campaigns          → recent campaigns (+ asset counts)
// POST /api/admin/marketing/campaigns          → create a campaign row
//   body: { title, source_type:'event'|'topic'|'audio',
//           event_id?, topic_brief?, transcript?, audio_url? }
//
// Creation only persists the source; asset generation is a separate call to
// /api/admin/marketing/generate. Admin only. Writes use the service-role client.

import { NextRequest } from 'next/server'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const admin = getAdmin()
  const { data: campaigns, error } = await admin
    .from('marketing_campaigns')
    .select('id, title, source_type, event_id, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Lightweight per-campaign asset counts for the list view.
  const ids = (campaigns ?? []).map((c: { id: string }) => c.id)
  const counts: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: assets } = await admin
      .from('marketing_assets')
      .select('campaign_id')
      .in('campaign_id', ids)
    for (const a of (assets ?? []) as { campaign_id: string }[]) {
      counts[a.campaign_id] = (counts[a.campaign_id] ?? 0) + 1
    }
  }
  const withCounts = (campaigns ?? []).map((c: { id: string }) => ({
    ...c,
    asset_count: counts[c.id] ?? 0,
  }))
  return Response.json({ campaigns: withCounts })
}

interface CreateBody {
  title?: string
  source_type?: 'event' | 'topic' | 'audio'
  event_id?: string | null
  topic_brief?: string | null
  transcript?: string | null
  audio_url?: string | null
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sourceType = body.source_type
  if (sourceType !== 'event' && sourceType !== 'topic' && sourceType !== 'audio') {
    return Response.json({ error: 'source_type must be event, topic or audio' }, { status: 400 })
  }
  const title = body.title?.trim()
  if (!title) return Response.json({ error: 'title is required' }, { status: 400 })

  // Validate the source payload matches the declared source_type.
  if (sourceType === 'event' && !body.event_id) {
    return Response.json({ error: 'event_id is required for an event source' }, { status: 400 })
  }
  if (sourceType === 'topic' && !body.topic_brief?.trim()) {
    return Response.json({ error: 'topic_brief is required for a topic source' }, { status: 400 })
  }
  if (sourceType === 'audio' && !body.transcript?.trim()) {
    return Response.json(
      { error: 'transcript is required for an audio source (transcribe first)' },
      { status: 400 },
    )
  }

  const admin = getAdmin()
  const { data, error } = await admin
    .from('marketing_campaigns')
    .insert({
      title,
      source_type: sourceType,
      event_id: sourceType === 'event' ? body.event_id : null,
      topic_brief: sourceType === 'topic' ? body.topic_brief?.trim() : null,
      transcript: sourceType === 'audio' ? body.transcript?.trim() : null,
      audio_url: body.audio_url ?? null,
      status: 'draft',
      created_by: auth.profile.id,
    })
    .select('id, title, source_type, status, created_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ campaign: data }, { status: 201 })
}
