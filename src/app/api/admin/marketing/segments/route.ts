// Saved-segment CRUD — Marketing AI Engine, Module 4.
//
// GET    /api/admin/marketing/segments            → { segments: [...] }
// POST   /api/admin/marketing/segments            body { name, rules } → { segment }
// PATCH  /api/admin/marketing/segments            body { id, name?, rules? } → { segment }
// DELETE /api/admin/marketing/segments?id=<uuid>   → { ok: true }
//
// Admin only (self-gated — /api/* is not covered by the /dashboard
// middleware). Reads/writes via the service-role client (marketing_*
// tables aren't in the generated types).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const rulesSchema = z.object({
  tiers: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  tag_ids: z.array(z.string()).optional(),
  tag_match: z.enum(['any', 'all']).optional(),
})

const createSchema = z.object({
  name: z.string().min(1).max(160),
  rules: rulesSchema.default({}),
})

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160).optional(),
  rules: rulesSchema.optional(),
})

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const admin = getAdmin()
  const { data, error } = await admin
    .from('marketing_segments')
    .select('id, name, rules, created_by, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ segments: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid segment payload. Expected { name, rules }.' },
      { status: 400 },
    )
  }

  const admin = getAdmin()
  const { data, error } = await admin
    .from('marketing_segments')
    .insert({
      name: parsed.data.name,
      rules: parsed.data.rules,
      created_by: auth.profile.id,
    })
    .select('id, name, rules, created_by, created_at, updated_at')
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ segment: data })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid segment payload. Expected { id, name?, rules? }.' },
      { status: 400 },
    )
  }

  const patch: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.rules !== undefined) patch.rules = parsed.data.rules
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const admin = getAdmin()
  const { data, error } = await admin
    .from('marketing_segments')
    .update(patch)
    .eq('id', parsed.data.id)
    .select('id, name, rules, created_by, created_at, updated_at')
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Segment not found' }, { status: 404 })

  return Response.json({ segment: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'id query param required' }, { status: 400 })

  const admin = getAdmin()
  const { error } = await admin.from('marketing_segments').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
