// Xero OAuth2 client — Authorization Code flow, no SDK.
//
// Unlike DocuSign (which uses a JWT Bearer grant for server-to-server auth with
// a one-time consent), Xero uses the standard OAuth2 Authorization Code flow:
// an admin is redirected to Xero to grant access, Xero redirects back with a
// `code`, and we exchange that code for an access_token + refresh_token. We did
// NOT reuse DocuSign's JWT pattern — Xero has no equivalent server-to-server
// grant for the Accounting API; every connection is user-authorized.
//
// KEY DETAIL — refresh-token rotation: access_tokens are short-lived (~30 min).
// When we refresh, Xero returns a BRAND NEW refresh_token and INVALIDATES the
// old one. We MUST persist the rotated refresh_token every time, or the next
// refresh will fail and the connection breaks. `getValidAccessToken` handles
// this: it refreshes just-before-expiry and immediately saves the new tokens.
//
// Everything talks to Xero's REST endpoints directly with `fetch` (same style
// as the DocuSign client) — the `xero-node` SDK is intentionally NOT added.
//
// Env vars (already configured, never printed here):
//   XERO_CLIENT_ID       OAuth2 client id
//   XERO_CLIENT_SECRET   OAuth2 client secret (HTTP Basic on the token endpoint)
//   XERO_REDIRECT_URI    registered callback (…/api/xero/callback)
//   XERO_SCOPES          space-delimited scopes (must include offline_access)
//
// Tokens are stored as plaintext jsonb in the `app_settings` table under
// key='xero_oauth', behind admin-only RLS. No encryption helper exists in this
// repo, so this is the accepted storage model for now.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// --- Xero OAuth2 endpoints ---------------------------------------------------
const AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize'
const TOKEN_URL = 'https://identity.xero.com/connect/token'
const CONNECTIONS_URL = 'https://api.xero.com/connections'
const API_BASE = 'https://api.xero.com'

const APP_SETTINGS_KEY = 'xero_oauth'

// A Supabase client with enough typing to read/write `app_settings`. Callers
// pass in the service-role client (admin RLS bypass).
type XeroDb = SupabaseClient<Database>

export interface XeroConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string
}

// Raw token payload as returned by Xero's token endpoint.
export interface XeroTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope?: string
  id_token?: string
}

// One entry from GET /connections.
export interface XeroConnection {
  id: string
  tenantId: string
  tenantName: string
  tenantType: string
  createdDateUtc?: string
  updatedDateUtc?: string
}

// The shape we persist in app_settings.value.
export interface StoredXeroTokens {
  access_token: string
  refresh_token: string
  expires_at: string // ISO 8601
  tenant_id: string
  tenant_name: string
  connected_at: string // ISO 8601
}

// Thrown when no Xero tokens are stored (i.e. the CRM isn't connected yet).
export class XeroNotConnectedError extends Error {
  constructor(message = 'Xero is not connected.') {
    super(message)
    this.name = 'XeroNotConnectedError'
  }
}

/** Read + validate the four XERO_* env vars. Throws if any is missing. */
export function getXeroConfig(): XeroConfig {
  const clientId = process.env.XERO_CLIENT_ID
  const clientSecret = process.env.XERO_CLIENT_SECRET
  const redirectUri = process.env.XERO_REDIRECT_URI
  const scopes = process.env.XERO_SCOPES

  const missing: string[] = []
  if (!clientId) missing.push('XERO_CLIENT_ID')
  if (!clientSecret) missing.push('XERO_CLIENT_SECRET')
  if (!redirectUri) missing.push('XERO_REDIRECT_URI')
  if (!scopes) missing.push('XERO_SCOPES')
  if (missing.length > 0) {
    throw new Error(`Missing Xero env var(s): ${missing.join(', ')}`)
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    scopes: scopes!,
  }
}

/** Build the Xero authorize URL for the OAuth2 redirect. */
export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri, scopes } = getXeroConfig()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

/** HTTP Basic auth header value for the token endpoint. */
function basicAuthHeader(cfg: XeroConfig): string {
  const encoded = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')
  return `Basic ${encoded}`
}

