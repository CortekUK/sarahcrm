// Segment preview — Marketing AI Engine, Module 4.
//
// POST /api/admin/marketing/segments/preview
//   body: { rules }  OR  { segment_id }
//   → { count, sample: [{ name, email }] }   (first 8 matches)
//
// Powers the LIVE matching-member count in the segment builder and the
// wizard's smart-segment step. Admin only.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { resolveSegmentRecipients } from '@/lib/marketing/segments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const rulesSchema = z.object({
  tiers: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  tag_ids: z.array(z.string()).optional(),
  tag_match: z.enum(['any', 'all']).optional(),
})

const bodySchema = z.object({
  rules: rulesSchema.optional(),
  segment_id: z.string().uuid().optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid preview payload. Expected { rules } or { segment_id }.' },
      { status: 400 },
    )
  }

  const admin = getAdmin()

  // Resolve rules — either inline, or loaded from a saved segment.
  let rules: unknown = parsed.data.rules ?? {}
  if (parsed.data.segment_id) {
    const { data: seg, error } = await admin
      .from('marketing_segments')
      .select('rules')
      .eq('id', parsed.data.segment_id)
      .single()
    if (error || !seg) {
      return Response.json({ error: 'Segment not found' }, { status: 404 })
    }
    rules = seg.rules ?? {}
  }

  try {
    const recipients = await resolveSegmentRecipients(admin, rules)
    const sample = recipients.slice(0, 8).map((r) => ({
      name: `${r.first_name} ${r.last_name}`.trim() || 'Unnamed',
      email: r.email,
    }))
    return Response.json({ count: recipients.length, sample })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Preview failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
