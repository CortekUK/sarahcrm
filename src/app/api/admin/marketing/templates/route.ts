// Template Graphics — template CRUD.
//
// GET    /api/admin/marketing/templates            → { templates }
// POST   /api/admin/marketing/templates            → { template }   (create)
// PATCH  /api/admin/marketing/templates            → { template }   (update, body.id)
// DELETE /api/admin/marketing/templates?id=<uuid>  → { ok }
//
// Admin-only (requireAdmin), service-role writes (getAdmin). Slots + background
// are Zod-validated. Templates are pure layout definitions — no photos/text are
// stored here (those are filled per-post at generation into slot_values).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const styleSchema = z
  .object({
    font: z.enum(['serif', 'sans']).optional(),
    color: z.string().max(32).optional(),
    size: z.number().min(8).max(400).optional(),
  })
  .optional()

const slotSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['photo', 'heading', 'subtext', 'fixed']),
  zone: z.enum(['top', 'middle', 'bottom']),
  align: z.enum(['left', 'center', 'right']),
  text_source: z.enum(['ai', 'fixed']),
  fixed_text: z.string().max(2000).optional(),
  style: styleSchema,
})

const backgroundSchema = z.object({
  type: z.enum(['color', 'photo']),
  value: z.string().max(2000),
})

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  shape: z.enum(['square', 'portrait', 'landscape']),
  background: backgroundSchema,
  slots: z.array(slotSchema).max(24),
})

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const admin = getAdmin()
  const { data, error } = await admin
    .from('marketing_templates')
    .select('id, name, shape, background, slots, created_at, updated_at')
    .order('created_at', { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ templates: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const parsed = await parseBody(req)
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })
  const { name, shape, background, slots } = parsed.data

  const admin = getAdmin()
  const { data, error } = await admin
    .from('marketing_templates')
    .insert({ name, shape, background, slots, created_by: auth.profile.id })
    .select('id, name, shape, background, slots, created_at, updated_at')
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ template: data })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const parsed = await parseBody(req)
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })
  const { id, name, shape, background, slots } = parsed.data
  if (!id) return Response.json({ error: 'id is required for update.' }, { status: 400 })

  const admin = getAdmin()
  const { data, error } = await admin
    .from('marketing_templates')
    .update({ name, shape, background, slots })
    .eq('id', id)
    .select('id, name, shape, background, slots, created_at, updated_at')
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ template: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'id query param is required.' }, { status: 400 })

  const admin = getAdmin()
  const { error } = await admin.from('marketing_templates').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

async function parseBody(
  req: NextRequest,
): Promise<{ data: z.infer<typeof upsertSchema> } | { error: string }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { error: 'Invalid JSON body' }
  }
  const parsed = upsertSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: `Invalid template: ${parsed.error.issues[0]?.message ?? 'validation failed'}` }
  }
  return { data: parsed.data }
}
