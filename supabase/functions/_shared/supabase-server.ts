import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Server client for edge functions using the anon key + user JWT.
 * Respects RLS policies.
 */
export function createSupabaseServerClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: { Authorization: authHeader },
      },
    }
  )
}
