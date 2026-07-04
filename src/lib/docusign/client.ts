// DocuSign eSignature client — JWT Grant (server-to-server), no SDK.
//
// Auth uses the JWT Bearer grant: we sign a short-lived RS256 assertion with
// the app's RSA private key and exchange it for an access token. This needs a
// ONE-TIME consent grant per DocuSign user (visit `getConsentUrl()` once and
// click Allow); after that the server mints tokens with no browser involved.
//
// Everything talks to the DocuSign REST API directly with `fetch` (same style
// as the Resend sender in club-email.ts) so there's no heavy dependency.
//
// Demo/sandbox defaults are baked in and overridable via env:
//   DOCUSIGN_INTEGRATION_KEY   Integration Key (client id) GUID
//   DOCUSIGN_USER_ID           API Username / impersonated user GUID (NOT email)
//   DOCUSIGN_ACCOUNT_ID        API Account ID GUID
//   DOCUSIGN_PRIVATE_KEY       RSA private key PEM (BEGIN RSA PRIVATE KEY …)
//   DOCUSIGN_BASE_PATH         https://demo.docusign.net   (prod: https://www.docusign.net or region host)
//   DOCUSIGN_OAUTH_BASE        account-d.docusign.com      (prod: account.docusign.com)
//   DOCUSIGN_REDIRECT_URI      redirect uri registered on the app (for consent)

import crypto from 'crypto'

export interface DocuSignConfig {
  integrationKey: string
  userId: string
  accountId: string
  privateKey: string
  basePath: string
  oauthBase: string
  redirectUri: string
}

// Raised for any DocuSign failure. `consentUrl` is set specifically when the
// user has not yet granted consent — the caller surfaces it so an admin can
// click through once.
export class DocuSignError extends Error {
  consentUrl?: string
  status?: number
  constructor(message: string, opts?: { consentUrl?: string; status?: number }) {
    super(message)
    this.name = 'DocuSignError'
    this.consentUrl = opts?.consentUrl
    this.status = opts?.status
  }
}

// Normalises whatever form the PEM arrived in (env files mangle multi-line
// values in many ways) into a valid PEM: strips wrapping quotes, restores
// escaped newlines, and — if the key ended up on one line / with stray spaces —
// rebuilds the 64-char body between the BEGIN/END markers.
function normalizePem(raw: string): string {
  let k = raw.trim()
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1)
  }
  k = k.replace(/\\n/g, '\n').trim()
  if (k.includes('\n') && /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(k)) return k
  // Reconstruct from a collapsed single line (spaces instead of newlines).
  const m = k.match(/-----BEGIN ([A-Z ]+?)-----([\s\S]*?)-----END \1-----/)
  if (m) {
    const type = m[1].trim()
    const body = m[2].replace(/[^A-Za-z0-9+/=]/g, '')
    const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body
    return `-----BEGIN ${type}-----\n${wrapped}\n-----END ${type}-----`
  }
  return k
}

