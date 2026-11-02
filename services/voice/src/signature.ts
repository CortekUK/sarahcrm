// X-Twilio-Signature validation for the webhooks AND the ConversationRelay
// WebSocket handshake ("Conversation Relay includes an X-Twilio-Signature
// header in the initial WebSocket handshake request" —
// https://www.twilio.com/docs/voice/conversationrelay/onboarding).
//
// The signature is HMAC-SHA1 over the exact public URL Twilio requested plus
// the sorted POST params, keyed by the auth token
// (https://www.twilio.com/docs/usage/webhooks/webhooks-security). Behind ngrok /
// Railway the request reaches us as http://localhost…, so the URL is rebuilt
// from VOICE_PUBLIC_URL + the original path/query rather than from req.host.
import twilio from 'twilio'

export type RequestValidator = (
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, unknown>,
) => boolean

export const twilioValidator: RequestValidator = (authToken, signature, url, params) =>
  twilio.validateRequest(authToken, signature, url, params as Record<string, string>)

export interface SignatureCheck {
  authToken: string | undefined
  signature: string | undefined
  /** Candidate public URLs (first match wins). */
  urls: string[]
  params?: Record<string, unknown>
  validator?: RequestValidator
}

export type SignatureResult = { ok: true } | { ok: false; reason: 'no_auth_token' | 'no_signature' | 'mismatch' }

export function checkSignature(c: SignatureCheck): SignatureResult {
  if (!c.authToken) return { ok: false, reason: 'no_auth_token' }
  if (!c.signature) return { ok: false, reason: 'no_signature' }
  const validate = c.validator ?? twilioValidator
  for (const url of c.urls) {
    if (validate(c.authToken, c.signature, url, c.params ?? {})) return { ok: true }
  }
  return { ok: false, reason: 'mismatch' }
}

/** Public URL Twilio called for an HTTP webhook. */
export function webhookUrl(publicUrl: string, originalUrl: string): string {
  return `${publicUrl.replace(/\/+$/, '')}${originalUrl.startsWith('/') ? '' : '/'}${originalUrl}`
}

/**
 * Candidate URLs for the WS handshake: the wss:// URL we put in the TwiML
 * (what Twilio dialled), plus the https:// form in case it signs that.
 */
export function relayUrls(publicUrl: string, originalUrl: string): string[] {
  const https = webhookUrl(publicUrl, originalUrl)
  const wss = https.replace(/^http/i, 'ws')
  return [wss, https]
}
