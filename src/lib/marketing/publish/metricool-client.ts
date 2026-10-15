// Minimal SERVER-SIDE client for the Metricool REST API.
//
// Base URL https://app.metricool.com/api. Every request carries:
//   - query params `userId` + `blogId` (blogId = the Metricool "brand"), and
//   - header `X-Mc-Auth: <userToken>` (Metricool → Account Settings → API).
// The API is only available on Metricool's Advanced / Custom plans.
//
// Calls used by the Marketing AI Engine:
//   listBrands()        GET  /admin/simpleProfiles           read-only — the
//                                                            safe "test connection"
//   normalizeMedia(url) GET  /actions/normalize/image/url    Metricool copies a
//                                                            PUBLIC media URL and
//                                                            returns its own URL
//   createPost(body)    POST /v2/scheduler/posts             creates a planner post
//                                                            (draft or scheduled)
// Every function NEVER throws — it resolves with a tagged outcome.
//
// Behaviour:
//   - Config (token, userId, blogId, timezone, mode) is read from env PER
//     REQUEST (never cached at import time). The token is never logged and
//     never returned. Error messages we build carry only the HTTP status +
//     Metricool's own message — never the axios error/config object, which
//     would include the X-Mc-Auth header.
//   - 20s timeout per request (capped to whatever is left of the caller's
//     deadline, when one is passed).
//   - Retries with small backoff (1s, 2s):
//       GET  → on 429 and 5xx (read-only, safe to repeat);
//       POST → on 429 ONLY. A 5xx/timeout on createPost may mean Metricool DID
//              create the post, so repeating it could double-post. We surface
//              the error instead and let the admin check the planner.
//   - METRICOOL_MODE: exactly 'live' → live; ANYTHING else (unset, typo) →
//     'draft'. Drafts land in Metricool's planner and never auto-publish.
//
// Server-only: dedicated axios instance, separate from the browser apiClient
// in src/lib/http.

import axios from 'axios'

const METRICOOL_BASE = 'https://app.metricool.com/api'
const REQUEST_TIMEOUT_MS = 20_000
const RETRY_DELAYS_MS = [1000, 2000]
const TIMEOUT_MESSAGE = 'Metricool did not respond in time.'
const DEFAULT_TIMEZONE = 'Europe/London'

// Auth params/header are attached per call (see request()).
const metricoolHttp = axios.create({
  baseURL: METRICOOL_BASE,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

export type MetricoolMode = 'draft' | 'live'

export interface MetricoolConfig {
  token: string
  userId: string
  blogId: string
  timezone: string
  mode: MetricoolMode
}

// Safe-by-default: only the exact string 'live' turns real publishing on.
export function getMetricoolMode(): MetricoolMode {
  return process.env.METRICOOL_MODE?.trim() === 'live' ? 'live' : 'draft'
}

export function getMetricoolTimezone(): string {
  return process.env.METRICOOL_TIMEZONE?.trim() || DEFAULT_TIMEZONE
}

// Full config, or null when token / userId / blogId aren't all set.
export function getMetricoolConfig(): MetricoolConfig | null {
  const token = process.env.METRICOOL_USER_TOKEN?.trim()
  const userId = process.env.METRICOOL_USER_ID?.trim()
  const blogId = process.env.METRICOOL_BLOG_ID?.trim()
  if (!token || !userId || !blogId) return null
  return { token, userId, blogId, timezone: getMetricoolTimezone(), mode: getMetricoolMode() }
}

export function isMetricoolConfigured(): boolean {
  return getMetricoolConfig() !== null
}

export type MetricoolOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; httpStatus: number | null; message: string }

type Failure = Extract<MetricoolOutcome<unknown>, { ok: false }>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const NOT_CONFIGURED: Failure = {
  ok: false,
  httpStatus: null,
  message: 'Metricool is not configured (METRICOOL_USER_TOKEN, METRICOOL_USER_ID and METRICOOL_BLOG_ID are required).',
}

// Metricool's error body shape isn't documented — pick the first readable
// string field, capped so a large HTML error page can't flood the UI.
function metricoolMessage(data: unknown): string | null {
  if (typeof data === 'string') {
    const text = data.trim()
    return text && !text.startsWith('<') ? text.slice(0, 300) : null
  }
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const key of ['message', 'error', 'detail', 'errorMessage']) {
      if (typeof d[key] === 'string' && d[key]) return (d[key] as string).slice(0, 300)
    }
  }
  return null
}

// Describe a failed request WITHOUT touching err.config (it holds the token).
function toFailure(err: unknown): Failure {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? null
    if (status) {
      const msg = metricoolMessage(err.response?.data)
      if (status === 401 || status === 403) {
        return {
          ok: false,
          httpStatus: status,
          message: `Metricool rejected the credentials (${status}) — check METRICOOL_USER_TOKEN, METRICOOL_USER_ID and METRICOOL_BLOG_ID, and that the account is on an Advanced/Custom plan.${msg ? ` (${msg})` : ''}`,
        }
      }
      return { ok: false, httpStatus: status, message: `Metricool ${status}${msg ? `: ${msg}` : ''}` }
    }
    return {
      ok: false,
      httpStatus: null,
      message:
        err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT'
          ? TIMEOUT_MESSAGE
          : `Metricool request failed: ${err.message}`,
    }
  }
  return { ok: false, httpStatus: null, message: err instanceof Error ? err.message : String(err) }
}

function isRetryable(method: 'get' | 'post', status: number | undefined): boolean {
  if (status === 429) return true
  return method === 'get' && status !== undefined && status >= 500
}

