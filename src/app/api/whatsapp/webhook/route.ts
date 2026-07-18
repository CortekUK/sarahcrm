// /api/whatsapp/webhook — PUBLIC endpoint the Meta Cloud API calls.
//   GET  — verification handshake (hub.mode / hub.verify_token / hub.challenge).
//   POST — delivery/read status callbacks + inbound messages.
//
// No admin gate: Meta calls this directly. We always return 200 quickly on
// POST (Meta retries on any non-2xx) and never throw from the processing path.

import { NextRequest } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// ── GET: verification handshake ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
  return new Response('Forbidden', { status: 403 })
}

// Cloud API webhook payload shapes we care about (loosely typed — Meta sends
// much more, we only read a few fields).
interface WebhookStatus {
  id?: string
  status?: string
}
interface WebhookMessage {
  from?: string
  id?: string
  type?: string
  text?: { body?: string }
}
interface WebhookValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  statuses?: WebhookStatus[]
  messages?: WebhookMessage[]
}

// Map Cloud API status strings onto our whatsapp_log.status check constraint.
function mapStatus(raw: string | undefined): 'delivered' | 'read' | 'failed' | 'sent' | null {
  switch (raw) {
    case 'delivered':
      return 'delivered'
    case 'read':
      return 'read'
    case 'failed':
      return 'failed'
    case 'sent':
      return 'sent'
    default:
      return null
  }
}

// ── POST: statuses + inbound messages ───────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      entry?: { changes?: { value?: WebhookValue }[] }[]
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return new Response('ok', { status: 200 })
    const admin = getAdminDb()

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value) continue

        // (a) Delivery / read / failure callbacks — update the matching row
        // by wamid. Best-effort; a missing row (e.g. status for a message we
        // didn't originate) is simply skipped.
        for (const status of value.statuses ?? []) {
          const mapped = mapStatus(status.status)
          if (!status.id || !mapped) continue
          try {
            await admin
              .from('whatsapp_log')
              .update({ status: mapped })
              .eq('whatsapp_message_id', status.id)
          } catch (e) {
            console.error('[whatsapp/webhook] status update failed:', e)
          }
        }

        // (b) Inbound messages — insert a new log row. We store the sender in
        // to_phone (the counterparty) and the text body; status 'received'.
        for (const message of value.messages ?? []) {
          const text =
            message.type === 'text'
              ? message.text?.body ?? ''
              : `[${message.type ?? 'message'}]`
          try {
            await admin.from('whatsapp_log').insert({
              to_phone: message.from ?? 'unknown',
              direction: 'inbound',
              template_name: null,
              body: text,
              category: 'inbound',
              status: 'received',
              whatsapp_message_id: message.id ?? null,
            })
          } catch (e) {
            console.error('[whatsapp/webhook] inbound insert failed:', e)
          }
        }
      }
    }
  } catch (e) {
    // Never surface an error to Meta — a non-200 triggers retries.
    console.error('[whatsapp/webhook] error', e)
  }
  return new Response('ok', { status: 200 })
}
