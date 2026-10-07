// Minimal SERVER-SIDE client for Clay's Public Search API (synchronous).
//
// A search is two calls against https://api.clay.com/public/v0:
//   1. POST /search/query-mode            { query }  → { search_id, source_type }
//   2. POST /search/query-mode/{id}/run   { limit }  → { data, has_more, period_quota }
// runSearch() does both and NEVER throws — it resolves with a tagged outcome so
// ClayProvider can map it onto the enrichment contract.
//
// Behaviour:
//   - Auth header `clay-api-key` from CLAY_API_KEY, read per request (never
//     cached at import time, never logged). Error messages we build carry only
//     the HTTP status + Clay's `message` — never the axios error/config object,
//     which would include the key header.
//   - Timeouts, sized from live testing:
//       create step  20s (it only compiles the query — not the slow part);
//       run step     45s (people searches measured at ~16–25s — a 20s cap
//                         cut them off; company searches are much faster).
//   - Overall budget of 50s per runSearch() (create + run + any retries), so
//     one search always finishes inside the routes' maxDuration = 60. Each
//     request's timeout is also capped to whatever budget is left.
//   - 429 "Too many concurrent requests" → retried with backoff (1.5s, 3s, 6s),
//     but only if the elapsed time + the delay + a realistic remaining time
//     (≈3s per create, ≈25s per run) still fits the budget; otherwise we give
//     up with the same "did not respond in time" message as a timeout.
//   - 400 "No matching companies found for the provided identifiers." is
//     Clay's answer when clay.include_company_identifiers / filter_to_companies
//     get a domain it doesn't know (seen live for an unknown domain). That is
//     a NOT-FOUND, not a failure, so it resolves as ok with zero rows —
//     enrichment records 'not_found' and decision-maker search shows "none
//     found". Any other 400 stays an error.
//   - 402 → search quota exhausted for the period (kind: 'quota_exhausted').
//     Clay's Search API is metered by a per-period search QUOTA, not credits.
//
// Server-only: dedicated axios instance, separate from the browser apiClient
// in src/lib/http.

import axios from 'axios'

const CLAY_BASE = 'https://api.clay.com/public/v0'
const CREATE_TIMEOUT_MS = 20_000
const RUN_TIMEOUT_MS = 45_000
export const SEARCH_BUDGET_MS = 50_000
// Realistic durations used only to decide whether a 429 retry can still fit.
const EXPECTED_CREATE_MS = 3_000
const EXPECTED_RUN_MS = 25_000
const RETRY_DELAYS_MS = [1500, 3000, 6000]
const TIMEOUT_MESSAGE = 'Clay did not respond in time.'

// Per-request timeouts are passed on each call (see postWithRetry).
const clayHttp = axios.create({
  baseURL: CLAY_BASE,
  headers: { 'Content-Type': 'application/json' },
})

// Thrown when the overall search budget can't cover another attempt.
class ClayBudgetExceeded extends Error {
  constructor() {
    super(TIMEOUT_MESSAGE)
  }
}

export interface ClayQuota {
  limit: number
  used: number
  remaining: number
  resets_at: string
}

export type ClaySearchOutcome<Row> =
  | { ok: true; rows: Row[]; hasMore: boolean; quota: ClayQuota | null }
  | {
      ok: false
      kind: 'quota_exhausted' | 'error'
      httpStatus: number | null
      message: string
    }

type Failure = Extract<ClaySearchOutcome<unknown>, { ok: false }>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Clay's "unknown company identifier" 400 (see header) — an empty result.
function isNoMatchingCompanies(err: unknown): boolean {
  if (!axios.isAxiosError(err) || err.response?.status !== 400) return false
  const body = err.response.data as { message?: unknown } | undefined
  return typeof body?.message === 'string' && /no matching compan/i.test(body.message)
}

