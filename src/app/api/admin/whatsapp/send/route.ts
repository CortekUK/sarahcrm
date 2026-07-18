// POST /api/admin/whatsapp/send
//   { to, mode: 'template' | 'text', templateName?, languageCode?, text?, memberId? }
//
// Admin-only endpoint to send a WhatsApp message via the Meta Cloud API.
// Supports approved templates (needed outside the 24h window / for the test
// number) and free-text (only delivers inside an open 24h window). The lib
// self-logs to whatsapp_log; this route just validates and delegates.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendClubWhatsApp } from '@/lib/whatsapp/client'

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
  return { admin: profile }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    const body = (await req.json().catch(() => ({}))) as {
      to?: string
      mode?: 'template' | 'text'
      templateName?: string
      languageCode?: string
      text?: string
      memberId?: string | null
    }

    if (!body.to || !body.to.trim()) {
      return Response.json({ ok: false, error: 'A recipient number is required.' }, { status: 400 })
    }
    if (body.mode !== 'template' && body.mode !== 'text') {
      return Response.json({ ok: false, error: "mode must be 'template' or 'text'." }, { status: 400 })
    }
    if (body.mode === 'template' && !body.templateName) {
      return Response.json({ ok: false, error: 'A template name is required.' }, { status: 400 })
    }
    if (body.mode === 'text' && !body.text?.trim()) {
      return Response.json({ ok: false, error: 'Message text is required.' }, { status: 400 })
    }

    const result =
      body.mode === 'template'
        ? await sendClubWhatsApp({
            to: body.to,
            memberId: body.memberId ?? null,
            category: 'admin_manual',
            template: {
              name: body.templateName!,
              languageCode: body.languageCode || 'en_US',
            },
          })
        : await sendClubWhatsApp({
            to: body.to,
            memberId: body.memberId ?? null,
            category: 'admin_manual',
            text: body.text!,
          })

    if (!result.sent) {
      return Response.json({ ok: false, error: result.error }, { status: 502 })
    }
    return Response.json({ ok: true, id: result.id })
  } catch (e) {
    console.error('[whatsapp/send] error', e)
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
