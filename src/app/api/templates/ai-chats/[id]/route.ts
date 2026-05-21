// Per-chat operations.
//
// GET    /api/templates/ai-chats/[id] -> { chat, messages }
// DELETE /api/templates/ai-chats/[id] -> { ok: true }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only.', status: 403 as const }
  }
  return { supabase, profile }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return Response.json({ error: ctx.error }, { status: ctx.status })
  const { id } = await params

  const { data: chat, error: chatError } = await ctx.supabase
    .from('template_ai_chats')
    .select('id, title, template_id, created_at, updated_at, user_id')
    .eq('id', id)
    .single()
  if (chatError || !chat || chat.user_id !== ctx.profile.id) {
    return Response.json({ error: 'Chat not found.' }, { status: 404 })
  }

  const { data: messages, error: msgError } = await ctx.supabase
    .from('template_ai_messages')
    .select('id, role, content, blocks_snapshot, subject_snapshot, preheader_snapshot, created_at')
    .eq('chat_id', id)
    .order('created_at', { ascending: true })

  if (msgError) return Response.json({ error: msgError.message }, { status: 500 })
  return Response.json({ chat, messages: messages ?? [] })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return Response.json({ error: ctx.error }, { status: ctx.status })
  const { id } = await params

  const { error } = await ctx.supabase
    .from('template_ai_chats')
    .delete()
    .eq('id', id)
    .eq('user_id', ctx.profile.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
