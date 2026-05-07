import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\s+/g, ''),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim().replace(/\s+/g, '')
  )
}

// Lazy singleton — deferred so it doesn't throw during static page generation
// when NEXT_PUBLIC_* env vars aren't available at build time
let _supabase: ReturnType<typeof createClient> | null = null
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    if (!_supabase) _supabase = createClient()
    return (_supabase as unknown as Record<string | symbol, unknown>)[prop]
  },
})
