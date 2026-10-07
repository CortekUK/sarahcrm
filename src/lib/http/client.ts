// Shared CLIENT-SIDE HTTP client for calling this app's own /api routes.
//
// One axios instance so every admin screen talks to the API the same way:
//   - baseURL '/' — paths are relative to the current origin, exactly like the
//     plain fetch('/api/...') calls it replaces.
//   - JSON in / JSON out (axios serialises the body and parses the response).
//   - withCredentials: true — the Supabase session cookie rides along so the
//     routes' requireAdmin / auth checks see the signed-in admin (same-origin
//     requests send it anyway; this just makes the intent explicit).
//
// Unlike fetch, axios REJECTS on any non-2xx status. Our routes answer errors
// as `{ error: string }`, so pair every call with getApiErrorMessage() in the
// catch block to surface that message (or a fallback) in a toast:
//
//   try {
//     const { data } = await apiClient.post<{ ok?: boolean }>('/api/admin/x', { id })
//     ...
//   } catch (e) {
//     toast({ title: 'Failed', description: getApiErrorMessage(e, 'Please try again.') })
//   }
//
// Server code must NOT use this instance (it has no origin to resolve '/'
// against) — server integrations get their own dedicated axios instance
// (e.g. src/lib/enrichment/clay-client.ts).

import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// Turn whatever a failed apiClient call threw into a readable message.
//  - HTTP error with a `{ error }` body → that server message.
//  - HTTP error without one             → the caller's fallback.
//  - No response (offline / timeout)    → the transport error's message.
//  - Anything else                      → its message, else the fallback.
export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (axios.isAxiosError(err)) {
    if (err.response) {
      const data = err.response.data as { error?: unknown } | undefined
      return typeof data?.error === 'string' && data.error ? data.error : fallback
    }
    return err.message || fallback
  }
  return err instanceof Error && err.message ? err.message : fallback
}