// One authenticated request with retry (see header). `deadline` (epoch ms) is
// optional; when given, each attempt's timeout is capped to the time left and
// a retry is skipped if its backoff would overrun it.
async function request<T>(
  cfg: MetricoolConfig,
  method: 'get' | 'post',
  path: string,
  opts: { params?: Record<string, string>; body?: unknown; deadline?: number } = {},
): Promise<MetricoolOutcome<T>> {
  for (let attempt = 0; ; attempt++) {
    const remaining = opts.deadline ? opts.deadline - Date.now() : REQUEST_TIMEOUT_MS
    if (remaining <= 0) return { ok: false, httpStatus: null, message: TIMEOUT_MESSAGE }
    try {
      const res = await metricoolHttp.request<T>({
        method,
        url: path,
        params: { ...(opts.params ?? {}), userId: cfg.userId, blogId: cfg.blogId },
        data: method === 'post' ? opts.body : undefined,
        headers: { 'X-Mc-Auth': cfg.token },
        timeout: Math.min(REQUEST_TIMEOUT_MS, remaining),
      })
      return { ok: true, data: res.data }
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      if (isRetryable(method, status) && attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt]
        if (!opts.deadline || Date.now() + delay < opts.deadline) {
          await sleep(delay)
          continue
        }
      }
      return toFailure(err)
    }
  }
}

// ── listBrands ──────────────────────────────────────────────────────────────
export interface MetricoolBrand {
  blogId: string
  name: string
}

// ASSUMPTION (undocumented shape): the response is an array of profiles —
// either at the root or under `data` — each with an id (`id` / `blogId`) and a
// display name (`label` / `name` / `title` / `brandName`). Anything we can't
// read is skipped rather than failing the connection test.
function parseBrands(data: unknown): MetricoolBrand[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
      ? ((data as { data: unknown[] }).data)
      : []
  const out: MetricoolBrand[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const rawId = r.id ?? r.blogId
    if (typeof rawId !== 'string' && typeof rawId !== 'number') continue
    const rawName = r.label ?? r.name ?? r.title ?? r.brandName
    out.push({ blogId: String(rawId), name: typeof rawName === 'string' && rawName ? rawName : `Brand ${rawId}` })
  }
  return out
}

// Read-only. The safe first call to prove the credentials work.
export async function listBrands(): Promise<MetricoolOutcome<MetricoolBrand[]>> {
  const cfg = getMetricoolConfig()
  if (!cfg) return NOT_CONFIGURED
  const res = await request<unknown>(cfg, 'get', '/admin/simpleProfiles')
  if (!res.ok) return res
  return { ok: true, data: parseBrands(res.data) }
}

// ── normalizeMedia ──────────────────────────────────────────────────────────
// ASSUMPTION (undocumented shape): the normalized URL comes back either as a
// bare string (plain text or JSON string) or in one of `url`, `data`,
// `data.url`, `mediaUrl`, `normalizedUrl`. Anything else is a failure so we
// never post with a missing image.
function parseNormalizedUrl(data: unknown): string | null {
  const isUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v.trim())
  if (isUrl(data)) return data.trim()
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const key of ['url', 'data', 'mediaUrl', 'normalizedUrl']) {
      if (isUrl(d[key])) return (d[key] as string).trim()
    }
    const nested = d.data
    if (nested && typeof nested === 'object') {
      const n = nested as Record<string, unknown>
      if (isUrl(n.url)) return (n.url as string).trim()
    }
  }
  return null
}

// Hand Metricool a PUBLIC media URL; returns Metricool's own copy of it (the
// URL that goes in a post's `media` array).
export async function normalizeMedia(
  url: string,
  deadline?: number,
): Promise<MetricoolOutcome<string>> {
  const cfg = getMetricoolConfig()
  if (!cfg) return NOT_CONFIGURED
  const res = await request<unknown>(cfg, 'get', '/actions/normalize/image/url', {
    params: { url },
    deadline,
  })
  if (!res.ok) return res
  const normalized = parseNormalizedUrl(res.data)
  if (!normalized) {
    return {
      ok: false,
      httpStatus: null,
      message: 'Metricool did not return a usable media URL when importing the graphic.',
    }
  }
  return { ok: true, data: normalized }
}

// ── createPost ──────────────────────────────────────────────────────────────
export interface MetricoolCreatedPost {
  // Best-effort id; null when we can't find one in the (undocumented) reply.
  postId: string | null
  // The raw reply, kept so it can be stored in publish_target for debugging.
  raw: unknown
}

// ASSUMPTION (undocumented shape): the post id is at `id`, `data.id`,
// `postId`, `data.postId` or `uuid`.
function parsePostId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const nested = d.data && typeof d.data === 'object' ? (d.data as Record<string, unknown>) : {}
  for (const v of [d.id, nested.id, d.postId, nested.postId, d.uuid, nested.uuid]) {
    if (typeof v === 'string' && v) return v
    if (typeof v === 'number') return String(v)
  }
  return null
}

// Create a planner post. Whether it is a DRAFT or a scheduled LIVE post is
// decided entirely by the body (`draft` / `autoPublish`) — see
// buildMetricoolPostBody in ./metricool.ts.
export async function createPost(
  body: Record<string, unknown>,
  deadline?: number,
): Promise<MetricoolOutcome<MetricoolCreatedPost>> {
  const cfg = getMetricoolConfig()
  if (!cfg) return NOT_CONFIGURED
  const res = await request<unknown>(cfg, 'post', '/v2/scheduler/posts', { body, deadline })
  if (!res.ok) return res
  return { ok: true, data: { postId: parsePostId(res.data), raw: res.data ?? null } }
}