// Reads + validates env. Returns null (not throws) when unconfigured so callers
// can give a friendly "DocuSign isn't set up yet" message.
export function getDocuSignConfig(): DocuSignConfig | null {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY
  const userId = process.env.DOCUSIGN_USER_ID
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID
  let privateKey = process.env.DOCUSIGN_PRIVATE_KEY
  if (!integrationKey || !userId || !accountId || !privateKey) return null
  // Env files mangle multi-line PEMs — normalise to a valid key.
  privateKey = normalizePem(privateKey)
  return {
    integrationKey,
    userId,
    accountId,
    privateKey,
    basePath: (process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net').replace(/\/+$/, ''),
    oauthBase: (process.env.DOCUSIGN_OAUTH_BASE || 'account-d.docusign.com').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    redirectUri: process.env.DOCUSIGN_REDIRECT_URI || 'https://sarahcrm.vercel.app/api/admin/docusign/consent',
  }
}

// One-time consent URL. An admin opens this, signs into DocuSign and clicks
// Allow; from then on JWT tokens are granted without interaction.
export function getConsentUrl(cfg: DocuSignConfig): string {
  const params = new URLSearchParams({
    response_type: 'code',
    scope: 'signature impersonation',
    client_id: cfg.integrationKey,
    redirect_uri: cfg.redirectUri,
  })
  return `https://${cfg.oauthBase}/oauth/auth?${params.toString()}`
}

// Where DocuSign should push envelope events (Connect webhook). Derived from an
// explicit DOCUSIGN_WEBHOOK_URL, or the app URL + /api/docusign/webhook. A
// shared secret is appended as ?t= for the webhook to verify. Returns null for
// localhost (DocuSign can't reach it) so we don't attach an undeliverable hook.
function webhookUrl(): string | null {
  // Opt-in: only attach a Connect notification when a secret is configured.
  const secret = process.env.DOCUSIGN_CONNECT_SECRET
  if (!secret) return null
  const explicit = process.env.DOCUSIGN_WEBHOOK_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL
  const base = explicit || (appUrl ? `${appUrl.replace(/\/+$/, '')}/api/docusign/webhook` : null)
  if (!base) return null
  if (/localhost|127\.0\.0\.1/.test(base)) return null // DocuSign can't reach localhost
  return `${base}${base.includes('?') ? '&' : '?'}t=${encodeURIComponent(secret)}`
}

// Per-envelope Connect notification so status changes are PUSHED to us in real
// time (no polling). Undefined when no reachable webhook URL is configured.
export function buildEventNotification(): Record<string, unknown> | undefined {
  const url = webhookUrl()
  if (!url) return undefined
  return {
    url,
    loggingEnabled: 'true',
    requireAcknowledgment: 'true',
    includeDocuments: 'false',
    envelopeEvents: ['completed', 'declined', 'voided', 'delivered', 'sent'].map((s) => ({
      envelopeEventStatusCode: s,
    })),
    eventData: { version: 'restv2.1', format: 'json', includeData: ['recipients'] },
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function signAssertion(cfg: DocuSignConfig): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: cfg.integrationKey,
    sub: cfg.userId,
    aud: cfg.oauthBase,
    iat: now,
    exp: now + 3600,
    scope: 'signature impersonation',
  }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  let signature: Buffer
  try {
    signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), cfg.privateKey)
  } catch {
    throw new DocuSignError('DocuSign private key is invalid — check DOCUSIGN_PRIVATE_KEY.')
  }
  return `${signingInput}.${base64url(signature)}`
}

// In-memory token cache (tokens last ~1h). Keyed by nothing — single app user.
let cachedToken: { token: string; expiresAt: number } | null = null

