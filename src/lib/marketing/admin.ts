// Shared admin helpers for the Marketing AI Engine API routes.
//
// Mirrors the auth + service-role pattern established in
// src/app/api/templates/ai-generate/route.ts:
//   * requireAdmin() — verifies the caller is an authenticated admin
//     (API routes are NOT covered by the /dashboard middleware gate).
//   * getAdmin()     — service-role client for privileged writes. It is
//     intentionally UNtyped (no Database generic) so the new marketing_*
//     tables — which aren't in the generated types yet — are queryable
//     without type friction.

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export function getAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

interface AdminProfile {
  id: string
  role: string
  first_name: string | null
  last_name: string | null
}

export async function requireAdmin(): Promise<
  { profile: AdminProfile } | { error: string; status: 401 | 403 }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, first_name, last_name')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'This action is restricted to admin users.', status: 403 }
  }
  return { profile: profile as AdminProfile }
}
