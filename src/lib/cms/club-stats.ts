// Server-side reader for the 'club_stats' app_settings row.
//
// app_settings is admin-only under RLS, so the public pages read it with the
// service-role client — ONLY this one key is ever selected, and only the
// normalised public figures are returned. Pages that render it use ISR
// (homepage revalidate=60, /about revalidate=300) and the admin editor calls
// /api/admin/revalidate on save, so edits show straight away.
//
// Fail-soft: any error (row missing, migration not yet applied, env missing)
// returns the built-in defaults so the page never blanks.

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { DEFAULT_CLUB_STATS, normaliseClubStats, type ClubStats } from './club-stats-shared'

export { DEFAULT_CLUB_STATS, formatPct } from './club-stats-shared'
export type { ClubStats, StatTile, StatBar, ChannelCount } from './club-stats-shared'

export async function getClubStats(): Promise<ClubStats> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return DEFAULT_CLUB_STATS
  try {
    const admin = createSupabaseAdminClient(url, key, { auth: { persistSession: false } })
    const { data, error } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'club_stats')
      .maybeSingle()
    if (error || !data) return DEFAULT_CLUB_STATS
    return normaliseClubStats((data as { value: unknown }).value)
  } catch (e) {
    console.error('[club-stats] read failed', e)
    return DEFAULT_CLUB_STATS
  }
}
