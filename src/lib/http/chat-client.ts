// Browser HTTP client for the member chat service (services/chat on Railway).
//
// A dedicated axios instance — separate from apiClient — because the chat
// server lives on another origin (NEXT_PUBLIC_CHAT_URL) and authenticates with
// a Supabase access token in `Authorization: Bearer`, not the session cookie.
// The token is read fresh from supabase.auth.getSession() on EVERY request so
// a refreshed token is always the one sent. Errors come back as
// `{ error: string }` — pair calls with getApiErrorMessage() as elsewhere.
//
// When NEXT_PUBLIC_CHAT_URL is unset, `chatEnabled` is false and the UI hides
// chat entirely; nothing should call chatClient in that case.

import axios from 'axios'
import { supabase } from '@/lib/supabase/client'

export { getApiErrorMessage } from './client'

export const CHAT_URL = (process.env.NEXT_PUBLIC_CHAT_URL ?? '').trim().replace(/\/+$/, '')
export const chatEnabled = CHAT_URL.length > 0

export const chatClient = axios.create({
  baseURL: CHAT_URL || undefined,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
})

chatClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

// 401/403 → the viewer can't use chat (signed out, lapsed membership).
export function isChatAuthError(err: unknown): boolean {
  return axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)
}
