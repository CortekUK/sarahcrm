// Gmail sync control surface config.
//
// Stored in app_settings key `gmail_sync_config`. This is the admin-facing
// control surface: a master switch, which inboxes to sync, how far back, and
// whether to apply the noise filter. Everything defaults OFF so nothing reads
// any inbox until an admin explicitly enables it.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface SyncInbox {
  email: string
  label: string
  enabled: boolean
}

export interface GmailSyncConfig {
  enabled: boolean // master switch
  inboxes: SyncInbox[]
  historyMonths: number // how many months back to sync
  noiseFilter: boolean
}

const SETTINGS_KEY = 'gmail_sync_config'

export const DEFAULT_SYNC_CONFIG: GmailSyncConfig = {
  enabled: false,
  historyMonths: 24,
  noiseFilter: true,
  inboxes: [
    { email: 'sarah@theclubgroup.co', label: 'Sarah', enabled: false },
    { email: 'leanne@theclubbysarahrestrick.com', label: 'Leanne', enabled: false },
    { email: 'events@theclubbysarahrestrick.com', label: 'Events', enabled: false },
    { email: 'membership@theclubbysarahrestrick.com', label: 'Membership', enabled: false },
    { email: 'legal@theclubbysarahrestrick.com', label: 'Legal', enabled: false },
    { email: 'accounts@theclubbysarahrestrick.com', label: 'Accounts', enabled: false },
    { email: 'pa@sarahrestrick.com', label: 'PA', enabled: false },
  ],
}

// Read the stored config, defensively merging a stored partial over the
// defaults so newly-added fields never break older stored values.
export async function getSyncConfig(
  db: SupabaseClient<Database>,
): Promise<GmailSyncConfig> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  const stored = data?.value
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return DEFAULT_SYNC_CONFIG
  }

  const s = stored as Record<string, unknown>

  const inboxes = Array.isArray(s.inboxes)
    ? (s.inboxes as unknown[])
        .filter(
          (i): i is Record<string, unknown> =>
            !!i && typeof i === 'object' && !Array.isArray(i),
        )
        .map((i) => ({
          email: typeof i.email === 'string' ? i.email : '',
          label: typeof i.label === 'string' ? i.label : '',
          enabled: i.enabled === true,
        }))
        .filter((i) => i.email)
    : DEFAULT_SYNC_CONFIG.inboxes

  return {
    enabled: s.enabled === true,
    inboxes: inboxes.length ? inboxes : DEFAULT_SYNC_CONFIG.inboxes,
    historyMonths:
      typeof s.historyMonths === 'number' && Number.isFinite(s.historyMonths)
        ? s.historyMonths
        : DEFAULT_SYNC_CONFIG.historyMonths,
    noiseFilter: s.noiseFilter === undefined ? DEFAULT_SYNC_CONFIG.noiseFilter : s.noiseFilter === true,
  }
}

export async function saveSyncConfig(
  db: SupabaseClient<Database>,
  cfg: GmailSyncConfig,
): Promise<void> {
  await db
    .from('app_settings')
    .upsert(
      { key: SETTINGS_KEY, value: cfg as unknown as Database['public']['Tables']['app_settings']['Insert']['value'] },
      { onConflict: 'key' },
    )
}
