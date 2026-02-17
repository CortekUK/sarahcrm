import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '../../types/database'

export function createClient() {
  return createBrowserClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  )
}

// Singleton for use throughout the app
export const supabase = createClient()
