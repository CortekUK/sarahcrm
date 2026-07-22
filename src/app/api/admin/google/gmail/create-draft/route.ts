// POST /api/admin/google/gmail/create-draft
//
// Saves a reply as a real DRAFT in the Gmail thread. Nothing is sent — Sarah
// reviews and sends from Gmail. Recipient + threading headers are derived from
// the thread server-side so the draft lands correctly in the conversation.
// Admin only.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gmailClient } from '@/lib/google/client'
import { createDraftReply, listThreadMessages } from '@/lib/google/gmail'

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
  if (!profile || profile.role !== 'admin') return { error: 'Admin only.', status: 403 as const }
  return { profile }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: { thread_id?: string; subject?: string; body_html?: string; to?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.thread_id || !body.subject || !body.body_html) {
    return Response.json({ error: 'thread_id, subject and body_html are required.' }, { status: 400 })
  }

  try {
    const gmail = gmailClient()
    const msgs = await listThreadMessages(gmail, body.thread_id)
    if (!msgs.length) return Response.json({ error: 'Thread not found.' }, { status: 404 })
    const last = msgs[msgs.length - 1]

    // Reply to the last inbound sender (fallback to provided `to`).
    const lastInbound = [...msgs].reverse().find((m) => m.fromEmail)
    const to = body.to || lastInbound?.fromEmail || last.fromEmail
    if (!to) return Response.json({ error: 'Could not determine a recipient.' }, { status: 422 })

    // Threading headers so Gmail files the draft in the conversation.
    const references = [last.references, last.headerMessageId].filter(Boolean).join(' ') || undefined

    const { draftId } = await createDraftReply({
      threadId: body.thread_id,
      to,
      subject: body.subject,
      bodyHtml: body.body_html,
      inReplyTo: last.headerMessageId,
      references,
    })
    return Response.json({ ok: true, draft_id: draftId, to })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create draft'
    return Response.json({ error: message }, { status: 502 })
  }
}