// Describe a failed request WITHOUT touching err.config (it holds the key).
function toFailure(err: unknown): Failure {
  if (err instanceof ClayBudgetExceeded) {
    return { ok: false, kind: 'error', httpStatus: null, message: TIMEOUT_MESSAGE }
  }
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? null
    const body = err.response?.data as { message?: unknown } | undefined
    const clayMessage = typeof body?.message === 'string' ? body.message : null
    if (status === 402) {
      return {
        ok: false,
        kind: 'quota_exhausted',
        httpStatus: 402,
        message:
          'The Clay search quota for this period is used up — searches will work again once it resets (or after a plan upgrade).',
      }
    }
    if (status) {
      return {
        ok: false,
        kind: 'error',
        httpStatus: status,
        message: `Clay ${status}${clayMessage ? `: ${clayMessage}` : ''}`,
      }
    }
    return {
      ok: false,
      kind: 'error',
      httpStatus: null,
      message:
        err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT'
          ? TIMEOUT_MESSAGE
          : `Clay request failed: ${err.message}`,
    }
  }
  return {
    ok: false,
    kind: 'error',
    httpStatus: null,
    message: err instanceof Error ? err.message : String(err),
  }
}

// POST with the API key, retrying only on 429 (concurrency limit), within the
// search's deadline. `timeoutMs` is the step's own cap; `expectedAfterMs` is
// the realistic time this step + any later steps still need, used to decide
// whether a retry can fit before the deadline.
async function postWithRetry<T>(
  path: string,
  body: unknown,
  opts: { timeoutMs: number; deadline: number; expectedAfterMs: number },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const remaining = opts.deadline - Date.now()
    if (remaining <= 0) throw new ClayBudgetExceeded()
    try {
      const res = await clayHttp.post<T>(path, body, {
        headers: { 'clay-api-key': process.env.CLAY_API_KEY ?? '' },
        timeout: Math.min(opts.timeoutMs, remaining),
      })
      return res.data
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      if (status === 429 && attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt]
        if (Date.now() + delay + opts.expectedAfterMs > opts.deadline) {
          throw new ClayBudgetExceeded()
        }
        await sleep(delay)
        continue
      }
      throw err
    }
  }
}

// Create + run one Clay search. `limit` is clamped to Clay's 1–500 range.
// `budgetMs` (default 50s) bounds the whole call, retries included; callers
// running several searches in one request can pass what they have left.
export async function runSearch<Row>(
  query: string,
  limit: number,
  budgetMs: number = SEARCH_BUDGET_MS,
): Promise<ClaySearchOutcome<Row>> {
  if (!process.env.CLAY_API_KEY) {
    return { ok: false, kind: 'error', httpStatus: null, message: 'CLAY_API_KEY is not set.' }
  }
  const deadline = Date.now() + Math.min(budgetMs, SEARCH_BUDGET_MS)
  try {
    const created = await postWithRetry<{ search_id?: string }>(
      '/search/query-mode',
      { query },
      { timeoutMs: CREATE_TIMEOUT_MS, deadline, expectedAfterMs: EXPECTED_CREATE_MS + EXPECTED_RUN_MS },
    )
    const searchId = created?.search_id
    if (!searchId) {
      return {
        ok: false,
        kind: 'error',
        httpStatus: null,
        message: 'Clay did not return a search id.',
      }
    }
    const run = await postWithRetry<{
      data?: Row[] | null
      has_more?: boolean
      period_quota?: ClayQuota | null
    }>(
      `/search/query-mode/${encodeURIComponent(searchId)}/run`,
      { limit: Math.min(500, Math.max(1, Math.floor(limit))) },
      { timeoutMs: RUN_TIMEOUT_MS, deadline, expectedAfterMs: EXPECTED_RUN_MS },
    )
    return {
      ok: true,
      rows: Array.isArray(run?.data) ? run.data : [],
      hasMore: !!run?.has_more,
      quota: run?.period_quota ?? null,
    }
  } catch (err) {
    // Either step may reject an unknown domain this way — treat as no rows.
    if (isNoMatchingCompanies(err)) {
      return { ok: true, rows: [], hasMore: false, quota: null }
    }
    return toFailure(err)
  }
}