async function postToken(body: URLSearchParams): Promise<XeroTokenResponse> {
  const cfg = getXeroConfig()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(cfg),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Xero token request failed (${res.status}): ${errBody}`)
  }
  return (await res.json()) as XeroTokenResponse
}

/** Exchange an authorization `code` for tokens. */
export async function exchangeCodeForTokens(code: string): Promise<XeroTokenResponse> {
  const { redirectUri } = getXeroConfig()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
  return postToken(body)
}

/**
 * Refresh the access token. Returns new tokens INCLUDING the rotated
 * refresh_token — persist it immediately (see getValidAccessToken).
 */
export async function refreshAccessToken(refreshToken: string): Promise<XeroTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  return postToken(body)
}

/** GET /connections — the tenants this access token can act on. */
export async function getConnections(accessToken: string): Promise<XeroConnection[]> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Xero connections request failed (${res.status}): ${errBody}`)
  }
  return (await res.json()) as XeroConnection[]
}

// --- Persistence against app_settings ---------------------------------------

/** Load stored tokens, or null if the CRM isn't connected. */
export async function loadXeroTokens(db: XeroDb): Promise<StoredXeroTokens | null> {
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('key', APP_SETTINGS_KEY)
    .maybeSingle()
  if (error) throw new Error(`Failed to load Xero tokens: ${error.message}`)
  if (!data || !data.value) return null
  const value = data.value as unknown as Partial<StoredXeroTokens>
  if (!value.access_token || !value.refresh_token) return null
  return value as StoredXeroTokens
}

/**
 * Persist tokens. Accepts a fresh Xero token response plus the tenant identity;
 * computes expires_at from expires_in. `connectedAt` lets a refresh preserve
 * the original connection time.
 */
export async function saveXeroTokens(
  db: XeroDb,
  params: {
    tokens: XeroTokenResponse
    tenantId: string
    tenantName: string
    connectedAt?: string
  },
): Promise<StoredXeroTokens> {
  const now = Date.now()
  const stored: StoredXeroTokens = {
    access_token: params.tokens.access_token,
    refresh_token: params.tokens.refresh_token,
    expires_at: new Date(now + params.tokens.expires_in * 1000).toISOString(),
    tenant_id: params.tenantId,
    tenant_name: params.tenantName,
    connected_at: params.connectedAt ?? new Date(now).toISOString(),
  }
  const { error } = await db.from('app_settings').upsert(
    {
      key: APP_SETTINGS_KEY,
      value: stored as unknown as Database['public']['Tables']['app_settings']['Insert']['value'],
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: 'key' },
  )
  if (error) throw new Error(`Failed to save Xero tokens: ${error.message}`)
  return stored
}

/** Delete stored tokens (disconnect). */
export async function clearXeroTokens(db: XeroDb): Promise<void> {
  const { error } = await db.from('app_settings').delete().eq('key', APP_SETTINGS_KEY)
  if (error) throw new Error(`Failed to clear Xero tokens: ${error.message}`)
}

const EXPIRY_SKEW_MS = 60_000 // refresh if within 60s of expiry

/**
 * Resolve a valid access token, refreshing (and persisting the rotated tokens)
 * when the stored one is at/near expiry. This is the function every future Xero
 * API call should use.
 */
export async function getValidAccessToken(
  db: XeroDb,
): Promise<{ accessToken: string; tenantId: string }> {
  const stored = await loadXeroTokens(db)
  if (!stored) throw new XeroNotConnectedError()

  const expiresAtMs = new Date(stored.expires_at).getTime()
  const needsRefresh = !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() <= EXPIRY_SKEW_MS

  if (!needsRefresh) {
    return { accessToken: stored.access_token, tenantId: stored.tenant_id }
  }

  const refreshed = await refreshAccessToken(stored.refresh_token)
  const saved = await saveXeroTokens(db, {
    tokens: refreshed,
    tenantId: stored.tenant_id,
    tenantName: stored.tenant_name,
    connectedAt: stored.connected_at,
  })
  return { accessToken: saved.access_token, tenantId: saved.tenant_id }
}

/**
 * Convenience wrapper for calling the Xero API with a valid token + the tenant
 * header. Foundation for later chunks (invoice/contact sync) — nothing calls it
 * yet in this connection-only chunk.
 */
export async function xeroApiFetch(
  db: XeroDb,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { accessToken, tenantId } = await getValidAccessToken(db)
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  headers.set('Xero-tenant-id', tenantId)
  headers.set('Accept', 'application/json')
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}
