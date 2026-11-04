// /api/whatsapp/webhook — PUBLIC endpoint the Meta Cloud API calls.
//   GET  — verification handshake (hub.mode / hub.verify_token / hub.challenge).
//   POST — delivery/read status callbacks + inbound messages.
//
// No admin gate: Meta calls this directly. Every POST must carry Meta's
// X-Hub-Signature-256 (HMAC-SHA256 of the raw body keyed with the app secret,
// WHATSAPP_APP_SECRET); unsigned/forged payloads are refused with 401, and if
// the secret isn't configured nothing is processed (503). Once verified we
// always return 200 quickly (Meta retries on any non-2xx) and never throw from
// the processing path.

import { NextRequest } from 'next/server'
import crypto from 'crypto'
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

// Meta signs the exact raw body: header is `sha256=<hex hmac>`.
function verifyMetaSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(header.slice('sha256='.length), 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ── POST: statuses + inbound messages ───────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    console.error('[whatsapp/webhook] WHATSAPP_APP_SECRET not set — refusing unverified payload')
    return new Response('Webhook not configured', { status: 503 })
  }
  if (!verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret)) {
    console.warn('[whatsapp/webhook] signature verification failed')
    return new Response('Invalid signature', { status: 401 })
  }

  try {
    let body: { entry?: { changes?: { value?: WebhookValue }[] }[] } = {}
    try {
      body = JSON.parse(rawBody)
    } catch {
      // Malformed but signed — nothing to process; ack so Meta doesn't retry.
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
