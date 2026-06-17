// POST /api/webhooks/resend
//
// Receives Resend delivery/engagement webhooks and writes open/click/delivery
// state back onto the mail we logged. Resend posts events like:
//   email.delivered | email.opened | email.clicked | email.bounced
// each carrying `data.email_id` — the same id we store as `resend_message_id`
// on BOTH the `communications` (template/campaign sends) and `email_log`
// (automations/transactional) tables. We match on that id and update both.
//
// Idempotent: opened_at/clicked_at are only set when currently null, so a
// later duplicate event never overwrites the first (earliest) timestamp.
//
// Signing: Resend signs with Svix headers (svix-id, svix-timestamp,
// svix-signature). If RESEND_WEBHOOK_SECRET is set we verify; if it's not set
// we log a warning and still process (matching how other routes here treat
// optional secrets), so the integration works before the secret is wired up.

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// Svix signature verification (the scheme Resend uses). Secret looks like
// "whsec_<base64>". Signed content is `${id}.${timestamp}.${rawBody}`; the
// header carries one or more space-separated `v1,<base64sig>` entries.
function verifySvixSignature(args: {
  secret: string
  id: string | null
  timestamp: string | null
  signatureHeader: string | null
  rawBody: string
}): boolean {
  const { secret, id, timestamp, signatureHeader, rawBody } = args
  if (!id || !timestamp || !signatureHeader) return false
  try {
    const key = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
    const keyBytes = Buffer.from(key, 'base64')
    const signedContent = `${id}.${timestamp}.${rawBody}`
    const expected = crypto
      .createHmac('sha256', keyBytes)
      .update(signedContent)
      .digest('base64')
    // Header may contain multiple versioned signatures, e.g. "v1,abc v1,def".
    const candidates = signatureHeader
      .split(' ')
      .map((p) => (p.includes(',') ? p.split(',')[1] : p))
      .filter(Boolean)
    return candidates.some((sig) => {
      const a = Buffer.from(sig)
      const b = Buffer.from(expected)
      return a.length === b.length && crypto.timingSafeEqual(a, b)
    })
  } catch {
    return false
  }
}

interface ResendEvent {
  type?: string
  data?: {
    email_id?: string
    // Resend has used both `email_id` and (older) `id`; accept either.
    id?: string
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret) {
    const ok = verifySvixSignature({
      secret,
      id: req.headers.get('svix-id'),
      timestamp: req.headers.get('svix-timestamp'),
      signatureHeader: req.headers.get('svix-signature'),
      rawBody,
    })
    if (!ok) {
      console.warn('[resend-webhook] signature verification failed')
      return Response.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else {
    console.warn(
      '[resend-webhook] RESEND_WEBHOOK_SECRET not set — processing unverified event',
    )
  }

  let event: ResendEvent
  try {
    event = JSON.parse(rawBody) as ResendEvent
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const type = event.type ?? ''
  const messageId = event.data?.email_id ?? event.data?.id ?? null
  if (!messageId) {
    // Nothing to match on — ack so Resend doesn't retry a malformed payload.
    return Response.json({ ok: true, ignored: 'no email_id' })
  }

  const nowIso = new Date().toISOString()
  const admin = getAdmin()

  try {
    if (type === 'email.opened') {
      await markEngagement(admin, messageId, 'opened_at', nowIso)
    } else if (type === 'email.clicked') {
      // A click implies an open — set both if still null.
      await markEngagement(admin, messageId, 'clicked_at', nowIso)
      await markEngagement(admin, messageId, 'opened_at', nowIso)
      await updateEmailLogStatus(admin, messageId, 'clicked')
    } else if (type === 'email.delivered') {
      await updateEmailLogStatus(admin, messageId, 'delivered')
    } else if (type === 'email.bounced') {
      await updateEmailLogStatus(admin, messageId, 'bounced')
    } else {
      // Unhandled event type — ack without doing anything.
      return Response.json({ ok: true, ignored: type })
    }
  } catch (e) {
    console.error('[resend-webhook] processing error:', e)
    // Still 200 so Resend doesn't hammer retries on a transient DB blip; the
    // event is best-effort engagement data, not transactional state.
    return Response.json({ ok: true, warning: 'processed with errors' })
  }

  return Response.json({ ok: true })
}

// Set an engagement timestamp (opened_at/clicked_at) on the matching
// `communications` row(s) only when currently null — keeps the earliest event
// and stays idempotent across duplicate webhook deliveries. (email_log has no
// engagement columns, so engagement is reflected there via status instead.)
async function markEngagement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  messageId: string,
  column: 'opened_at' | 'clicked_at',
  iso: string,
): Promise<void> {
  await admin
    .from('communications')
    .update({ [column]: iso })
    .eq('resend_message_id', messageId)
    .is(column, null)

  // Promote status so the comms feed reflects the latest engagement, without
  // demoting a stronger state (clicked > opened > sent).
  const status = column === 'clicked_at' ? 'clicked' : 'opened'
  const guard = column === 'clicked_at' ? ['clicked'] : ['clicked', 'opened']
  await admin
    .from('communications')
    .update({ status })
    .eq('resend_message_id', messageId)
    .not('status', 'in', `(${guard.join(',')})`)
}

// email_log has no opened_at/clicked_at columns — record engagement/delivery
// via its `status` field. Don't downgrade an already-stronger status.
async function updateEmailLogStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  messageId: string,
  status: 'delivered' | 'clicked' | 'bounced',
): Promise<void> {
  // For delivered/clicked, don't clobber a 'failed'/'bounced' row. Bounced is
  // a terminal failure state and always wins.
  if (status === 'bounced') {
    await admin
      .from('email_log')
      .update({ status: 'bounced' })
      .eq('resend_message_id', messageId)
    return
  }
  await admin
    .from('email_log')
    .update({ status })
    .eq('resend_message_id', messageId)
    .not('status', 'in', '(failed,bounced,clicked)')
}
