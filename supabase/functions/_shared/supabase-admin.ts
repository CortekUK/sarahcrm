import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Admin client with service role key — for edge functions only.
 */
export function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
