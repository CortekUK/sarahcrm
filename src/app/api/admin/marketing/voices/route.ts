// Brand-voice manager API (Module 3).
//
// GET   /api/admin/marketing/voices          → { voices: [club, sarah] }
// PATCH /api/admin/marketing/voices           (also accepts PUT)
//   body: { key: 'club'|'sarah', name?, guidance?, samples?: {label,text}[] }
//   → { voice }
//
// Admin only (self-gated — /api/* is not covered by the /dashboard
// middleware). Reads/writes via the service-role client (marketing_*
// tables aren't in the generated types).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VOICE_KEYS = ['club', 'sarah'] as const

const sampleSchema = z.object({
  label: z.string().max(200),
  text: z.string().max(20000),
})

const patchSchema = z.object({
  key: z.enum(VOICE_KEYS),
  name: z.string().min(1).max(120).optional(),
  guidance: z.string().max(20000).nullable().optional(),
  samples: z.array(sampleSchema).max(50).optional(),
})

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const admin = getAdmin()
  const { data, error } = await admin
    .from('marketing_voices')
    .select('id, key, name, guidance, samples, updated_at')
    .order('key', { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ voices: data ?? [] })
}

async function update(req: NextRequest) {
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
      { error: 'Invalid voice payload. Expected { key, name?, guidance?, samples: {label,text}[] }.' },
      { status: 400 },
    )
  }

  const { key, name, guidance, samples } = parsed.data
  const patch: Record<string, unknown> = { updated_by: auth.profile.id }
  if (name !== undefined) patch.name = name
  if (guidance !== undefined) patch.guidance = guidance
  if (samples !== undefined) patch.samples = samples

  const admin = getAdmin()
  const { data, error } = await admin
    .from('marketing_voices')
    .update(patch)
    .eq('key', key)
    .select('id, key, name, guidance, samples, updated_at')
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Voice not found' }, { status: 404 })

  return Response.json({ voice: data })
}

export const PATCH = update
export const PUT = update