export async function getAccessToken(cfg: DocuSignConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token

  const assertion = signAssertion(cfg)
  const res = await fetch(`https://${cfg.oauthBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }

  if (!res.ok || !json.access_token) {
    // The signer/user hasn't consented yet → give the admin the consent link.
    if (json.error === 'consent_required') {
      throw new DocuSignError(
        'DocuSign access needs to be granted once. Click “Grant DocuSign access”, sign in and allow.',
        { consentUrl: getConsentUrl(cfg), status: 409 },
      )
    }
    const detail = json.error_description || json.error || `HTTP ${res.status}`
    throw new DocuSignError(`DocuSign auth failed: ${detail}`, { status: 502 })
  }

  cachedToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600),
  }
  return json.access_token
}

function apiBase(cfg: DocuSignConfig): string {
  return `${cfg.basePath}/restapi/v2.1/accounts/${cfg.accountId}`
}

export interface CreateEnvelopeArgs {
  signerName: string
  signerEmail: string
  subject: string
  message?: string
  fileBase64: string
  fileName: string
  signPage: number
}

export interface EnvelopeStatus {
  envelopeId: string
  status: string // created|sent|delivered|completed|declined|voided …
  sentDateTime?: string
  completedDateTime?: string
  declinedReason?: string
}

// Creates and SENDS an envelope with one signer and a signature + date tab on
// the given page. DocuSign emails the signer its secure signing link.
export async function createEnvelope(
  cfg: DocuSignConfig,
  token: string,
  args: CreateEnvelopeArgs,
): Promise<EnvelopeStatus> {
  const page = String(Math.max(1, args.signPage || 1))
  const body = {
    emailSubject: args.subject,
    emailBlurb: args.message || undefined,
    documents: [
      {
        documentBase64: args.fileBase64,
        name: args.fileName,
        fileExtension: 'pdf',
        documentId: '1',
      },
    ],
    recipients: {
      signers: [
        {
          email: args.signerEmail,
          name: args.signerName,
          recipientId: '1',
          routingOrder: '1',
          tabs: {
            signHereTabs: [
              {
                documentId: '1',
                recipientId: '1',
                pageNumber: page,
                xPosition: '72',
                yPosition: '640',
                tabLabel: 'SignHere',
              },
            ],
            dateSignedTabs: [
              {
                documentId: '1',
                recipientId: '1',
                pageNumber: page,
                xPosition: '330',
                yPosition: '648',
                tabLabel: 'DateSigned',
              },
            ],
          },
        },
      ],
    },
    status: 'sent',
    eventNotification: buildEventNotification(),
  }

  const res = await fetch(`${apiBase(cfg)}/envelopes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as {
    envelopeId?: string
    status?: string
    message?: string
    errorCode?: string
  }
  if (!res.ok || !json.envelopeId) {
    throw new DocuSignError(
      `DocuSign could not create the envelope: ${json.message || json.errorCode || `HTTP ${res.status}`}`,
      { status: 502 },
    )
  }
  return { envelopeId: json.envelopeId, status: json.status ?? 'sent' }
}

export type AnchorTabType = 'signHere' | 'initialHere' | 'dateSigned' | 'fullName'

export interface HtmlEnvelopeArgs {
  signerName: string
  signerEmail: string
  subject: string
  message?: string
  html: string
  fileName?: string
  anchorTabs: Array<{ tab: AnchorTabType; anchor: string }>
}

// Groups anchor fields into DocuSign's per-type tab arrays. Each tab attaches
// to its (hidden) anchor string in the document's text layer.
function buildAnchorTabs(fields: Array<{ tab: AnchorTabType; anchor: string }>) {
  const collections: Record<AnchorTabType, string> = {
    signHere: 'signHereTabs',
    initialHere: 'initialHereTabs',
    dateSigned: 'dateSignedTabs',
    fullName: 'fullNameTabs',
  }
  const tabs: Record<string, unknown[]> = {}
  for (const f of fields) {
    const key = collections[f.tab]
    if (!tabs[key]) tabs[key] = []
    tabs[key].push({
      anchorString: f.anchor,
      anchorUnits: 'pixels',
      anchorXOffset: '0',
      anchorYOffset: '-6',
      anchorIgnoreIfNotPresent: 'false',
      anchorAllowWhiteSpaceInCharacters: 'true',
    })
  }
  return tabs
}

// Creates and SENDS an envelope from an HTML document. DocuSign converts the
// HTML to a PDF of record and emails the signer. Signature/initials/date/name
// fields are placed by anchor strings embedded (invisibly) in the HTML.
export async function createEnvelopeFromHtml(
  cfg: DocuSignConfig,
  token: string,
  args: HtmlEnvelopeArgs,
): Promise<EnvelopeStatus> {
  const documentBase64 = Buffer.from(args.html, 'utf8').toString('base64')
  const body = {
    emailSubject: args.subject,
    emailBlurb: args.message || undefined,
    documents: [
      {
        documentBase64,
        name: args.fileName || 'Agreement',
        fileExtension: 'html',
        documentId: '1',
      },
    ],
    recipients: {
      signers: [
        {
          email: args.signerEmail,
          name: args.signerName,
          recipientId: '1',
          routingOrder: '1',
          tabs: buildAnchorTabs(args.anchorTabs),
        },
      ],
    },
    status: 'sent',
    eventNotification: buildEventNotification(),
  }

  const res = await fetch(`${apiBase(cfg)}/envelopes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as {
    envelopeId?: string
    status?: string
    message?: string
    errorCode?: string
  }
  if (!res.ok || !json.envelopeId) {
    throw new DocuSignError(
      `DocuSign could not create the envelope: ${json.message || json.errorCode || `HTTP ${res.status}`}`,
      { status: 502 },
    )
  }
  return { envelopeId: json.envelopeId, status: json.status ?? 'sent' }
}

// Reads the current envelope status. Also fetches the recipient's decline
// reason when the envelope was declined (best-effort).
export async function getEnvelopeStatus(
  cfg: DocuSignConfig,
  token: string,
  envelopeId: string,
): Promise<EnvelopeStatus> {
  const res = await fetch(`${apiBase(cfg)}/envelopes/${envelopeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = (await res.json().catch(() => ({}))) as {
    envelopeId?: string
    status?: string
    sentDateTime?: string
    completedDateTime?: string
    message?: string
  }
  if (!res.ok || !json.status) {
    throw new DocuSignError(
      `Could not read DocuSign status: ${json.message || `HTTP ${res.status}`}`,
      { status: 502 },
    )
  }

  let declinedReason: string | undefined
  if (json.status === 'declined') {
    declinedReason = await getDeclineReason(cfg, token, envelopeId)
  }

  return {
    envelopeId,
    status: json.status,
    sentDateTime: json.sentDateTime,
    completedDateTime: json.completedDateTime,
    declinedReason,
  }
}

async function getDeclineReason(
  cfg: DocuSignConfig,
  token: string,
  envelopeId: string,
): Promise<string | undefined> {
  try {
    const res = await fetch(`${apiBase(cfg)}/envelopes/${envelopeId}/recipients`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return undefined
    const json = (await res.json()) as {
      signers?: Array<{ declinedReason?: string }>
    }
    return json.signers?.find((s) => s.declinedReason)?.declinedReason
  } catch {
    return undefined
  }
}

// Downloads the fully-signed combined PDF (all documents + certificate).
export async function getCombinedDocument(
  cfg: DocuSignConfig,
  token: string,
  envelopeId: string,
): Promise<Uint8Array> {
  const res = await fetch(`${apiBase(cfg)}/envelopes/${envelopeId}/documents/combined`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
  })
  if (!res.ok) {
    throw new DocuSignError(`Could not download signed document: HTTP ${res.status}`, {
      status: 502,
    })
  }
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

// Voids (cancels) a sent envelope so it can no longer be signed.
export async function voidEnvelope(
  cfg: DocuSignConfig,
  token: string,
  envelopeId: string,
  reason: string,
): Promise<void> {
  const res = await fetch(`${apiBase(cfg)}/envelopes/${envelopeId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'voided', voidedReason: reason.slice(0, 200) }),
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string }
    throw new DocuSignError(
      `Could not void the envelope: ${json.message || `HTTP ${res.status}`}`,
      { status: 502 },
    )
  }
}

// Best-effort page count so the signature tab lands on the LAST page (where
// signatures belong on multi-page agreements). Uses pdfjs when it can, with a
// raw-bytes fallback, and defaults to page 1 if all else fails.
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  try {
    // Legacy build runs on the main thread (no worker) — fine for a page count.
    // Typed loosely: the .mjs build's DocumentInitParameters typings are partial.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({
      data: bytes,
      isEvalSupported: false,
      useWorkerFetch: false,
      disableFontFace: true,
      // no worker configured → pdfjs falls back to running inline
    }).promise
    const n = doc.numPages as number
    await doc.destroy()
    if (n && n > 0) return n
  } catch {
    // fall through to the byte-scan fallback
  }
  try {
    const text = Buffer.from(bytes).toString('latin1')
    // Count page objects but not the /Pages tree node.
    const matches = text.match(/\/Type\s*\/Page[^s]/g)
    if (matches && matches.length > 0) return matches.length
  } catch {
    // ignore
  }
  return 1
}
