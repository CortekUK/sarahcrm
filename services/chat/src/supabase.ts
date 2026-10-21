// Service-role Supabase client. Bypasses RLS — every permission check
// therefore lives in policy.ts, never in the database.
import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

export const ATTACHMENT_BUCKET = 'chat-attachments'
/** Member Feed photos (private): `main/<file>` or `<groupId>/<file>`. */
export const FEED_BUCKET = 'feed-media'

/** Throw on a PostgREST error so callers can stay linear. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}
