// Shared WhatsApp (Meta Cloud API) helpers — one normalizer + one sender that
// every WhatsApp flow reuses, so the sending config and the logging discipline
// live in exactly one place. Mirrors src/lib/email/club-email.ts: a single
// sender that best-effort logs every send to `whatsapp_log` and NEVER throws
// from the logging path.

// ── Phone normalization ────────────────────────────────────────────
// The Cloud API `to` field wants a digits-only E.164 number WITHOUT the
// leading `+` (e.g. `447700900123`). `profiles.phone` is free-text with no
// enforced format, so we normalize defensively. Rules (default country UK/44):
//   1. Strip spaces, dashes, parens, dots and any other non-digit/non-plus.
//   2. Leading `+`            → already international; keep the digits.
//   3. Leading `00`           → international access prefix; drop the `00`.
//   4. Leading `0` (national) → UK national trunk; drop it, prepend `44`.
//   5. Otherwise (bare digits with no country code) → prepend the default.
// Returns null if the result can't produce at least 8 digits.
export function normalizeE164(raw: string, defaultCountryCode = '44'): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const hadPlus = trimmed.startsWith('+')
  // Strip everything that isn't a digit.
  let digits = trimmed.replace(/\D+/g, '')
  if (!digits) return null

  if (hadPlus) {
    // Already international — digits are the full country-coded number.
  } else if (digits.startsWith('00')) {
    // 00 international access prefix → strip it.
    digits = digits.slice(2)
  } else if (digits.startsWith('0')) {
    // National trunk 0 → drop it and prepend the default country code.
    digits = defaultCountryCode + digits.slice(1)
  } else if (digits.startsWith(defaultCountryCode)) {
    // Bare number already carrying the default country code — leave as-is.
  } else if (digits.length >= 11) {
    // Already a full international number carrying its OWN country code
    // (e.g. a Pakistani 92… or US 1… number, 11–15 digits). Do NOT prepend
    // the default — that was corrupting stored E.164 contacts
    // (923371406125 → 44923371406125 → "not in allowed list"). A bare UK
    // national number (no trunk 0) is at most 10 digits, so ≥11 digits with
    // no leading 0/+ means the country code is already present.
  } else {
    // Bare national number without a trunk 0 — prepend the default code.
    digits = defaultCountryCode + digits
  }

  if (digits.length < 8) return null
  return digits
}

export interface WhatsAppSendResult {
  sent: boolean
  id?: string
  error?: string
}

// Best-effort: record every WhatsApp message in `whatsapp_log` so the admin
// can see what went out (and its delivery status via webhook). Own lazy
// service-role client (bypasses RLS). Never throws — mirrors logEmail().
async function logWhatsApp(entry: {
  toPhone: string
  templateName?: string | null
  body?: string | null
  category?: string | null
  memberId?: string | null
  status: 'sent' | 'failed'
  error?: string | null
  messageId?: string | null
}): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(url, key, { auth: { persistSession: false } })
    await admin.from('whatsapp_log').insert({
      to_phone: entry.toPhone,
      direction: 'outbound',
      template_name: entry.templateName ?? null,
      body: entry.body ?? null,
      category: entry.category ?? null,
      status: entry.status,
      error: entry.error ?? null,
      whatsapp_message_id: entry.messageId ?? null,
      member_id: entry.memberId ?? null,
    })
  } catch (e) {
    console.error('[whatsapp_log] insert failed:', e)
  }
}

// Single WhatsApp Cloud API sender. Supports BOTH approved templates (required
// outside the 24h customer-service window / for the test number) and free-text
// (only delivers inside an open 24h window). Exactly one of `template` / `text`
// must be given. Logs every send to whatsapp_log (pass `category` to label it).
export async function sendClubWhatsApp(args: {
  to: string
  memberId?: string | null
  category?: string
  template?: { name: string; languageCode?: string; components?: unknown[] }
  text?: string
}): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v25.0'
  if (!token || !phoneNumberId) return { sent: false, error: 'WhatsApp not configured' }

  if (!args.template && !args.text) {
    return { sent: false, error: 'Provide either a template or text to send' }
  }
  if (args.template && args.text) {
    return { sent: false, error: 'Provide only one of template or text' }
  }

  // A human-readable summary of what was sent, for the log `body`.
  const summary = args.template
    ? `Template: ${args.template.name}`
    : (args.text ?? '')

  const to = normalizeE164(args.to)
  if (!to) {
    // Still log the attempt as failed so the admin sees the bad number.
    await logWhatsApp({
      toPhone: args.to,
      templateName: args.template?.name ?? null,
      body: summary,
      category: args.category,
      memberId: args.memberId,
      status: 'failed',
      error: 'Invalid phone number',
    })
    return { sent: false, error: 'Invalid phone number' }
  }

  // Build the Cloud API payload for template or free-text.
  const payload: Record<string, unknown> = args.template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: args.template.name,
          language: { code: args.template.languageCode || 'en_US' },
          ...(args.template.components ? { components: args.template.components } : {}),
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: args.text },
      }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    )
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[]
      error?: { message?: string }
    }
    if (!res.ok) {
      const error = json.error?.message || `WhatsApp ${res.status}`
      await logWhatsApp({
        toPhone: to,
        templateName: args.template?.name ?? null,
        body: summary,
        category: args.category,
        memberId: args.memberId,
        status: 'failed',
        error,
      })
      return { sent: false, error }
    }
    const id = json.messages?.[0]?.id
    await logWhatsApp({
      toPhone: to,
      templateName: args.template?.name ?? null,
      body: summary,
      category: args.category,
      memberId: args.memberId,
      status: 'sent',
      messageId: id ?? null,
    })
    return { sent: true, id }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown send error'
    await logWhatsApp({
      toPhone: to,
      templateName: args.template?.name ?? null,
      body: summary,
      category: args.category,
      memberId: args.memberId,
      status: 'failed',
      error,
    })
    return { sent: false, error }
  }
}
