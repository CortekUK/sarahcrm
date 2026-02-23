import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '../../types/database'

export function createClient() {
  return createBrowserClient<Database>(
    (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\s+/g, ''),
    (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim().replace(/\s+/g, '')
  )
}

// Singleton for use throughout the app
export const supabase = createClient()
